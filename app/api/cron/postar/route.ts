import { prisma } from "@/lib/prisma";
import { publicarNasRedes, publicarStoryNasRedes, urlsAbsolutas, marcaConectada, criarContainerReels, statusContainerReels, publicarContainerReels } from "@/lib/instagram";
import { snapshotDeMarca, alertarTokenSeVencendo, coletarInsightsDaMarca } from "@/lib/metricas";
import { acessoExpirado } from "@/lib/plano";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, AGENTE } from "@/lib/config";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Tipo = "carrossel" | "feed" | "story" | "reels";
type Resultado = { marca: string; tipo: Tipo; titulo: string; ok: boolean; erro?: string };

/**
 * Piloto automático: para CADA marca conectada, posta no Instagram o carrossel, o feed
 * e o Story que estão "a_postar" com data <= agora (1 de cada por marca/execução).
 *
 * ROBUSTEZ (lições de produção):
 * - CLAIM otimista: o item é marcado "postado" ANTES de postar (atômico, só pega se ainda
 *   estiver "a_postar"). Assim, se gravar o status falhar DEPOIS de postar (banco lento),
 *   o item NUNCA fica "postado-mas-não-marcado" nem é repostado em duplicidade. Se a
 *   postagem falhar, revertemos pra "a_postar" e o cron tenta de novo na próxima hora.
 *   (Trade-off proposital: no pior caso "perde" um post — bem melhor que duplicar no perfil
 *   do cliente.)
 * - Cada item roda ISOLADO num try/catch: um erro no carrossel não impede o Story.
 * - Falhas viram ATIVIDADE visível no painel (a causa aparece pro dono, sem caçar log).
 *
 * Protegido por CRON_SECRET (header Authorization: Bearer <segredo>).
 */
