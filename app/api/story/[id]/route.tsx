import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { LayoutStory, type DadosArte } from "@/lib/arte-layouts";

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

  let extra: { oferta?: string; validade?: string; corFundo?: string; estiloStory?: string } = {};
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

  return new ImageResponse(
    LayoutStory({ ...base, oferta: extra.oferta, validade: extra.validade, corFundo: extra.corFundo, imagemUrl: p.imagemUrl || undefined, variante: extra.estiloStory }),
    { width: 1080, height: 1920, fonts, headers: CACHE }
  );
}
