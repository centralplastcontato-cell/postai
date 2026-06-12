import { prisma } from "@/lib/prisma";
import { publicarNasRedes, urlsAbsolutas, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Piloto automático: para CADA marca conectada, posta no Instagram o carrossel e
 * o feed que estão "a_postar" com data <= agora (1 de cada por marca, por execução).
 * Protegido por CRON_SECRET (header Authorization: Bearer <segredo>).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
    }
  }

  const agora = new Date();
  const base = baseUrl();
  const marcas = await prisma.marca.findMany({ where: { ativa: true } });

  const resultados: {
    marca: string;
    tipo: "carrossel" | "feed";
    titulo: string;
    ok: boolean;
    erro?: string;
  }[] = [];

  for (const m of marcas) {
    if (!marcaConectada(m)) continue;

    // Carrossel
    const c = await prisma.conteudo.findFirst({
      where: { marcaId: m.id, status: "a_postar", data: { lte: agora } },
      orderBy: { data: "asc" },
    });
    if (c) {
      let caminhos: string[] = [];
      try {
        caminhos = JSON.parse(c.slides) as string[];
      } catch {}
      const urls = urlsAbsolutas(base, caminhos);
      if (urls.length >= 1) {
        const legenda = `${c.legenda}\n\n${c.hashtags}`.trim().slice(0, 2200);
        const r = await publicarNasRedes(m, urls, legenda);
        if (r.ig.ok) {
          await prisma.conteudo.update({ where: { id: c.id }, data: { status: "postado" } });
          const onde = r.fb?.ok ? "Instagram + Facebook" : "Instagram";
          await registrarAtividade(APP_NAME, `Postei "${c.titulo}" no ${onde} de ${m.nome} (auto).`, m.id);
        }
        resultados.push({ marca: m.nome, tipo: "carrossel", titulo: c.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
      }
    }

    // Feed
    const p = await prisma.publicacao.findFirst({
      where: { marcaId: m.id, status: "a_postar", data: { lte: agora } },
      orderBy: { data: "asc" },
    });
    if (p) {
      const legenda = `${p.legenda}\n\n${p.hashtags}`.trim().slice(0, 2200);
      const r = await publicarNasRedes(m, [`${base}/api/feed/${p.id}`], legenda);
      if (r.ig.ok) {
        await prisma.publicacao.update({ where: { id: p.id }, data: { status: "postado" } });
        const onde = r.fb?.ok ? "Instagram + Facebook" : "Instagram";
        await registrarAtividade(APP_NAME, `Postei "${p.titulo}" no ${onde} de ${m.nome} (auto).`, m.id);
      }
      resultados.push({ marca: m.nome, tipo: "feed", titulo: p.titulo, ok: r.ig.ok, erro: r.ig.ok ? undefined : r.ig.erro });
    }
  }

  return Response.json({
    ok: true,
    marcas: marcas.length,
    postados: resultados.filter((r) => r.ok).length,
    resultados,
  });
}
