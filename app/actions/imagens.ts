"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca, guardaImagem } from "@/lib/acesso";
import { CATEGORIAS } from "@/lib/categorias-imagem";

export async function adicionarImagemMarca(input: { marcaId: string; url: string; categoria?: string }) {
  const g = await guardaMarca(input.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const url = (input.url || "").trim();
  if (!url) return { ok: false as const, erro: "Foto sem URL." };
  const categoria = (CATEGORIAS as readonly string[]).includes(input.categoria || "") ? input.categoria! : "geral";
  const img = await prisma.imagemMarca.create({ data: { marcaId: input.marcaId, url, categoria } });
  revalidatePath(`/painel/marcas/${input.marcaId}`);
  return { ok: true as const, id: img.id, url: img.url, categoria: img.categoria };
}

export async function removerImagemMarca(id: string) {
  const g = await guardaImagem(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const img = await prisma.imagemMarca.findUnique({ where: { id } });
  if (!img) return { ok: false as const, erro: "Imagem não encontrada." };
  await prisma.imagemMarca.delete({ where: { id } });
  revalidatePath(`/painel/marcas/${img.marcaId}`);
  return { ok: true as const };
}

// Escolhe uma foto REAL do banco da marca em RODÍZIO: pega sempre a MENOS usada
// (desempate pela mais antiga), e incrementa o contador. Assim percorre todas as
// fotos uma vez antes de repetir qualquer uma — nada de cair sempre na mesma.
// Tenta a categoria pedida; se ela não tiver fotos, cai pro banco inteiro.
export async function sortearImagemBanco(marcaId: string, categoria?: string): Promise<string | null> {
  // Só sorteia foto de marca que a sessão pode acessar (anti-IDOR — é exportada como
  // server action). Os chamadores internos rodam em sessão já autorizada → passa.
  const g = await guardaMarca(marcaId);
  if (!g.ok) return null;
  const where = categoria && categoria !== "geral" ? { marcaId, categoria } : { marcaId };
  let img = await prisma.imagemMarca.findFirst({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    select: { id: true, url: true },
  });
  if (!img && categoria) {
    img = await prisma.imagemMarca.findFirst({
      where: { marcaId },
      orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
      select: { id: true, url: true },
    });
  }
  if (!img) return null;
  await prisma.imagemMarca.update({ where: { id: img.id }, data: { usos: { increment: 1 } } });
  return img.url;
}

// Pega N fotos DISTINTAS do banco em rodízio (as N menos usadas, desempate pela
// mais antiga) e incrementa o uso de todas de uma vez. Pro Mosaico, que mostra
// várias fotos juntas. Se a categoria pedida não tiver fotos suficientes, completa
// com o banco inteiro. Retorna de 0 a N urls (menos que N se o banco for pequeno).
export async function sortearImagensBanco(marcaId: string, n: number, categoria?: string): Promise<string[]> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return [];
  const where = categoria && categoria !== "geral" ? { marcaId, categoria } : { marcaId };
  let imgs = await prisma.imagemMarca.findMany({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    take: n,
    select: { id: true, url: true },
  });
  if (imgs.length < n) {
    imgs = await prisma.imagemMarca.findMany({
      where: { marcaId },
      orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
      take: n,
      select: { id: true, url: true },
    });
  }
  if (!imgs.length) return [];
  await prisma.imagemMarca.updateMany({ where: { id: { in: imgs.map((i) => i.id) } }, data: { usos: { increment: 1 } } });
  return imgs.map((i) => i.url);
}

// Versão server-action da anterior (pra o botão "🎲 Foto do banco" no painel).
export async function sortearImagemBancoAction(marcaId: string, categoria?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const url = await sortearImagemBanco(marcaId, categoria);
  if (!url) return { ok: false as const, erro: "Banco de imagens vazio. Suba fotos reais na aba Configurações." };
  return { ok: true as const, url };
}
