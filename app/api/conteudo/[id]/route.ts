import { prisma } from "@/lib/prisma";
import { guardaConteudo } from "@/lib/acesso";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Anti-IDOR: admin OU dono do carrossel (a guarda resolve a marca pelo conteúdo). Antes
  // checava só "está logado?", o que deixava um cliente excluir conteúdo de outra marca.
  const g = await guardaConteudo(id);
  if (!g.ok) return Response.json({ ok: false, erro: g.erro }, { status: 403 });

  try {
    const c = await prisma.conteudo.findUnique({ where: { id }, select: { marcaId: true } });
    if (!c) return Response.json({ ok: false, erro: "Conteúdo não encontrado." }, { status: 404 });
    await prisma.conteudo.delete({ where: { id } });
    try {
      revalidatePath(`/painel/marcas/${c.marcaId}`);
    } catch {}
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir conteudo:", e);
    return Response.json({ ok: false, erro: "Erro ao excluir." }, { status: 500 });
  }
}
