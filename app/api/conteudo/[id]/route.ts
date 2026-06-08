import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Debug: log cookie header to help diagnose auth failures
  try {
    const cookieHeader = req.headers.get("cookie");
    console.log("[DELETE /api/conteudo] cookie:", cookieHeader);
  } catch (e) {
    console.log("[DELETE /api/conteudo] cannot read cookie header", e);
  }

  if (!(await estaLogado())) {
    console.log("[DELETE /api/conteudo] not logged in (estaLogado=false)");
    return Response.json({ ok: false, erro: "Sem permissão." }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const c = await prisma.conteudo.findUnique({ where: { id } });
    if (!c) return Response.json({ ok: false, erro: "Conteúdo não encontrado." }, { status: 404 });
    await prisma.conteudo.delete({ where: { id } });
    try {
      revalidatePath(`/painel/marcas/${c.marcaId}`);
    } catch {}
    console.log("[DELETE /api/conteudo] deleted", id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir conteudo:", e);
    return Response.json({ ok: false, erro: "Erro ao excluir." }, { status: 500 });
  }
}
