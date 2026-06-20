import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// Token aleatório do link de uma festa (~16 chars url-safe). Imprevisível — é a credencial
// que isola a festa: quem tem o link mexe só nela. Sem @unique no schema porque o espaço
// aleatório (96 bits) torna colisão desprezível, e o backfill gera valores distintos.
export function gerarTokenFesta(): string {
  return randomBytes(12).toString("base64url");
}

// Resolve a MARCA pelo token público de CRIAR festa (Marca.tokenFotos). Token vazio/curto
// NUNCA casa (senão uma marca com tokenFotos="" abriria pra qualquer um). É a fronteira de
// autorização do link de CRIAR — quem tem ele cria festas novas (não vê as existentes).
export async function marcaPorTokenFotos(token: string) {
  const t = (token || "").trim();
  if (t.length < 6) return null; // vazio/trivial nunca casa (tokenFotos="" tem length 0)
  try {
    return await prisma.marca.findFirst({
      where: { tokenFotos: t },
      select: { id: true, nome: true, logoUrl: true, corPrimaria: true, corFundo: true },
    });
  } catch {
    return null;
  }
}

// Resolve a FESTA (com dados da marca) pelo token do link DELA. É a fronteira de autorização
// do link isolado: quem tem ele só mexe nesta festa. Token vazio/curto nunca casa.
export async function festaPorToken(token: string) {
  const t = (token || "").trim();
  if (t.length < 10) return null;
  try {
    return await prisma.festa.findFirst({
      where: { token: t },
      select: {
        id: true,
        marcaId: true,
        data: true,
        aniversariantes: true,
        tema: true,
        finalizadaEm: true,
        marca: { select: { nome: true, logoUrl: true, corPrimaria: true } },
      },
    });
  } catch {
    return null;
  }
}
