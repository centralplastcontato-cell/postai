import { prisma } from "@/lib/prisma";
import { publicarNasRedes, publicarStoryNasRedes, urlsAbsolutas, marcaConectada } from "@/lib/instagram";
import { snapshotDeMarca, alertarTokenSeVencendo } from "@/lib/metricas";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Tipo = "carrossel" | "feed" | "story";
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
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  const base = baseUrl();
  const resultados: Resultado[] = [];

  const marcas = await prisma.marca.findMany({ where: { ativa: true } }).catch(() => null);
  if (!marcas) {
    return Response.json({ ok: false, erro: "Banco indisponível ao listar marcas." }, { status: 503 });
  }

  for (const m of marcas) {
    if (!marcaConectada(m)) continue;
    try {
      await snapshotDeMarca(m).catch(() => {}); // best-effort, nunca derruba o piloto
      await alertarTokenSeVencendo(m).catch(() => {}); // avisa nas Atividades se o token estiver vencendo

      await postarCarrossel(m, agora, base, resultados);
      await postarFeed(m, agora, base, resultados);
      await postarStory(m, agora, base, resultados);
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
      await registrarAtividade(APP_NAME, `Postei "${c.titulo}" no ${onde} de ${m.nome} (auto).`, m.id).catch(() => {});
    } else {
      await reverterCarrossel(c.id);
      await registrarAtividade(APP_NAME, `Não consegui postar o carrossel "${c.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
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
      await registrarAtividade(APP_NAME, `Postei "${p.titulo}" no ${onde} de ${m.nome} (auto).`, m.id).catch(() => {});
      // Espelhar no Story (best-effort): ligado na marca ou forçado no post.
      if (p.espelhar ?? m.espelharStory) {
        const rs = await publicarStoryNasRedes(m as { igUserId: string; accessToken: string; fbPageId?: string }, `${base}/api/story/${p.id}`);
        await registrarAtividade(APP_NAME, rs.ig.ok ? `Espelhei "${p.titulo}" no Story de ${m.nome} (auto).` : `Não consegui espelhar "${p.titulo}" no Story: ${rs.ig.erro}`, m.id).catch(() => {});
      }
    } else {
      await reverterPublicacao(p.id);
      await registrarAtividade(APP_NAME, `Não consegui postar "${p.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
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
      await registrarAtividade(APP_NAME, `Postei o Story "${st.titulo}" no Instagram de ${m.nome} (auto).`, m.id).catch(() => {});
    } else {
      await reverterPublicacao(st.id);
      await registrarAtividade(APP_NAME, `Não consegui postar o Story "${st.titulo}" de ${m.nome}: ${r.ig.erro}`, m.id).catch(() => {});
    }
    out.push({ marca: m.nome, tipo: "story", titulo: st.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
  } catch (e) {
    out.push({ marca: m.nome, tipo: "story", titulo: "(erro)", ok: false, erro: msg(e) });
  }
}
