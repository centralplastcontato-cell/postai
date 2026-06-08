import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { LayoutPromocao, type DadosArte } from "@/lib/arte-layouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PILOTO/galeria visual (fora do fluxo de produção): renderiza um template com
// dados de exemplo da marca pra validar a direção de arte.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtro = (url.searchParams.get("marca") || "castelo").toLowerCase();
  const template = url.searchParams.get("template") || "promocao";

  const marcas = await prisma.marca.findMany();
  const marca = marcas.find((m) => (m.nome || "").toLowerCase().includes(filtro)) || marcas[0];

  const cor = marca?.corPrimaria || "#FF4F4F";
  const paleta = paletaDaMarca(marca?.paleta ?? null, cor);
  const logoSrc = marca?.logoUrl ? logoUrlMarca(url.origin, marca.id) : "";

  const base: DadosArte = {
    paleta,
    logoSrc,
    site: marca?.site || "www.castelodadiversao.com.br",
    telefone: marca?.telefone || "15974034646",
    titulo: [],
  };

  const tituloTexto = url.searchParams.get("titulo") || "Seu filho merece um Castelo";
  const elemento = LayoutPromocao({
    ...base,
    titulo: montarTituloColorido(tituloTexto, paleta),
    textoApoio: "Contrate sua festa e ganhe brindes especiais pro seu pequeno.",
    oferta: "10 CRIANÇAS GRÁTIS",
    validade: "⚠ Válido para os 10 primeiros contratos",
  });

  return new ImageResponse(elemento, { width: 1080, height: 1350, fonts: carregarFontes() });
}
