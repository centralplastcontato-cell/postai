"use server";

// LIMPEZA de posts REPETIDOS na Página do Facebook (ex.: o piloto que repostou o mesmo post a cada
// passada enquanto o Instagram falhava). Só admin. Agrupa os posts recentes pelo MESMO texto e
// mantém o MAIS ANTIGO de cada grupo; os outros são apagados — só depois de o admin conferir a lista.
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/acesso";
import { listarPostsPagina, apagarPostPagina, tokenDaPagina } from "@/lib/facebook";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

async function conexao(marcaId: string) {
  const m = await prisma.marca.findUnique({ where: { id: marcaId }, select: { fbPageId: true, accessToken: true, nome: true } });
  if (!m?.fbPageId || !m.accessToken) return null;
  return { pageId: m.fbPageId, token: m.accessToken, nome: m.nome };
}
const chave = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export type GrupoRepetido = { mensagem: string; manter: { id: string; criadoEm: string; imagem: string | null; link: string | null }; apagar: { id: string; criadoEm: string }[] };

export async function previaRepetidosFacebook(marcaId: string, dias = 7) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = await conexao(marcaId);
  if (!c) return { ok: false as const, erro: "Esta marca não tem a Página do Facebook conectada." };
  try {
    const desde = new Date(Date.now() - Math.max(1, Math.min(30, dias)) * 86400_000);
    const posts = await listarPostsPagina(c.pageId, c.token, desde);
    const grupos = new Map<string, typeof posts>();
    for (const p of posts) {
      if (!p.mensagem.trim()) continue; // sem texto não dá pra saber se é repetido — não mexe
      const k = chave(p.mensagem);
      grupos.set(k, [...(grupos.get(k) || []), p]);
    }
    const repetidos: GrupoRepetido[] = [];
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      const ord = [...lista].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)); // o mais antigo fica
      const [manter, ...resto] = ord;
      repetidos.push({ mensagem: manter.mensagem.slice(0, 140), manter: { id: manter.id, criadoEm: manter.criadoEm, imagem: manter.imagem, link: manter.link }, apagar: resto.map((p) => ({ id: p.id, criadoEm: p.criadoEm })) });
    }
    repetidos.sort((a, b) => b.apagar.length - a.apagar.length);
    return { ok: true as const, analisados: posts.length, grupos: repetidos, totalApagar: repetidos.reduce((s, x) => s + x.apagar.length, 0) };
  } catch (e) {
    return { ok: false as const, erro: `Não consegui ler os posts da Página: ${e instanceof Error ? e.message : "erro"}` };
  }
}

// Apaga um LOTE pequeno (até 8 por chamada, 4 ao mesmo tempo — cada DELETE na Meta leva ~4s e a
// chamada tem que caber nos 60s do site). A tela chama de novo até acabar.
export async function apagarRepetidosFacebook(marcaId: string, ids: string[]) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = await conexao(marcaId);
  if (!c) return { ok: false as const, erro: "Esta marca não tem a Página do Facebook conectada." };
  const lote = ids.filter((id) => typeof id === "string" && id.startsWith(`${c.pageId}_`)).slice(0, 8); // só posts DESTA página
  const token = await tokenDaPagina(c.pageId, c.token);
  let apagados = 0;
  const falhas: string[] = [];
  for (let i = 0; i < lote.length; i += 4) {
    const rs = await Promise.all(lote.slice(i, i + 4).map((id) => apagarPostPagina(c.pageId, c.token, id, token).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : "erro" }))));
    for (const r of rs) {
      // "já não existe" conta como apagado (ex.: lote repetido depois de uma chamada que caiu)
      if (r.ok || /does not exist|cannot be loaded|Unsupported delete/i.test(r.erro || "")) apagados++;
      else falhas.push(r.erro || "erro");
    }
  }
  if (apagados) await registrarAtividade(AGENTE, `Apaguei ${apagados} post(s) repetido(s) do Facebook de ${c.nome}.`, marcaId).catch(() => {});
  return { ok: true as const, apagados, falhas: falhas.slice(0, 3), processados: lote.length };
}
