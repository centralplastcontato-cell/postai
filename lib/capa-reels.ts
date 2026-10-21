// Capa (cover_url) do Reels de um VÍDEO CINEMA: a capa caprichada (/api/capa-cinema). Os outros
// Reels seguem com o quadro de 1,5s do próprio vídeo (null).
import { prisma } from "@/lib/prisma";
import { caminhoCapaCinema } from "@/lib/cinema";
import { baseUrl } from "@/lib/config";

export async function capaDoReelsCinema(videoTematicoId: string | null | undefined): Promise<string | null> {
  if (!videoTematicoId) return null;
  const v = await prisma.videoTematico.findUnique({ where: { id: videoTematicoId }, select: { id: true, modo: true, colagemRoteiro: true, marca: { select: { logoUrl: true } } } }).catch(() => null);
  if (!v || v.modo !== "cinema") return null;
  const c = caminhoCapaCinema(v.id, v.colagemRoteiro, v.marca.logoUrl || "");
  return c ? `${baseUrl()}${c}` : null;
}
