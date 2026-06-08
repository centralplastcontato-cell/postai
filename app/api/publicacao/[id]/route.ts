import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const cookieHeader = req.headers.get("cookie");
    console.log("[DELETE /api/publicacao] cookie:", cookieHeader);
  } catch (e) {
    console.log("[DELETE /api/publicacao] cannot read cookie header", e);
  }

  if (!(await estaLogado())) {
    console.log("[DELETE /api/publicacao] not logged in (estaLogado=false)");
    return Response.json({ ok: false, erro: "Sem permissão." }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const p = await prisma.publicacao.findUnique({ where: { id } });
    if (!p) return Response.json({ ok: false, erro: "Publicação não encontrada." }, { status: 404 });
    await prisma.publicacao.delete({ where: { id } });
    try {
      revalidatePath(`/painel/marcas/${p.marcaId}`);
    } catch {}
    console.log("[DELETE /api/publicacao] deleted", id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir publicacao:", e);
    return Response.json({ ok: false, erro: "Erro ao excluir." }, { status: 500 });
  }
}
