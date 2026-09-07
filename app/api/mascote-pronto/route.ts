import { prisma } from "@/lib/prisma";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback do MOTOR pra a HISTÓRIA EM CENAS do mascote: quando ele termina de EMENDAR as cenas num
// vídeo só, chama aqui com a URL final (ou o erro). Validado por segredo (VIDEO_CALLBACK_SECRET).
// Sucesso → guarda a história na galeria de clipes da marca. Nos dois casos, apaga as CENAS soltas
// (eram temporárias — o vídeo final já tem tudo).
export async function POST(req: Request) {
  const secret = process.env.VIDEO_CALLBACK_SECRET || "";
  const body = (await req.json().catch(() => ({}))) as { marcaId?: string; videoUrl?: string; cenas?: unknown; ok?: boolean; erro?: string; token?: string };
  if (!secret || body.token !== secret) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const marcaId = body.marcaId;
  if (!marcaId) return Response.json({ ok: false, erro: "Sem marcaId." }, { status: 400 });

  const cenas = Array.isArray(body.cenas) ? (body.cenas as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http")) : [];
  try {
    const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
    if (!marca) return Response.json({ ok: true, aviso: "Marca não encontrada — descartado." });

    if (body.ok && body.videoUrl) {
      let atuais: string[] = [];
      try { const a = JSON.parse(marca.mascoteClipes || "[]"); atuais = Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string" && x.startsWith("http")) : []; } catch {}
      const novos = [body.videoUrl, ...atuais].slice(0, 30);
      await prisma.marca.update({ where: { id: marcaId }, data: { mascoteClipes: JSON.stringify(novos) } });
      await registrarAtividade(AGENTE, "🎬 A história do castelinho (cenas juntas) ficou pronta!", marcaId).catch(() => {});
    } else {
      await registrarAtividade(AGENTE, `Não consegui juntar as cenas da história do castelinho: ${body.erro || "erro"}`, marcaId).catch(() => {});
    }

    // Cenas soltas eram temporárias → tira do Blob (deu certo ou não).
    if (cenas.length) {
      const { del } = await import("@vercel/blob");
      await Promise.all(cenas.map((c) => del(c).catch(() => {})));
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro no callback da história do mascote:", e);
    return Response.json({ ok: false, erro: "Erro ao salvar a história." }, { status: 500 });
  }
}
