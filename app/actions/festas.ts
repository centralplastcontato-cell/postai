"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaPorTokenFotos } from "@/lib/festa";

// ===========================================================================
// ÁLBUM DA FESTA — server actions
//
// Duas frentes:
//  • PAINEL (com sessão): o dono gera/revoga o link e administra as festas.
//    Passa por guardaMarca (multi-tenant, anti-IDOR).
//  • PÚBLICO (sem sessão): o gerente cria a festa pelo link. Autorizado pelo
//    TOKEN (marcaPorTokenFotos), não pela sessão — quem tem o link, mexe nas fotos.
// ===========================================================================

// --- PAINEL -----------------------------------------------------------------

// Gera (ou regenera) o link público do Álbum da Festa pra marca. Regerar REVOGA o
// link anterior (o token antigo deixa de existir) — útil se o link vazou.
export async function gerarLinkFotos(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const token = randomBytes(18).toString("base64url"); // ~24 chars url-safe, imprevisível
  await prisma.marca.update({ where: { id: marcaId }, data: { tokenFotos: token } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, token };
}

// Revoga o link (limpa o token): o link antigo para de funcionar na hora.
export async function revogarLinkFotos(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.marca.update({ where: { id: marcaId }, data: { tokenFotos: "" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

// Exclui uma festa. As FOTOS não somem do banco — o festaId delas vira null (SetNull no
// schema), então elas seguem alimentando as artes; só perdem o agrupamento por festa.
export async function excluirFesta(festaId: string) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!f) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.festa.delete({ where: { id: festaId } });
  revalidatePath(`/painel/marcas/${f.marcaId}`);
  return { ok: true as const };
}

// --- PÚBLICO (validado por TOKEN, sem sessão) -------------------------------

// O gerente cria uma festa pelo link público. Validado pelo token do link, não por sessão.
export async function criarFestaPublica(
  token: string,
  input: { dataISO: string; aniversariante: string; tema?: string },
) {
  const m = await marcaPorTokenFotos(token);
  if (!m) return { ok: false as const, erro: "Link inválido ou desativado. Peça um novo ao buffet." };
  const aniversariante = (input.aniversariante || "").trim().slice(0, 80);
  if (!aniversariante) return { ok: false as const, erro: "Informe o nome do aniversariante." };
  const data = new Date(input.dataISO);
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };
  const festa = await prisma.festa.create({
    data: { marcaId: m.id, data, aniversariante, tema: (input.tema || "").trim().slice(0, 80) },
  });
  revalidatePath(`/f/${token}`);
  return { ok: true as const, festaId: festa.id };
}
