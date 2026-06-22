import { prisma } from "@/lib/prisma";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback do MOTOR DE VÍDEO: quando ele termina de montar, chama aqui com a URL do vídeo
// (ou o erro). Validado por um segredo compartilhado (VIDEO_CALLBACK_SECRET).
export async function POST(req: Request) {
  const secret = process.env.VIDEO_CALLBACK_SECRET || "";
  const body = (await req.json().catch(() => ({}))) as { festaId?: string; videoUrl?: string; ok?: boolean; erro?: string; token?: string };
  if (!secret || body.token !== secret) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  if (!body.festaId) return Response.json({ ok: false, erro: "Sem festaId." }, { status: 400 });

  const festa = await prisma.festa.findUnique({ where: { id: body.festaId }, select: { marcaId: true } }).catch(() => null);
  if (body.ok && body.videoUrl) {
    await prisma.festa.update({ where: { id: body.festaId }, data: { videoUrl: body.videoUrl } }).catch(() => {});
    if (festa) await registrarAtividade(AGENTE, "🎬 O vídeo (Reels) da festa ficou pronto!", festa.marcaId).catch(() => {});
  } else {
    // erro: volta pro estado "sem vídeo" pra o dono poder tentar de novo
    await prisma.festa.update({ where: { id: body.festaId }, data: { videoUrl: "" } }).catch(() => {});
    if (festa) await registrarAtividade(AGENTE, `Não consegui gerar o vídeo da festa: ${body.erro || "erro"}`, festa.marcaId).catch(() => {});
  }
  return Response.json({ ok: true });
}
