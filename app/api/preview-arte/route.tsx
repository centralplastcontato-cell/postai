import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { LayoutPromocao, LayoutDataComemorativa, LayoutDivulgacao, LayoutAnivCapa, LayoutAnivCard, type DadosArte } from "@/lib/arte-layouts";

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

  const tituloParam = url.searchParams.get("titulo");
  const imagemUrl = url.searchParams.get("imagem") || undefined;

  let elemento;
  if (template === "data-comemorativa") {
    elemento = LayoutDataComemorativa({
      ...base,
      titulo: montarTituloColorido(tituloParam || "Feliz Natal!", paleta),
      textoApoio: "Que essa data seja cheia de alegria e diversão pra toda a família!",
      selo: "25 de Dezembro",
      imagemUrl,
    });
  } else if (template === "divulgacao") {
    elemento = LayoutDivulgacao({
      ...base,
      titulo: montarTituloColorido(tituloParam || "A festa dos sonhos começa aqui", paleta),
      diferenciais: ["Monitores treinados", "Buffet completo", "Decoração temática", "Espaço seguro"],
    });
  } else if (template === "aniv-capa") {
    elemento = LayoutAnivCapa({
      ...base,
      titulo: montarTituloColorido("Aniversariantes da Semana", paleta),
      textoApoio: "Semana de 08 a 14 de junho",
    });
  } else if (template === "aniv") {
    elemento = LayoutAnivCard({
      ...base,
      titulo: [],
      nome: tituloParam || "Murilo",
      idade: "8 aninhos",
      fotoUrl: imagemUrl || "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&q=80",
    });
  } else {
    elemento = LayoutPromocao({
      ...base,
      titulo: montarTituloColorido(tituloParam || "Festeje a Copa 2026!", paleta),
      oferta: "10 CRIANÇAS GRÁTIS",
      inclui: ["2h de salão exclusivo", "Monitor de recreação", "Decoração temática", "Bolo e docinhos"],
      validade: "Válido até 30/06",
      regras: "Seg a qui · mediante reserva · não cumulativo",
    });
  }

  return new ImageResponse(elemento, { width: 1080, height: 1350, fonts: carregarFontes() });
}
