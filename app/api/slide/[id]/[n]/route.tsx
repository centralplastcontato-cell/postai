import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { fotoSegura, fotosSeguras } from "@/lib/foto-arte";
import { LayoutAnivCapa, LayoutAnivCard, LayoutMosaico, LayoutCapaFestiva, LayoutCapaFoto, LayoutCapaMoldura, LayoutCapaFaixa } from "@/lib/arte-layouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache forte: as URLs no painel levam ?v=<hash do conteúdo>, então uma arte já
// renderizada é servida do cache (CDN/navegador) — instantânea ao reabrir — e o
// ?v= troca sozinho quando o conteúdo muda.
const CACHE = { "cache-control": "public, max-age=31536000, immutable" };

type Slide = { tipo?: string; titulo?: string; texto?: string; imagemUrl?: string; fotos?: string[]; corFundo?: string };

export async function GET(req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  const idx = Math.max(1, parseInt(n, 10) || 1) - 1;
  const origin = new URL(req.url).origin;

  let slide: Slide = { tipo: "capa", titulo: "Postaí", texto: "" };
  let cor = "#7C3AED";
  let fundo = "#0E0E0E";
  let marcaTexto = "POSTAÍ";
  let site = "";
  let telefone = "";
  let paleta: string[] = [];
  let logoSrc = "";
  try {
    const c = await prisma.conteudo.findUnique({ where: { id }, include: { marca: true } });
    if (c) {
      cor = c.marca.corPrimaria || cor;
      fundo = c.marca.corFundo || fundo;
      marcaTexto = (c.marca.logoTexto || c.marca.nome).toUpperCase();
      site = c.marca.site || "";
      telefone = c.marca.telefone || "";
      paleta = paletaDaMarca(c.marca.paleta, c.marca.corPrimaria);
      logoSrc = c.marca.logoUrl ? logoUrlMarca(origin, c.marca.id) : "";
      const arr = JSON.parse(c.slidesTexto || "[]") as Slide[];
      if (arr[idx]) slide = arr[idx];
    }
  } catch {}

  // Normaliza a foto do slide pra PNG/JPEG (o next/og não aceita webp/avif do banco).
  const fotoSlide = await fotoSegura(slide.imagemUrl);

  // Capa em Mosaico: 4 fotos reais do banco em círculos, com a cara da marca.
  if (slide.tipo === "mosaico") {
    const fonts = carregarFontes();
    const el = LayoutMosaico({
      paleta,
      logoSrc,
      site,
      telefone,
      titulo: montarTituloColorido(slide.titulo || "Conheça nosso espaço", paleta),
      oferta: slide.texto || undefined,
      fotos: await fotosSeguras(slide.fotos),
      corFundo: slide.corFundo,
      arraste: true,
    });
    return new ImageResponse(el, { width: 1080, height: 1350, fonts, headers: CACHE });
  }

  // Capas de ESTILO (festiva/foto/moldura/faixa): a capa do carrossel num visual
  // próprio. corFundo = cor escolhida (ou automático). arraste:true = é capa.
  if (slide.tipo === "capa-festiva" || slide.tipo === "capa-foto" || slide.tipo === "capa-moldura" || slide.tipo === "capa-faixa") {
    const fonts = carregarFontes();
    const dados = {
      paleta,
      logoSrc,
      site,
      telefone,
      titulo: montarTituloColorido(slide.titulo || "Conheça nosso espaço", paleta),
      textoApoio: slide.texto || undefined,
      imagemUrl: fotoSlide,
      corFundo: slide.corFundo,
      arraste: true,
    };
    const el =
      slide.tipo === "capa-festiva"
        ? LayoutCapaFestiva(dados)
        : slide.tipo === "capa-foto"
          ? LayoutCapaFoto(dados)
          : slide.tipo === "capa-moldura"
            ? LayoutCapaMoldura(dados)
            : LayoutCapaFaixa(dados);
    return new ImageResponse(el, { width: 1080, height: 1350, fonts, headers: CACHE });
  }

  // Slides festivos (Aniversariantes da Semana): layout colorido com a cara da marca.
  if (slide.tipo === "aniv-capa" || slide.tipo === "aniv") {
    const fonts = carregarFontes();
    const dados = { paleta, logoSrc, site, telefone, titulo: montarTituloColorido(slide.titulo || "Aniversariantes da Semana", paleta) };
    const el =
      slide.tipo === "aniv-capa"
        ? LayoutAnivCapa({ ...dados, textoApoio: slide.texto })
        : LayoutAnivCard({ ...dados, nome: slide.titulo, idade: slide.texto, fotoUrl: fotoSlide });
    return new ImageResponse(el, { width: 1080, height: 1350, fonts, headers: CACHE });
  }

  const tipo = slide.tipo ?? "conteudo";
  const isCapa = tipo === "capa";
  const isCta = tipo === "cta";
  const bg = isCapa ? cor : fundo;
  const CINZA = "#C9C9C9";

  // Faixa da marca: logo (se houver) ou o texto. `claro` = sobre fundo colorido.
  // Usa logoSrc (servido via /api/marca-logo) — o logoUrl cru é base64 e não
  // renderiza no next/og (por isso o logo não aparecia no carrossel).
  const marcaEl = (claro: boolean) =>
    logoSrc ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoSrc} width={Math.round(72 * 1.76)} height={72} style={{ objectFit: "contain" }} />
    ) : (
      <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2, color: claro ? "#ffffff" : cor }}>{marcaTexto}</span>
    );

  // Slide com foto de fundo: texto ancorado embaixo, gradiente forte só na base.
  if (fotoSlide) {
    const sombra = "0 2px 12px rgba(0,0,0,0.6)";
    return new ImageResponse(
      (
        <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoSlide} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1080px",
              height: "1350px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "80px",
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 24%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.72) 76%, rgba(0,0,0,0.94) 100%)",
            }}
          >
            <div style={{ display: "flex" }}>{marcaEl(true)}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", width: 90, height: 8, backgroundColor: cor, borderRadius: 4, marginBottom: 28 }} />
              {slide.titulo ? <div style={{ display: "flex", fontSize: isCapa ? 82 : 68, fontWeight: 800, color: "#fff", lineHeight: 1.04, textShadow: sombra }}>{slide.titulo}</div> : null}
              {slide.texto ? <div style={{ display: "flex", marginTop: 20, fontSize: 36, color: "rgba(255,255,255,0.88)", lineHeight: 1.3, textShadow: sombra }}>{slide.texto}</div> : null}
              {isCta && telefone ? (
                <div style={{ marginTop: 32, display: "flex", backgroundColor: cor, color: "#fff", fontSize: 34, fontWeight: 700, padding: "18px 32px", borderRadius: 999 }}>{telefone}</div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.25)" }}>
                <span style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>{site}</span>
                {isCapa ? <span style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "#fff" }}>arraste →</span> : null}
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1350, headers: CACHE }
    );
  }

  // Fallback (sem foto): cor sólida.
  return new ImageResponse(
    (
      <div style={{ width: "1080px", height: "1350px", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: bg, padding: "90px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center" }}>{marcaEl(isCapa)}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {!isCapa && <div style={{ display: "flex", width: 90, height: 8, backgroundColor: cor, borderRadius: 4, marginBottom: 36 }} />}
          <div style={{ fontSize: isCapa ? 92 : 70, fontWeight: 800, color: "#fff", lineHeight: 1.05, display: "flex" }}>{slide.titulo ?? ""}</div>
          {slide.texto ? <div style={{ marginTop: 32, fontSize: 40, color: isCapa ? "#fff" : CINZA, lineHeight: 1.3, display: "flex" }}>{slide.texto}</div> : null}
          {isCta && telefone ? (
            <div style={{ marginTop: 48, display: "flex", backgroundColor: isCapa ? "#fff" : cor, color: isCapa ? cor : "#fff", fontSize: 38, fontWeight: 700, padding: "26px 40px", borderRadius: 16 }}>{telefone}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: isCapa ? "#fff" : "#7a7a7a" }}>
          <span>{site}</span>
          <span>{isCapa ? "arraste →" : ""}</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: CACHE }
  );
}
