import { prisma } from "@/lib/prisma";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

const GRAPH = "https://graph.facebook.com/v21.0";

// Dia atual (00:00 BRT) como Date — chave do snapshot diário.
function diaHojeBRT(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s}T00:00:00-03:00`);
}

// Grava (upsert) o snapshot de HOJE pra marca — 1 linha por dia. Atualiza se já existe
// (pega o valor mais recente do dia). NÃO é server action: só código do servidor chama.
export async function gravarSnapshot(marcaId: string, seguidores: number, posts: number): Promise<void> {
  const dia = diaHojeBRT();
  await prisma.metricaMarca
    .upsert({
      where: { marcaId_dia: { marcaId, dia } },
      update: { seguidores, posts },
      create: { marcaId, dia, seguidores, posts },
    })
    .catch(() => {});
}

// Busca seguidores/posts da conta na Meta (instagram_basic — sem permissão extra) e
// grava o snapshot do dia. Usado pelo piloto (cron). Best-effort: erro vira null.
export async function snapshotDeMarca(marca: { id: string; igUserId: string; accessToken: string }): Promise<void> {
  if (!marca.igUserId || !marca.accessToken) return;
  try {
    const r = await fetch(`${GRAPH}/${marca.igUserId}?fields=followers_count,media_count&access_token=${marca.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { followers_count?: number; media_count?: number; error?: unknown };
    if (typeof j.followers_count === "number") {
      await gravarSnapshot(marca.id, j.followers_count, typeof j.media_count === "number" ? j.media_count : 0);
    }
  } catch {
    /* ignora — snapshot é best-effort */
  }
}

// Verifica a validade do token (debug_token) e, se estiver VENCENDO (<=14 dias) ou já
// vencido, registra UM alerta nas Atividades — pro dono reconectar antes de o piloto
// parar de postar. Rodado pelo cron (de hora em hora), mas com de-dupe: no máximo 1 aviso
// por marca a cada ~20h, pra não encher a lista. Token de System User (expires_at = 0)
// não expira → nada a fazer. Best-effort: nunca derruba o piloto.
export async function alertarTokenSeVencendo(marca: { id: string; nome: string; igUserId: string | null; accessToken: string | null }): Promise<void> {
  if (!marca.igUserId || !marca.accessToken) return;
  try {
    const d = await fetch(`${GRAPH}/debug_token?input_token=${marca.accessToken}&access_token=${marca.accessToken}`, { cache: "no-store" });
    const dj = (await d.json()) as { data?: { expires_at?: number } };
    const exp = dj.data?.expires_at;
    if (typeof exp !== "number" || exp <= 0) return; // não expira ou desconhecido
    const dias = Math.ceil((exp * 1000 - Date.now()) / 86_400_000);
    if (dias > 14) return; // ainda longe — não alerta

    // De-dupe: já avisou nas últimas ~20h? (o cron roda toda hora; 1 alerta/dia basta)
    const recente = await prisma.atividadeAgente.findFirst({
      where: { marcaId: marca.id, texto: { contains: "token do Instagram" }, criadoEm: { gte: new Date(Date.now() - 20 * 3_600_000) } },
      select: { id: true },
    });
    if (recente) return;

    const texto =
      dias <= 0
        ? `⚠️ O token do Instagram de ${marca.nome} VENCEU — reconecte em Configurações pra o piloto voltar a postar.`
        : `⏳ O token do Instagram de ${marca.nome} vence em ${dias} ${dias === 1 ? "dia" : "dias"} — reconecte em Configurações antes disso.`;
    await registrarAtividade(AGENTE, texto, marca.id);
  } catch {
    /* best-effort */
  }
}

// === Insights por post (engajamento — Camada 2) ======================================

type Insights = { curtidas?: number; comentarios?: number; alcance?: number; salvamentos?: number };

// Busca o engajamento de UM post no Instagram. Curtidas/comentários vêm dos campos da
// mídia (permissão básica); alcance/salvamentos exigem instagram_manage_insights. Story
// só tem alcance (= visualizações) e some em 24h. Devolve só o que a Meta retornou.
async function buscarInsights(token: string, mediaId: string, ehStory: boolean): Promise<Insights | null> {
  const out: Insights = {};
  try {
    if (!ehStory) {
      const m = await fetch(`${GRAPH}/${mediaId}?fields=like_count,comments_count&access_token=${token}`, { cache: "no-store" });
      const mj = (await m.json()) as { like_count?: number; comments_count?: number };
      if (typeof mj.like_count === "number") out.curtidas = mj.like_count;
      if (typeof mj.comments_count === "number") out.comentarios = mj.comments_count;
    }
    const metric = ehStory ? "reach" : "reach,saved";
    const i = await fetch(`${GRAPH}/${mediaId}/insights?metric=${metric}&access_token=${token}`, { cache: "no-store" });
    const ij = (await i.json()) as { data?: { name?: string; values?: { value?: number }[] }[] };
    for (const d of ij.data || []) {
      const v = d.values?.[0]?.value;
      if (typeof v !== "number") continue;
      if (d.name === "reach") out.alcance = v;
      if (d.name === "saved") out.salvamentos = v;
    }
    return out;
  } catch {
    return null;
  }
}

// Coleta o engajamento dos posts recentes da marca (chamado pelo cron, de hora em hora).
// - Feed/Carrossel: posts dos últimos 14 dias, re-medindo os que não foram medidos há >3h.
// - Story: só dentro de 24h (some depois) — fora disso, mantém o último número congelado.
// Best-effort: qualquer erro é engolido (nunca derruba o piloto).
export async function coletarInsightsDaMarca(marca: { id: string; igUserId: string | null; accessToken: string | null }): Promise<void> {
  if (!marca.igUserId || !marca.accessToken) return;
  const token = marca.accessToken;
  const agora = Date.now();
  const desde14 = new Date(agora - 14 * 86_400_000);
  const stale = new Date(agora - 3 * 3_600_000); // re-mede se foi medido há mais de 3h

  try {
    const conteudos = await prisma.conteudo.findMany({
      where: { marcaId: marca.id, status: "postado", mediaId: { not: null }, postadoEm: { gte: desde14 }, OR: [{ insightsEm: null }, { insightsEm: { lt: stale } }] },
      select: { id: true, mediaId: true },
      take: 20,
    });
    for (const c of conteudos) {
      const ins = await buscarInsights(token, c.mediaId!, false);
      if (ins) await prisma.conteudo.update({ where: { id: c.id }, data: { ...ins, insightsEm: new Date() } }).catch(() => {});
    }

    const pubs = await prisma.publicacao.findMany({
      where: { marcaId: marca.id, status: "postado", mediaId: { not: null }, postadoEm: { gte: desde14 }, OR: [{ insightsEm: null }, { insightsEm: { lt: stale } }] },
      select: { id: true, mediaId: true, formato: true, postadoEm: true },
      take: 20,
    });
    for (const p of pubs) {
      const ehStory = p.formato === "story";
      // Story some em 24h — depois disso a API não devolve mais; não tenta (mantém o último).
      if (ehStory && p.postadoEm && agora - p.postadoEm.getTime() > 24 * 3_600_000) continue;
      const ins = await buscarInsights(token, p.mediaId!, ehStory);
      if (ins) await prisma.publicacao.update({ where: { id: p.id }, data: { ...ins, insightsEm: new Date() } }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}
