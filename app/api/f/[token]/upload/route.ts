import { prisma } from "@/lib/prisma";
import { marcaPorTokenFotos } from "@/lib/festa";
import { subirFotoNormalizada } from "@/lib/blob-upload";
import { descreverImagem } from "@/lib/imagem-ia";

export const runtime = "nodejs";

// Upload PÚBLICO do Álbum da Festa: o gerente sobe fotos sem login. Autorizado pelo TOKEN
// do link (não pela sessão). A foto vira ImagemMarca (categoria "festa") amarrada à festa —
// assim já entra no rodízio das artes E fica organizada por evento. Descreve com IA (1x,
// best-effort) igual ao upload do painel, pra a foto casar com o texto dos posts.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const marca = await marcaPorTokenFotos(token);
  if (!marca) return Response.json({ ok: false, erro: "Link inválido ou desativado." }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const festaId = String(form.get("festaId") || "");
    if (!(file instanceof File)) return Response.json({ ok: false, erro: "Arquivo ausente." });

    // A festa precisa existir E ser desta marca (não deixa um token mandar foto pra festa alheia).
    const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
    if (!festa || festa.marcaId !== marca.id) {
      return Response.json({ ok: false, erro: "Festa não encontrada." }, { status: 404 });
    }

    const url = await subirFotoNormalizada(file);
    const img = await prisma.imagemMarca.create({
      data: { marcaId: marca.id, url, categoria: "festa", festaId },
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