// Compara o header Authorization com o segredo de forma timing-safe (tamanhos iguais).
function autorizado(header: string | null, secret: string): boolean {
  const a = Buffer.from(header || "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail-closed: sem segredo configurado, NINGUÉM dispara o piloto. (Antes, se a env var
  // sumisse, a rota ficava aberta e qualquer um postaria no Instagram de todos os clientes.)
  if (!secret) {
    return Response.json({ ok: false, erro: "Cron não configurado." }, { status: 503 });
  }
  if (!autorizado(req.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  const base = baseUrl();
  const resultados: Resultado[] = [];

  // Batimento: registra que o piloto rodou agora — o painel admin avisa se parar de rodar.
  await prisma.heartbeat.upsert({ where: { id: "cron" }, update: { em: agora }, create: { id: "cron", em: agora } }).catch(() => {});

  const marcas = await prisma.marca
    .findMany({ where: { ativa: true }, include: { usuario: { select: { admin: true, acessoAte: true } } } })
    .catch(() => null);
  if (!marcas) {
    return Response.json({ ok: false, erro: "Banco indisponível ao listar marcas." }, { status: 503 });
  }

  for (const m of marcas) {
    if (!marcaConectada(m)) continue;
    // Dono com acesso vencido → piloto PAUSADO pra essa marca. Marca sem dono (admin) nunca pausa.
    if (m.usuario && acessoExpirado(m.usuario)) continue;
    try {
      await snapshotDeMarca(m).catch(() => {}); // best-effort, nunca derruba o piloto
      await alertarTokenSeVencendo(m).catch(() => {}); // avisa nas Atividades se o token estiver vencendo

      await postarCarrossel(m, agora, base, resultados);
      await postarFeed(m, agora, base, resultados);
      await postarStory(m, agora, base, resultados);
      await postarReels(m, agora, resultados);
      await arquivarReelsPostados(m, agora, resultados); // libera storage: apaga MP4 já postado há +24h

      // Coleta o engajamento (curtidas/comentários/alcance) dos posts recentes — Story só
      // dentro de 24h. Best-effort: nunca derruba o piloto.
      await coletarInsightsDaMarca(m).catch(() => {});
    } catch (e) {
      resultados.push({ marca: m.nome, tipo: "carrossel", titulo: "(marca)", ok: false, erro: msg(e) });
    }
  }

  return Response.json({
    ok: true,
    marcas: marcas.length,
    postados: resultados.filter((r) => r.ok).length,
    resultados,
  });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Claim atômico: marca "postado" só se ainda estiver "a_postar". true = ESTE processo
// pegou o item (pode postar). false = já foi pego/banco falhou → não posta.
async function claimCarrossel(id: string): Promise<boolean> {
  try {
    const r = await prisma.conteudo.updateMany({ where: { id, status: "a_postar" }, data: { status: "postado", postadoEm: new Date() } });
    return r.count > 0;
  } catch {
    return false;
  }
}
async function claimPublicacao(id: string): Promise<boolean> {
  try {
    const r = await prisma.publicacao.updateMany({ where: { id, status: "a_postar" }, data: { status: "postado", postadoEm: new Date() } });
    return r.count > 0;
  } catch {
    return false;
  }
}
async function reverterCarrossel(id: string) {
  try { await prisma.conteudo.update({ where: { id }, data: { status: "a_postar", postadoEm: null } }); } catch {}
}
async function reverterPublicacao(id: string) {
  try { await prisma.publicacao.update({ where: { id }, data: { status: "a_postar", postadoEm: null } }); } catch {}
}

async function postarCarrossel(m: { id: string; nome: string; igUserId: string | null; accessToken: string | null; fbPageId: string | null }, agora: Date, base: string, out: Resultado[]) {
  try {
    const c = await prisma.conteudo.findFirst({ where: { marcaId: m.id, status: "a_postar", data: { lte: agora } }, orderBy: { data: "asc" } });
    if (!c) return;
    let caminhos: string[] = [];
    try { caminhos = JSON.parse(c.slides) as string[]; } catch {}
    const urls = urlsAbsolutas(base, caminhos);
    if (urls.length < 1) return;
    if (!(await claimCarrossel(c.id))) return; // já pego ou banco falhou — não duplica

    const legenda = `${c.legenda}\n\n${c.hashtags}`.trim().slice(0, 2200);
    const r = await publicarNasRedes(m as { igUserId: string; accessToken: string; fbPageId?: string }, urls, legenda);
    if (r.ig.ok) {
      const onde = r.fb ? (r.fb.ok ? "Instagram + Facebook" : `Instagram (Facebook falhou: ${r.fb.erro})`) : "Instagram";
      await registrarAtividade(AGENTE, `Postei "${c.titulo}" no ${onde} de ${m.nome} (auto).`, m.id).catch(() => {});
      await prisma.conteudo.update({ where: { id: c.id }, data: { mediaId: r.ig.mediaId } }).catch(() => {}); // guarda o ID pra coletar o engajamento depois
    } else {
      await reverterCarrossel(c.id);
      await registrarAtividade(AGENTE, `Não consegui postar o carrossel "${c.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
    }
    out.push({ marca: m.nome, tipo: "carrossel", titulo: c.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
  } catch (e) {
    out.push({ marca: m.nome, tipo: "carrossel", titulo: "(erro)", ok: false, erro: msg(e) });
  }
}

async function postarFeed(m: { id: string; nome: string; igUserId: string | null; accessToken: string | null; fbPageId: string | null; espelharStory: boolean }, agora: Date, base: string, out: Resultado[]) {
  try {
    const p = await prisma.publicacao.findFirst({ where: { marcaId: m.id, status: "a_postar", data: { lte: agora }, formato: "feed" }, orderBy: { data: "asc" } });
    if (!p) return;
    if (!(await claimPublicacao(p.id))) return;

    const legenda = `${p.legenda}\n\n${p.hashtags}`.trim().slice(0, 2200);
    const r = await publicarNasRedes(m as { igUserId: string; accessToken: string; fbPageId?: string }, [`${base}/api/feed/${p.id}`], legenda);
    if (r.ig.ok) {
      const onde = r.fb ? (r.fb.ok ? "Instagram + Facebook" : `Instagram (Facebook falhou: ${r.fb.erro})`) : "Instagram";
      await registrarAtividade(AGENTE, `Postei "${p.titulo}" no ${onde} de ${m.nome} (auto).`, m.id).catch(() => {});
      await prisma.publicacao.update({ where: { id: p.id }, data: { mediaId: r.ig.mediaId } }).catch(() => {}); // guarda o ID pra coletar o engajamento depois
      // Espelhar no Story (best-effort): ligado na marca ou forçado no post.
      if (p.espelhar ?? m.espelharStory) {
        const rs = await publicarStoryNasRedes(m as { igUserId: string; accessToken: string; fbPageId?: string }, `${base}/api/story/${p.id}`);
        await registrarAtividade(AGENTE, rs.ig.ok ? `Espelhei "${p.titulo}" no Story de ${m.nome} (auto).` : `Não consegui espelhar "${p.titulo}" no Story: ${rs.ig.erro}`, m.id).catch(() => {});
      }
    } else {
      await reverterPublicacao(p.id);
      await registrarAtividade(AGENTE, `Não consegui postar "${p.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
    }
    out.push({ marca: m.nome, tipo: "feed", titulo: p.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
  } catch (e) {
    out.push({ marca: m.nome, tipo: "feed", titulo: "(erro)", ok: false, erro: msg(e) });
  }
}

async function postarStory(m: { id: string; nome: string; igUserId: string | null; accessToken: string | null; fbPageId: string | null }, agora: Date, base: string, out: Resultado[]) {
  try {
    const st = await prisma.publicacao.findFirst({ where: { marcaId: m.id, status: "a_postar", data: { lte: agora }, formato: "story" }, orderBy: { data: "asc" } });
    if (!st) return;
    if (!(await claimPublicacao(st.id))) return;

    const r = await publicarStoryNasRedes(m as { igUserId: string; accessToken: string; fbPageId?: string }, `${base}/api/story/${st.id}`);
    if (r.ig.ok) {
      await registrarAtividade(AGENTE, `Postei o Story "${st.titulo}" no Instagram de ${m.nome} (auto).`, m.id).catch(() => {});
      await prisma.publicacao.update({ where: { id: st.id }, data: { mediaId: r.ig.mediaId } }).catch(() => {}); // guarda o ID pra coletar as visualizações (dentro de 24h)
    } else {
      await reverterPublicacao(st.id);
      await registrarAtividade(AGENTE, `Não consegui postar o Story "${st.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
    }
    out.push({ marca: m.nome, tipo: "story", titulo: st.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
  } catch (e) {
    out.push({ marca: m.nome, tipo: "story", titulo: "(erro)", ok: false, erro: msg(e) });
  }
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Publica um container de Reels JÁ pronto (FINISHED): claim atômico + media_publish + atividade.
async function publicarReelsPronto(
  m: { id: string; nome: string; igUserId: string | null; accessToken: string | null },
  p: { id: string; titulo: string },
  containerId: string,
  out: Resultado[],
): Promise<boolean> {
  if (!(await claimPublicacao(p.id))) return true; // já pego por outra execução — não duplica
  const conn = { igUserId: m.igUserId as string, accessToken: m.accessToken as string };
  const r = await publicarContainerReels(conn, containerId);
  if (r.ok) {
    await registrarAtividade(AGENTE, `Postei o Reels "${p.titulo}" no Instagram de ${m.nome} (auto).`, m.id).catch(() => {});
    await prisma.publicacao.update({ where: { id: p.id }, data: { mediaId: r.mediaId } }).catch(() => {});
  } else {
    // volta a "a_postar" e zera o container (recria do zero na próxima passada)
    await prisma.publicacao.update({ where: { id: p.id }, data: { status: "a_postar", postadoEm: null, reelsContainerId: "" } }).catch(() => {});
    await registrarAtividade(AGENTE, `Não consegui publicar o Reels "${p.titulo}" de ${m.nome}: ${r.erro}`, m.id).catch(() => {});
  }
  out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: r.ok, erro: r.ok ? undefined : r.erro });
  return r.ok;
}

// PILOTO DO REELS (2 fases, pra caber na janela de 60s sem travar):
//  • Fase 1 (sem container): cria o vídeo na Meta + poll CURTO (~20s) — se ficar pronto, publica já.
//  • Fase 2 (já tem container): confere o processamento e publica quando FINISHED.
// O container fica guardado em Publicacao.reelsContainerId entre as passadas; ERROR/EXPIRED zera pra recriar.
async function postarReels(m: { id: string; nome: string; igUserId: string | null; accessToken: string | null }, agora: Date, out: Resultado[]) {
  try {
    const p = await prisma.publicacao.findFirst({ where: { marcaId: m.id, status: "a_postar", data: { lte: agora }, formato: "reels" }, orderBy: { data: "asc" } });
    if (!p) return;
    if (!p.videoUrl) {
      await registrarAtividade(AGENTE, `O Reels "${p.titulo}" de ${m.nome} ainda não tem vídeo gerado — não postei.`, m.id).catch(() => {});
      out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: false, erro: "sem vídeo" });
      return;
    }
    const conn = { igUserId: m.igUserId as string, accessToken: m.accessToken as string };
    const legenda = p.legenda.slice(0, 2200);

    // FASE 2 — já criou o container numa passada anterior
    if (p.reelsContainerId) {
      const status = await statusContainerReels(conn, p.reelsContainerId);
      if (status === "FINISHED") {
        await publicarReelsPronto(m, p, p.reelsContainerId, out);
      } else if (status === "ERROR" || status === "EXPIRED") {
        await prisma.publicacao.update({ where: { id: p.id }, data: { reelsContainerId: "" } }).catch(() => {}); // recria na próxima
        await registrarAtividade(AGENTE, `O vídeo do Reels "${p.titulo}" de ${m.nome} falhou no preparo (${status}) — vou tentar de novo.`, m.id).catch(() => {});
        out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: false, erro: status });
      }
      // IN_PROGRESS/UNKNOWN: ainda processando → espera a próxima passada
      return;
    }

    // FASE 1 — cria o container e guarda; poll curto pra publicar já se ficar pronto rápido
    const c = await criarContainerReels(conn, p.videoUrl, legenda);
    if (!c.ok) {
      await registrarAtividade(AGENTE, `Não consegui preparar o Reels "${p.titulo}" de ${m.nome}: ${c.erro}`, m.id).catch(() => {});
      out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: false, erro: c.erro });
      return;
    }
    await prisma.publicacao.update({ where: { id: p.id }, data: { reelsContainerId: c.containerId } }).catch(() => {});

    for (let i = 0; i < 5; i++) { // ~20s (5 × 4s)
      await dorme(4000);
      const s = await statusContainerReels(conn, c.containerId);
      if (s === "FINISHED") { await publicarReelsPronto(m, p, c.containerId, out); return; }
      if (s === "ERROR" || s === "EXPIRED") {
        await prisma.publicacao.update({ where: { id: p.id }, data: { reelsContainerId: "" } }).catch(() => {});
        out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: false, erro: s });
        return;
      }
    }
    // ainda processando → fica pra próxima passada (container já guardado)
    await registrarAtividade(AGENTE, `Preparando o Reels "${p.titulo}" de ${m.nome} — publico assim que o vídeo ficar pronto.`, m.id).catch(() => {});
    out.push({ marca: m.nome, tipo: "reels", titulo: p.titulo, ok: false, erro: "processando" });
  } catch (e) {
    out.push({ marca: m.nome, tipo: "reels", titulo: "(erro)", ok: false, erro: msg(e) });
  }
}

// ARQUIVAMENTO DE STORAGE: o MP4 do Blob (1GB free) só cresce. Depois que um Reels é POSTADO,
// o vídeo já vive no Instagram pra sempre — não precisa guardar a cópia pesada aqui. Então,
// passadas +24h da postagem (janela de segurança: dá tempo de conferir que postou MESMO), apaga
// o MP4. As FOTOS ficam, então o vídeo é REGERÁVEL idêntico (a festa volta pra "⚡ Gerar"). Marca
// pelo próprio videoUrl="" (já arquivado não tem mais http → não reprocessa). Best-effort.
const UM_DIA_MS = 24 * 60 * 60 * 1000;
async function arquivarReelsPostados(m: { id: string; nome: string }, agora: Date, out: Resultado[]) {
  try {
    const limite = new Date(agora.getTime() - UM_DIA_MS);
    const antigos = await prisma.publicacao.findMany({
      where: { marcaId: m.id, formato: "reels", status: "postado", postadoEm: { lt: limite }, videoUrl: { startsWith: "http" } },
      select: { id: true, videoUrl: true, titulo: true },
      take: 5, // no máx. 5 por passada — não estoura a janela de 60s do cron
    });
    if (!antigos.length) return;
    const { del } = await import("@vercel/blob");
    for (const p of antigos) {
      if (!p.videoUrl) continue;
      try { await del(p.videoUrl); } catch {} // se já não existe, segue
      // marca a festa como "arquivado" (sentinela) — o card mostra "📮 Postado · arquivado" + "Gerar de novo",
      // pra NÃO confundir com uma festa que nunca teve vídeo. (gerarVideoDaFesta trata "arquivado" como gerável.)
      await prisma.festa.updateMany({ where: { videoUrl: p.videoUrl }, data: { videoUrl: "arquivado" } }).catch(() => {});
      await prisma.publicacao.update({ where: { id: p.id }, data: { videoUrl: "" } }).catch(() => {});
      await registrarAtividade(AGENTE, `Arquivei o vídeo do Reels "${p.titulo}" de ${m.nome} (já está no Instagram há +24h; liberei espaço — dá pra refazer das fotos).`, m.id).catch(() => {});
      out.push({ marca: m.nome, tipo: "reels", titulo: `${p.titulo} (arquivado)`, ok: true });
    }
  } catch (e) {
    out.push({ marca: m.nome, tipo: "reels", titulo: "(arquivar)", ok: false, erro: msg(e) });
  }
}
