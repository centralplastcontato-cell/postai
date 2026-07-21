import { prisma } from "@/lib/prisma";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback do MOTOR DE VÍDEO: quando ele termina de montar, chama aqui com a URL do vídeo
// (ou o erro). Validado por um segredo compartilhado (VIDEO_CALLBACK_SECRET).
// O id que o motor ecoa ("festaId" no contrato) pode ser de uma FESTA ou de um VÍDEO
// TEMÁTICO — descobrimos aqui e gravamos no lugar certo (o motor não precisa saber).
export async function POST(req: Request) {
  const secret = process.env.VIDEO_CALLBACK_SECRET || "";
  const body = (await req.json().catch(() => ({}))) as { festaId?: string; videoUrl?: string; ok?: boolean; erro?: string; token?: string };
  if (!secret || body.token !== secret) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  if (!body.festaId) return Response.json({ ok: false, erro: "Sem festaId." }, { status: 400 });

  const id = body.festaId;
  // Sucesso = a URL do MP4; erro = volta pro estado "sem vídeo" pra o dono tentar de novo.
  const novaUrl = body.ok && body.videoUrl ? body.videoUrl : "";

  try {
    // Descobre O QUE é esse id (festa ou vídeo temático) — os dois lookups em paralelo.
    // Se o BANCO falhar aqui, devolvemos 5xx: o motor pode retentar e o vídeo não se perde
    // (engolir o erro deixaria o registro preso em "gerando" pra sempre).
    const [festa, tematico] = await Promise.all([
      prisma.festa.findUnique({ where: { id }, select: { marcaId: true } }),
      prisma.videoTematico.findUnique({ where: { id }, select: { marcaId: true, titulo: true } }),
    ]);

    if (festa) {
      await prisma.festa.update({ where: { id }, data: { videoUrl: novaUrl } });
      await registrarAtividade(
        AGENTE,
        novaUrl ? "🎬 O vídeo (Reels) da festa ficou pronto!" : `Não consegui gerar o vídeo da festa: ${body.erro || "erro"}`,
        festa.marcaId,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    if (tematico) {
      // Deu certo: carimba a data em que o MP4 ficou pronto (o seletor de Reels mostra a idade
      // do vídeo do buffet). Deu errado: só volta pro "sem vídeo", sem mexer no carimbo antigo.
      await prisma.videoTematico.update({
        where: { id },
        data: novaUrl ? { videoUrl: novaUrl, videoEm: new Date() } : { videoUrl: novaUrl },
      });
      await registrarAtividade(
        AGENTE,
        novaUrl ? `🎬 O vídeo do buffet "${tematico.titulo}" ficou pronto!` : `Não consegui gerar o vídeo "${tematico.titulo}": ${body.erro || "erro"}`,
        tematico.marcaId,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    // Id que não existe mais (festa/vídeo excluído enquanto o motor montava): NÃO é erro do
    // motor — responde 200 pra ele não ficar retentando um callback que nunca vai casar.
    return Response.json({ ok: true, aviso: "Id não encontrado — vídeo descartado." });
  } catch (e) {
    console.error("Erro no callback do vídeo:", e);
    return Response.json({ ok: false, erro: "Erro ao salvar o vídeo." }, { status: 500 });
  }
}
