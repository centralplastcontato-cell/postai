import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { fotoSegura, fotosSeguras } from "@/lib/foto-arte";
import { LayoutPromocao, LayoutFoto, LayoutDataComemorativa, LayoutDivulgacao, LayoutMosaico, LayoutCapaMoldura, LayoutCapaFaixa, LayoutFeedback, LayoutPreco, type DadosArte } from "@/lib/arte-layouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache forte: as URLs no painel levam ?v=<hash do conteúdo>, então a arte já
// renderizada vem do cache (CDN/navegador) e o ?v= troca quando o conteúdo muda.
const CACHE = { "cache-control": "public, max-age=31536000, immutable" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;

  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  const fonts = carregarFontes();

  if (!p) {
    return new ImageResponse(
      <div style={{ width: "1080px", height: "1350px", display: "flex", backgroundColor: "#2196F3" }} />,
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  const marca = p.marca;
  const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
  const logoSrc = marca.logoUrl ? logoUrlMarca(origin, marca.id) : "";

  let extra: { oferta?: string; validade?: string; inclui?: string[]; regras?: string; selo?: string; diferenciais?: string[]; corFundo?: string; fotos?: string[]; depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string; precoDe?: string; precoPor?: string; labelPor?: string; parcelas?: string; economia?: string; condicoes?: string[]; modoPreco?: string } = {};
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

  // Normaliza a foto pra um formato que o next/og aceita (PNG/JPEG) — senão webp/avif
  // do banco quebram o render. Feito uma vez e reusado pelos templates com foto.
  const fotoUrl = await fotoSegura(p.imagemUrl);

  if (p.template === "promocao") {
    return new ImageResponse(
      LayoutPromocao({ ...base, oferta: extra.oferta, validade: extra.validade, inclui: extra.inclui, regras: extra.regras, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "data-comemorativa") {
    return new ImageResponse(
      LayoutDataComemorativa({ ...base, selo: extra.selo, corFundo: extra.corFundo, imagemUrl: fotoUrl }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "divulgacao") {
    return new ImageResponse(
      LayoutDivulgacao({ ...base, diferenciais: extra.diferenciais, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "mosaico") {
    return new ImageResponse(
      LayoutMosaico({ ...base, oferta: extra.oferta, validade: extra.validade, corFundo: extra.corFundo, fotos: await fotosSeguras(extra.fotos) }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "moldura") {
    return new ImageResponse(
      LayoutCapaMoldura({ ...base, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "faixa") {
    return new ImageResponse(
      LayoutCapaFaixa({ ...base, corFundo: extra.corFundo, imagemUrl: fotoUrl }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "feedback") {
    return new ImageResponse(
      LayoutFeedback({ ...base, titulo: [], imagemUrl: fotoUrl, depoimento: extra.depoimento, autor: extra.autor, estrelas: extra.estrelas, destaque: extra.destaque, corCard: extra.corCard }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  if (p.template === "preco") {
    return new ImageResponse(
      LayoutPreco({ ...base, modoPreco: extra.modoPreco, precoDe: extra.precoDe, precoPor: extra.precoPor, labelPor: extra.labelPor, parcelas: extra.parcelas, economia: extra.economia, condicoes: extra.condicoes, validade: extra.validade, corFundo: extra.corFundo }),
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  // dica e templates legados: foto de IA (ou cor sólida se ainda não tem foto)
  return new ImageResponse(
    LayoutFoto({ ...base, imagemUrl: fotoUrl }),
    { width: 1080, height: 1350, fonts, headers: CACHE }
  );
}
