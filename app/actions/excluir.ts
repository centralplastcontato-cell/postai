"use server";

import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function excluirConteudo(formData: FormData) {
  if (!(await estaLogado())) return { ok: false, erro: "Sem permissão." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, erro: "ID ausente." };
  const c = await prisma.conteudo.findUnique({ where: { id } });
  if (!c) return { ok: false, erro: "Conteúdo não encontrado." };
  await prisma.conteudo.delete({ where: { id } });
  try {
    revalidatePath(`/painel/marcas/${c.marcaId}`);
  } catch {}
  return { ok: true };
}

export async function excluirPublicacao(formData: FormData) {
  if (!(await estaLogado())) return { ok: false, erro: "Sem permissão." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, erro: "ID ausente." };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false, erro: "Publicação não encontrada." };
  await prisma.publicacao.delete({ where: { id } });
  try {
    revalidatePath(`/painel/marcas/${p.marcaId}`);
  } catch {}
  return { ok: true };
}
