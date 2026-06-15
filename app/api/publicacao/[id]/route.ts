import { prisma } from "@/lib/prisma";
import { guardaPublicacao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Anti-IDOR: admin OU dono da publicação (a guarda resolve a marca pela publicação).
  const g = await guardaPublicacao(id);
  if (!g.ok) return Response.json({ ok: false, erro: g.erro }, { status: 403 });

  try {
    const p = await prisma.publicacao.findUnique({ where: { id }, select: { marcaId: true } });
    if (!p) return Response.json({ ok: false, erro: "Publicação não encontrada." }, { status: 404 });
    await prisma.publicacao.delete({ where: { id } });
    try {
      revalidatePath(`/painel/marcas/${p.marcaId}`);
    } catch {}
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir publicacao:", e);
    return Response.json({ ok: false, erro: "Erro ao excluir." }, { status: 500 });
  }
}
