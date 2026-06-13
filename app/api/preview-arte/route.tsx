import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { LayoutPromocao, LayoutDataComemorativa, LayoutDivulgacao, LayoutAnivCapa, LayoutAnivCard, LayoutMosaico, LayoutCapaFestiva, LayoutCapaFoto, LayoutCapaMoldura, LayoutCapaFaixa, LayoutFeedback, type DadosArte } from "@/lib/arte-layouts";

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
  } else if (template === "mosaico") {
    // Puxa até 4 fotos reais do banco da marca pra ver o mosaico de verdade.
    const banco = marca
      ? await prisma.imagemMarca.findMany({ where: { marcaId: marca.id }, orderBy: { criadoEm: "asc" }, take: 4, select: { url: true } })
      : [];
    const fotos = banco.length
      ? banco.map((b) => b.url)
      : [
          "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
          "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80",
          "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=800&q=80",
          "https://images.unsplash.com/photo-1543237087-e6d1f1a01a37?w=800&q=80",
        ];
    elemento = LayoutMosaico({
      ...base,
      titulo: montarTituloColorido(tituloParam || "Especial de Férias", paleta),
      oferta: "CONDIÇÃO ESPECIAL",
      validade: "Datas de julho",
      fotos,
      // ?arraste=1 mostra o "arraste →" (como fica de CAPA de carrossel).
      arraste: url.searchParams.get("arraste") === "1",
    });
  } else if (template === "capa-festiva") {
    elemento = LayoutCapaFestiva({
      ...base,
      titulo: montarTituloColorido(tituloParam || "Especial de Férias", paleta),
      textoApoio: "Diversão garantida pra criançada!",
      arraste: true,
      corFundo: url.searchParams.get("cor") || undefined,
    });
  } else if (template === "capa-foto" || template === "capa-faixa") {
    const banco = marca ? await prisma.imagemMarca.findFirst({ where: { marcaId: marca.id }, orderBy: { criadoEm: "asc" }, select: { url: true } }) : null;
    const foto = banco?.url || "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=900&q=80";
    const dados = {
      ...base,
      titulo: montarTituloColorido(tituloParam || "Conheça nosso espaço", paleta),
      textoApoio: "Diversão garantida pra criançada!",
      imagemUrl: foto,
      arraste: true,
      corFundo: url.searchParams.get("cor") || undefined,
    };
    elemento = template === "capa-foto" ? LayoutCapaFoto(dados) : LayoutCapaFaixa(dados);
  } else if (template === "feedback") {
    const banco = marca ? await prisma.imagemMarca.findFirst({ where: { marcaId: marca.id }, orderBy: { criadoEm: "asc" }, select: { url: true } }) : null;
    const foto = banco?.url || "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1000&q=80";
    elemento = LayoutFeedback({
      ...base,
      titulo: [],
      imagemUrl: foto,
      estrelas: 5,
      destaque: "Excelente atendimento!",
      depoimento:
        "Só tenho a agradecer! Gostei do desempenho de todos, muito atenciosos e educados. Atendimento de primeira qualidade, a festa do meu filho foi perfeita. Recomendo de olhos fechados!",
      autor: "Mariana S.",
      corCard: url.searchParams.get("card") || undefined,
    });
  } else if (template === "capa-moldura") {
    elemento = LayoutCapaMoldura({
      ...base,
      titulo: montarTituloColorido(tituloParam || "Festa dos Sonhos", paleta),
      textoApoio: "Diversão garantida pra criançada!",
      arraste: true,
      corFundo: url.searchParams.get("cor") || undefined,
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
      validade: url.searchParams.get("validade") || "30/06/2026",
      regras: "Seg a qui · mediante reserva · não cumulativo",
      corFundo: url.searchParams.get("cor") || undefined,
    });
  }

  return new ImageResponse(elemento, { width: 1080, height: 1350, fonts: carregarFontes() });
}
