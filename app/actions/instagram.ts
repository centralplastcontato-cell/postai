"use server";

// Espelho do Instagram: lê (SÓ leitura) o feed e os stories da marca pra mostrar no painel.
// Sob demanda (chamado quando o dono abre a aba 📷 Instagram), pra não pesar o carregamento.

import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaConectada, buscarFeedIG, buscarStoriesIG, type PostIG, type StoryIG } from "@/lib/instagram";

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
