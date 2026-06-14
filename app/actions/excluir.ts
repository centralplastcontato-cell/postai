"use server";

import { prisma } from "@/lib/prisma";
import { guardaConteudo, guardaPublicacao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";

export async function excluirConteudo(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, erro: "ID ausente." };
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false, erro: g.erro };
  const c = await prisma.conteudo.findUnique({ where: { id } });
  if (!c) return { ok: false, erro: "Conteúdo não encontrado." };
  await prisma.conteudo.delete({ where: { id } });
  try {
    revalidatePath(`/painel/marcas/${c.marcaId}`);
  } catch {}
  return { ok: true };
}

export async function excluirPublicacao(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, erro: "ID ausente." };
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false, erro: "Publicação não encontrada." };
  await prisma.publicacao.delete({ where: { id } });
  try {
    revalidatePath(`/painel/marcas/${p.marcaId}`);
  } catch {}
  return { ok: true };
}
