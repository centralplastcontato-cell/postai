import { prisma } from "@/lib/prisma";
import { marcaPorTokenFotos } from "@/lib/festa";
import { subirFotoNormalizada } from "@/lib/blob-upload";
import { descreverImagem } from "@/lib/imagem-ia";
import { normalizarMomento, categoriaDoMomento, LIMITE_FOTOS_FESTA, LIMITE_FOTOS_MOMENTO } from "@/lib/momentos-festa";

export const runtime = "nodejs";

// Upload PÚBLICO do Álbum da Festa: o gerente sobe fotos sem login, por MOMENTO guiado.
// Autorizado pelo TOKEN do link (não pela sessão). A foto vira ImagemMarca (categoria
// mapeada do momento) amarrada à festa — entra no rodízio das artes E fica organizada por
// evento/momento. Descreve com IA (1x, best-effort). Limita 25/festa e 5/momento (curadoria
// + controla o custo da visão da IA).
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const marca = await marcaPorTokenFotos(token);
  if (!marca) return Response.json({ ok: false, erro: "Link inválido ou desativado." }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const festaId = String(form.get("festaId") || "");
    const momento = normalizarMomento(String(form.get("momento") || ""));
    if (!(file instanceof File)) return Response.json({ ok: false, erro: "Arquivo ausente." });

    // A festa precisa existir E ser desta marca (não deixa um token mandar foto pra festa alheia).
    const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
    if (!festa || festa.marcaId !== marca.id) {
      return Response.json({ ok: false, erro: "Festa não encontrada." }, { status: 404 });
    }

    // Limites (checa ANTES de subir, pra não gastar Blob/IA à toa).
    const totalFesta = await prisma.imagemMarca.count({ where: { festaId } });
    if (totalFesta >= LIMITE_FOTOS_FESTA) {
      return Response.json({ ok: false, erro: `Esta festa já atingiu o limite de ${LIMITE_FOTOS_FESTA} fotos.` });
    }
    const noMomento = await prisma.imagemMarca.count({ where: { festaId, momento } });
    if (noMomento >= LIMITE_FOTOS_MOMENTO) {
      return Response.json({ ok: false, erro: `Este momento já tem ${LIMITE_FOTOS_MOMENTO} fotos (o máximo). Escolha outro.` });
    }

    const url = await subirFotoNormalizada(file);
    const img = await prisma.imagemMarca.create({
      data: { marcaId: marca.id, url, categoria: categoriaDoMomento(momento), festaId, momento },
    });
    // A IA "olha" a foto UMA vez e descreve (pra casar com o texto na geração). Best-effort.
    const descricao = await descreverImagem(url);
    if (descricao) await prisma.imagemMarca.update({ where: { id: img.id }, data: { descricao } }).catch(() => {});

    return Response.json({ ok: true, id: img.id, url });
  } catch (e) {
    console.error("Erro no upload do Álbum da Festa:", e);
    return Response.json({ ok: false, erro: "Falha no upload. Tente de novo." });
  }
}
