"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaPorTokenFotos } from "@/lib/festa";
import { parseAniversariantes, nomesAniversariantes } from "@/lib/aniversariantes";

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

// Código curto e LEGÍVEL pro fim do link (sem caracteres ambíguos: nada de i/l/o/0/1).
// É a credencial secreta do link — 6 chars de um alfabeto de 31 = ~887 milhões de combinações,
// inviável de adivinhar. O slug da marca antes dele é só identidade (bonito, dá confiança).
function codigoCurto(n = 6): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
}

// Gera (ou regenera) o link público do Álbum da Festa pra marca. Regerar REVOGA o link
// anterior (o token antigo deixa de existir) — útil se o link vazou. Formato bonito:
// "<slug-da-marca>-<código>" (ex: castelo-da-diversao-k7p9w2).
export async function gerarLinkFotos(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const m = await prisma.marca.findUnique({ where: { id: marcaId }, select: { slug: true } });
  const token = `${m?.slug || "festa"}-${codigoCurto()}`;
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
// Aceita VÁRIOS aniversariantes (cada um com nome + idade opcional).
export async function criarFestaPublica(
  token: string,
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string },
) {
  const m = await marcaPorTokenFotos(token);
  if (!m) return { ok: false as const, erro: "Link inválido ou desativado. Peça um novo ao buffet." };
  // parseAniversariantes limpa/normaliza a lista (descarta sem nome, idade 0–130 ou null).
  const lista = parseAniversariantes(JSON.stringify(input.aniversariantes || [])).slice(0, 10);
  if (!lista.length) return { ok: false as const, erro: "Informe o nome de pelo menos um aniversariante." };
  const data = new Date(input.dataISO);
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };
  const festa = await prisma.festa.create({
    data: {
      marcaId: m.id,
      data,
      aniversariante: nomesAniversariantes(lista), // label de exibição derivado
      aniversariantes: JSON.stringify(lista),
      tema: (input.tema || "").trim().slice(0, 80),
    },
  });
  revalidatePath(`/f/${token}`);
  return { ok: true as const, festaId: festa.id };
}
