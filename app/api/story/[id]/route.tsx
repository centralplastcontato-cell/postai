import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { fotoSegura } from "@/lib/foto-arte";
import { LayoutStory, LayoutFeedback, type DadosArte } from "@/lib/arte-layouts";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Render do STORY (9:16, 1080x1920). Funciona pra QUALQUER publicação: a versão vertical
// do mesmo conteúdo. Usado tanto pelos Stories avulsos (formato=story) quanto pelo
// espelhamento automático do feed (posta /api/story/<id do post de feed>).
const CACHE = { "cache-control": "public, max-age=31536000, immutable" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;

  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  const fonts = carregarFontes();

  if (!p) {
    return new ImageResponse(
      <div style={{ width: "1080px", height: "1920px", display: "flex", backgroundColor: "#7c3aed" }} />,
      { width: 1080, height: 1920, fonts, headers: CACHE }
    );
  }

  const marca = p.marca;
  const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
  const logoSrc = marca.logoUrl ? logoUrlMarca(origin, marca.id) : "";

  let extra: {
    oferta?: string; validade?: string; corFundo?: string; estiloStory?: string;
    depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string; fotoAutor?: string; google?: boolean;
  } = {};
  try {
    extra = JSON.parse(p.extra || "{}");
  } catch {}

  const base: DadosArte = {
    paleta,
    logoSrc,
    site: marca.site || "",
    telefone: marca.telefone || "",
    titulo: montarTituloColorido(p.titulo, paleta),
    textoApoio: p.texto || "",
  };

  const imagemUrl = await fotoSegura(p.imagemUrl);
  const opts = { width: 1080, height: 1920, fonts, headers: CACHE };
  const dados = { ...base, oferta: extra.oferta, validade: extra.validade, corFundo: extra.corFundo, variante: extra.estiloStory };

  // FEEDBACK/DEPOIMENTO: o Story usa o MESMO card roxo do feed (LayoutFeedback), só em 9:16
  // (mesma largura 1080, altura 1920). Sem isso, o espelhamento saía só com a foto de fundo.
  if (p.template === "feedback") {
    const fotoAutor = await fotoSegura(extra.fotoAutor);
    const fb = {
      ...base,
      corFundo: extra.corFundo,
      depoimento: extra.depoimento,
      autor: extra.autor,
      estrelas: extra.estrelas,
      destaque: extra.destaque,
      corCard: extra.corCard,
      google: extra.google,
      altura: 1920,
    };
    try {
      const buf = await new ImageResponse(LayoutFeedback({ ...fb, imagemUrl, fotoAutor }), opts).arrayBuffer();
      return new Response(buf, { headers: { ...CACHE, "content-type": "image/png" } });
    } catch (e) {
      console.error("STORY feedback render COM foto falhou:", e);
      registrarAtividade(AGENTE, `A arte do Story (depoimento) "${p.titulo}" não renderizou com a foto (${msg(e)}) — caiu no card sobre fundo colorido.`, p.marcaId).catch(() => {});
      try {
        const buf = await new ImageResponse(LayoutFeedback({ ...fb, imagemUrl: undefined, fotoAutor: undefined }), opts).arrayBuffer();
        return new Response(buf, { headers: { ...CACHE, "content-type": "image/png" } });
      } catch {
        return new ImageResponse(LayoutFeedback({ ...fb, imagemUrl: undefined, fotoAutor: undefined }), opts);
      }
    }
  }

  // Render À PROVA DE FALHA: tenta COM a foto; se o Satori quebrar por causa dela (era o
  // "Arte indisponível 500"), registra o MOTIVO REAL nas Atividades e cai pra versão SEM
  // foto (fundo colorido). O Story nunca mais fica quebrado/500.
  try {
    const buf = await new ImageResponse(LayoutStory({ ...dados, imagemUrl }), opts).arrayBuffer();
    return new Response(buf, { headers: { ...CACHE, "content-type": "image/png" } });
  } catch (e) {
    console.error("STORY render COM foto falhou:", e);
    if (imagemUrl) {
      registrarAtividade(AGENTE, `A arte do Story "${p.titulo}" não renderizou COM a foto (${msg(e)}) — caiu no fundo colorido.`, p.marcaId).catch(() => {});
    }
    try {
      const buf = await new ImageResponse(LayoutStory({ ...dados, imagemUrl: undefined }), opts).arrayBuffer();
      return new Response(buf, { headers: { ...CACHE, "content-type": "image/png" } });
    } catch {
      return new ImageResponse(LayoutStory({ ...dados, imagemUrl: undefined }), opts);
    }
  }
}
