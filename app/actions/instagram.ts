"use server";

// Espelho do Instagram: lê (SÓ leitura) o feed e os stories da marca pra mostrar no painel.
// Sob demanda (chamado quando o dono abre a aba 📷 Instagram), pra não pesar o carregamento.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaConectada, buscarFeedIG, buscarStoriesIG, type PostIG, type StoryIG } from "@/lib/instagram";
import { buscarInsights, buscarMidiasDaConta } from "@/lib/metricas";
import { classificarCategoriasIA, analisarEngajamento, type AnaliseInsights } from "@/lib/inteligencia";

export async function buscarInstagramDaMarca(
  marcaId: string,
): Promise<{ ok: true; feed: PostIG[]; stories: StoryIG[] } | { ok: false; erro: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { igUserId: true, accessToken: true } });
  if (!marca || !marcaConectada(marca)) return { ok: false, erro: "Essa marca ainda não está conectada ao Instagram." };
  const conn = { igUserId: marca.igUserId as string, accessToken: marca.accessToken as string };
  const [feed, stories] = await Promise.all([buscarFeedIG(conn, 24), buscarStoriesIG(conn)]);
  return { ok: true, feed, stories };
}

// roda fn sobre os itens com no máx `tamanho` em paralelo (não estourar rate limit da Meta)
async function emLotes<T, R>(itens: T[], tamanho: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return out;
}

// GALHO 1 — "A Bia estudou seu feed": analisa o HISTÓRICO do Instagram (posts reais, mesmo os
// feitos fora do Postaí) cruzando engajamento × categoria, PRA ESTA MARCA. On-demand, não grava
// nada. Reusa o motor que já existe (buscarInsights, classificarCategoriasIA, analisarEngajamento).
export async function analisarHistoricoInstagram(
  marcaId: string,
): Promise<{ ok: true; analise: AnaliseInsights } | { ok: false; erro: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { igUserId: true, accessToken: true } });
  if (!marca || !marcaConectada(marca)) return { ok: false, erro: "Essa marca ainda não está conectada ao Instagram." };
  const token = marca.accessToken as string;

  // 1) histórico recente do feed (1 página, os ~30 mais novos — equilíbrio entre massa e custo)
  const midias = (await buscarMidiasDaConta(marca.igUserId as string, token, 1)).slice(0, 30);
  if (midias.length === 0) return { ok: false, erro: "Ainda não achei posts no feed dessa conta." };

  // 2) engajamento de cada post (curtidas/comentários + alcance/salvamentos) — em lotes de 8
  const insights = await emLotes(midias, 8, (m) => buscarInsights(token, m.id, false));

  // 3) categoria de intenção de cada post (IA lê a legenda, 1 chamada em lote)
  const mapaCat = await classificarCategoriasIA(
    midias.filter((m) => m.caption?.trim()).map((m) => ({ ref: m.id, texto: m.caption! })),
  );

  // 4) monta e roda a análise pura (a mesma do cartão "A Bia descobriu")
  const posts = midias.map((m, i) => ({
    categoria: mapaCat[m.id] ?? null,
    curtidas: insights[i]?.curtidas ?? null,
    comentarios: insights[i]?.comentarios ?? null,
    alcance: insights[i]?.alcance ?? null,
    salvamentos: insights[i]?.salvamentos ?? null,
    quando: m.timestamp ? new Date(m.timestamp) : new Date(),
    titulo: (m.caption || "").replace(/\s+/g, " ").trim().slice(0, 60) || "post sem legenda",
  }));
  const analise = analisarEngajamento(posts);
  // GALHO 2 — cacheia a análise pra o cérebro oficial da Bia (cartão da aba Redes + sugestão de
  // próximo post) usar sem repuxar o Instagram a cada carregamento do painel.
  await prisma.marca
    .update({ where: { id: marcaId }, data: { intelHistorico: analise as unknown as Prisma.InputJsonValue, intelHistoricoEm: new Date() } })
    .catch(() => {});
  return { ok: true, analise };
}
