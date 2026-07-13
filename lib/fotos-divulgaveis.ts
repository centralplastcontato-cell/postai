// Fotos da marca LIBERADAS pra DIVULGAÇÃO pública (LGPD): foto solta (sem festa) OU de festa
// com uso de imagem AUTORIZADO pelos pais. Festa pendente/negada nunca vira post/vídeo público.
//
// Por que não é só um `where` com join: no Supabase, filtrar por `festa: { autorizacao }` dentro
// do where fica LENTÍSSIMO (10-55s com muitas fotos) — o painel já tinha aprendido isso em
// imagensDoBanco. Aqui buscamos as imagens e as festas autorizadas em PARALELO (duas queries
// simples) e filtramos no código.

import { prisma } from "@/lib/prisma";

export type FotoDivulgavel = {
  id: string;
  url: string;
  categoria: string;
  descricao: string;
  festaId: string | null;
  usos: number; // rodízio: quantas vezes já entrou num post/vídeo (menos usadas primeiro)
};

export async function fotosDivulgaveis(
  marcaId: string,
  opts?: { comDescricao?: boolean; limite?: number },
): Promise<FotoDivulgavel[]> {
  const [imgs, festasOk] = await Promise.all([
    prisma.imagemMarca.findMany({
      where: { marcaId, ...(opts?.comDescricao ? { NOT: { descricao: "" } } : {}) },
      orderBy: [{ usos: "asc" }, { criadoEm: "desc" }],
      select: { id: true, url: true, categoria: true, descricao: true, festaId: true, usos: true },
      take: opts?.limite ?? 400,
    }),
    prisma.festa.findMany({ where: { marcaId, autorizacao: "autorizada" }, select: { id: true } }),
  ]);
  const okFesta = new Set(festasOk.map((f) => f.id));
  return imgs.filter((i) => !i.festaId || okFesta.has(i.festaId));
}
