"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";

// Campanhas = ofertas (banners de recompra) que aparecem no fim dos álbuns. CRUD validado por
// guardaMarca (multi-tenant: cada dono só mexe nas campanhas da própria marca).

export type CampanhaInput = {
  selo: string;
  titulo: string;
  texto: string;
  ctaTexto: string;
  ctaTipo: string; // "whatsapp" | "link"
  ctaValor: string;
};

function limpa(input: CampanhaInput) {
  return {
    selo: (input.selo || "").trim().slice(0, 60),
    titulo: (input.titulo || "").trim().slice(0, 80),
    texto: (input.texto || "").trim().slice(0, 280),
    ctaTexto: (input.ctaTexto || "").trim().slice(0, 40) || "Quero saber mais",
    ctaTipo: input.ctaTipo === "link" ? "link" : "whatsapp",
    ctaValor: (input.ctaValor || "").trim().slice(0, 300),
  };
}

export async function criarCampanha(marcaId: string, input: CampanhaInput) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const d = limpa(input);
  if (!d.titulo) return { ok: false as const, erro: "Dê um título pra campanha." };
  await prisma.campanha.create({ data: { marcaId, ...d } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

export async function editarCampanha(id: string, input: CampanhaInput) {
  const c = await prisma.campanha.findUnique({ where: { id }, select: { marcaId: true } });
  if (!c) return { ok: false as const, erro: "Campanha não encontrada." };
  const g = await guardaMarca(c.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const d = limpa(input);
  if (!d.titulo) return { ok: false as const, erro: "Dê um título pra campanha." };
  await prisma.campanha.update({ where: { id }, data: d });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

export async function alternarCampanha(id: string, ativa: boolean) {
  const c = await prisma.campanha.findUnique({ where: { id }, select: { marcaId: true } });
  if (!c) return { ok: false as const, erro: "Campanha não encontrada." };
  const g = await guardaMarca(c.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.campanha.update({ where: { id }, data: { ativa } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

export async function excluirCampanha(id: string) {
  const c = await prisma.campanha.findUnique({ where: { id }, select: { marcaId: true } });
  if (!c) return { ok: false as const, erro: "Campanha não encontrada." };
  const g = await guardaMarca(c.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.campanha.delete({ where: { id } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}
