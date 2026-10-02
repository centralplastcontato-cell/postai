import { prisma } from "@/lib/prisma";
import { marcaDaChave, respostaErro, buscarPorId, postParaJson, apagarMidiasDoRegistro } from "@/lib/api-externa";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const naoEncontrado = () => respostaErro(404, [{ campo: "id", codigo: "NAO_ENCONTRADO", mensagem: "Post não encontrado nesta marca." }]);

// GET /api/v1/posts/{id} — status, motivo da falha e link do post no Instagram.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await marcaDaChave(req);
  if (!auth.ok) return respostaErro(auth.status, auth.erro);
  const { id } = await ctx.params;
  const reg = await buscarPorId(auth.marca.id, id).catch(() => null);
  if (!reg) return naoEncontrado();
  return Response.json({ ok: true, post: await postParaJson(reg, auth.marca) });
}

// DELETE /api/v1/posts/{id} — cancela enquanto NÃO foi publicado. Apaga o post e as mídias copiadas.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await marcaDaChave(req);
  if (!auth.ok) return respostaErro(auth.status, auth.erro);
  const { id } = await ctx.params;
  const reg = await buscarPorId(auth.marca.id, id).catch(() => null);
  if (!reg) return naoEncontrado();

  // Atômico: só apaga se ainda não foi publicado (o piloto marca "postado" ANTES de publicar,
  // então um post no meio da publicação também não é cancelado).
  const onde = { id, marcaId: auth.marca.id, origem: "api", NOT: { status: "postado" } };
  const r = reg.tipo === "carrossel" ? await prisma.conteudo.deleteMany({ where: onde }) : await prisma.publicacao.deleteMany({ where: onde });
  if (r.count === 0) {
    return respostaErro(409, [{ campo: "id", codigo: "JA_PUBLICADO", mensagem: "Esse post já foi publicado (ou está sendo publicado agora) — não dá mais para cancelar." }]);
  }
  await apagarMidiasDoRegistro(reg);
  const titulo = reg.tipo === "carrossel" ? reg.c.titulo : reg.p.titulo;
  await registrarAtividade(AGENTE, `A automação cancelou "${titulo}".`, auth.marca.id).catch(() => {});
  return Response.json({ ok: true, cancelado: true, id });
}
