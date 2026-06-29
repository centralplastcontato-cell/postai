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
export async function buscarInsights(token: string, mediaId: string, ehStory: boolean): Promise<Insights | null> {
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

// === Backfill: vincular posts ANTIGOS (publicados antes de termos o mediaId) ============

export type MidiaIG = { id: string; caption?: string; timestamp?: string };

function normCaption(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

// Lista as mídias (posts/carrosséis) da conta no Instagram — pagina até ~5x100. Stories
// NÃO entram aqui (a API /media só traz o feed permanente).
export async function buscarMidiasDaConta(igUserId: string, token: string, maxPaginas = 5): Promise<MidiaIG[]> {
  const out: MidiaIG[] = [];
  let url = `${GRAPH}/${igUserId}/media?fields=id,caption,timestamp&limit=100&access_token=${token}`;
  for (let pagina = 0; pagina < maxPaginas && url; pagina++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as { data?: MidiaIG[]; paging?: { next?: string } };
      if (Array.isArray(j.data)) out.push(...j.data);
      url = j.paging?.next || "";
    } catch {
      break;
    }
  }
  return out;
}

// Acha a mídia do Instagram que corresponde a um post nosso, por legenda + horário.
// Prioriza o casamento da legenda; horário muito próximo (±30min) também serve de reforço.
function melhorMidia(legenda: string, tRec: number, midias: MidiaIG[], usados: Set<string>): MidiaIG | null {
  const ourKey = normCaption(legenda);
  let best: MidiaIG | null = null;
  let bestScore = Infinity;
  for (const m of midias) {
    if (usados.has(m.id) || !m.timestamp) continue;
    const tM = new Date(m.timestamp).getTime();
    if (!Number.isFinite(tM)) continue;
    const diff = Math.abs(tM - tRec);
    if (diff > 48 * 3_600_000) continue; // > 2 dias de diferença → não é o mesmo post
    const igKey = normCaption(m.caption || "");
    const legendaBate = ourKey.length >= 15 && igKey.length >= 15 && (igKey.startsWith(ourKey) || ourKey.startsWith(igKey));
    const horarioColado = diff <= 30 * 60_000;
    if (!legendaBate && !horarioColado) continue;
    const score = (legendaBate ? 0 : 1e15) + diff; // legenda sempre ganha; empate pelo horário
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

// Vincula os posts ANTIGOS (sem mediaId) às mídias da conta e JÁ busca o engajamento deles
// (não espera o cron e ignora a janela de 14 dias). Feed/Carrossel só — Story já sumiu.
export async function backfillMediaIdsDaMarca(marca: { id: string; igUserId: string | null; accessToken: string | null }): Promise<{ vinculados: number; atualizados: number; total: number }> {
  if (!marca.igUserId || !marca.accessToken) return { vinculados: 0, atualizados: 0, total: 0 };
  const token = marca.accessToken;

  // 1) VINCULAR os posts que ainda não têm mediaId (casa por legenda + horário).
  const [semIdC, semIdP] = await Promise.all([
    prisma.conteudo.findMany({ where: { marcaId: marca.id, status: "postado", mediaId: null, postadoEm: { not: null } }, select: { id: true, legenda: true, postadoEm: true } }),
    prisma.publicacao.findMany({ where: { marcaId: marca.id, status: "postado", mediaId: null, postadoEm: { not: null }, formato: "feed" }, select: { id: true, legenda: true, postadoEm: true } }),
  ]);
  const total = semIdC.length + semIdP.length;
  let vinculados = 0;

  if (total > 0) {
    const midias = await buscarMidiasDaConta(marca.igUserId, token);
    if (midias.length > 0) {
      const usados = new Set<string>();
      const casar = (legenda: string, postadoEm: Date | null): string | null => {
        if (!postadoEm) return null;
        const m = melhorMidia(legenda, postadoEm.getTime(), midias, usados);
        if (!m) return null;
        usados.add(m.id);
        return m.id;
      };
      for (const c of semIdC.sort((a, b) => a.postadoEm!.getTime() - b.postadoEm!.getTime())) {
        const mid = casar(c.legenda, c.postadoEm);
        if (mid) { await prisma.conteudo.update({ where: { id: c.id }, data: { mediaId: mid } }).catch(() => {}); vinculados++; }
      }
      for (const p of semIdP.sort((a, b) => a.postadoEm!.getTime() - b.postadoEm!.getTime())) {
        const mid = casar(p.legenda, p.postadoEm);
        if (mid) { await prisma.publicacao.update({ where: { id: p.id }, data: { mediaId: mid } }).catch(() => {}); vinculados++; }
      }
    }
  }

  // 2) (RE)BUSCAR o engajamento de TODOS os posts com mediaId — FORÇADO (ignora as janelas).
  //    Assim, ao re-clicar (ex: depois de ajustar a permissão na Meta), os números atualizam.
  let atualizados = 0;
  const comIdC = await prisma.conteudo.findMany({ where: { marcaId: marca.id, mediaId: { not: null } }, select: { id: true, mediaId: true } });
  for (const c of comIdC) {
    const ins = await buscarInsights(token, c.mediaId!, false);
    if (ins) { await prisma.conteudo.update({ where: { id: c.id }, data: { ...ins, insightsEm: new Date() } }).catch(() => {}); atualizados++; }
  }
  const agora = Date.now();
  const comIdP = await prisma.publicacao.findMany({ where: { marcaId: marca.id, mediaId: { not: null } }, select: { id: true, mediaId: true, formato: true, postadoEm: true } });
  for (const p of comIdP) {
    const ehStory = p.formato === "story";
    if (ehStory && p.postadoEm && agora - p.postadoEm.getTime() > 24 * 3_600_000) continue;
    const ins = await buscarInsights(token, p.mediaId!, ehStory);
    if (ins) { await prisma.publicacao.update({ where: { id: p.id }, data: { ...ins, insightsEm: new Date() } }).catch(() => {}); atualizados++; }
  }

  return { vinculados, atualizados, total };
}

// Diagnóstico: devolve a RESPOSTA CRUA da Meta ao pedir insights de UM post (o mais
// recente com mediaId). Serve pra ver o erro exato quando o alcance não aparece (ex:
// permissão faltando, métrica não suportada). NÃO inclui o token na resposta.
export async function rawInsightsDeUmPost(marca: { id: string; accessToken: string | null }): Promise<string> {
  if (!marca.accessToken) return "(marca sem token)";
  const c = await prisma.conteudo.findFirst({ where: { marcaId: marca.id, mediaId: { not: null } }, select: { mediaId: true }, orderBy: { postadoEm: "desc" } });
  const p = c ? null : await prisma.publicacao.findFirst({ where: { marcaId: marca.id, mediaId: { not: null }, formato: "feed" }, select: { mediaId: true }, orderBy: { postadoEm: "desc" } });
  const mediaId = c?.mediaId || p?.mediaId;
  if (!mediaId) return "(nenhum post vinculado ainda — clique em Puxar primeiro)";
  try {
    const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=reach,saved&access_token=${marca.accessToken}`, { cache: "no-store" });
    return (await r.text()).slice(0, 600);
  } catch (e) {
    return `erro de rede: ${e instanceof Error ? e.message : String(e)}`;
  }
}
