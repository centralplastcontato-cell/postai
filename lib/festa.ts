import { prisma } from "@/lib/prisma";

// Resolve a marca pelo token público do Álbum da Festa. Token vazio/curto NUNCA casa
// (senão uma marca com tokenFotos="" abriria pra qualquer um). Centraliza a validação
// do link, usada pela página pública, pela action de criar festa e pelo upload por token.
// É a fronteira de autorização do recurso público: quem tem o token, mexe nas fotos da marca.
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
