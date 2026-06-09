import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { LayoutPromocao, LayoutFoto, LayoutDataComemorativa, LayoutDivulgacao, type DadosArte } from "@/lib/arte-layouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;

  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  const fonts = carregarFontes();

  if (!p) {
    return new ImageResponse(
      <div style={{ width: "1080px", height: "1350px", display: "flex", backgroundColor: "#2196F3" }} />,
      { width: 1080, height: 1350, fonts }
    );
  }

  const marca = p.marca;
  const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
  const logoSrc = marca.logoUrl ? logoUrlMarca(origin, marca.id) : "";

  let extra: { oferta?: string; validade?: string; inclui?: string[]; regras?: string; selo?: string; diferenciais?: string[]; corFundo?: string } = {};
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

  if (p.template === "promocao") {
    return new ImageResponse(
      LayoutPromocao({ ...base, oferta: extra.oferta, validade: extra.validade, inclui: extra.inclui, regras: extra.regras, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts }
    );
  }

  if (p.template === "data-comemorativa") {
    return new ImageResponse(
      LayoutDataComemorativa({ ...base, selo: extra.selo, corFundo: extra.corFundo, imagemUrl: p.imagemUrl || undefined }),
      { width: 1080, height: 1350, fonts }
    );
  }

  if (p.template === "divulgacao") {
    return new ImageResponse(
      LayoutDivulgacao({ ...base, diferenciais: extra.diferenciais, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts }
    );
  }

  // dica e templates legados: foto de IA (ou cor sólida se ainda não tem foto)
  return new ImageResponse(
    LayoutFoto({ ...base, imagemUrl: p.imagemUrl || undefined }),
    { width: 1080, height: 1350, fonts }
  );
}
