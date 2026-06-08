import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve o logo da marca como imagem binária (o gerador de artes não renderiza
// data URIs em base64, mas busca imagens por URL normalmente).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await prisma.marca.findUnique({ where: { id }, select: { logoUrl: true } });
  const data = m?.logoUrl || "";
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(data);
  if (!match) return new Response("sem logo", { status: 404 });
  const buf = Buffer.from(match[2], "base64");
  return new Response(buf, {
    headers: { "Content-Type": match[1], "Cache-Control": "public, max-age=3600" },
  });
}
