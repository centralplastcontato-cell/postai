import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Slide = { tipo?: string; titulo?: string; texto?: string; imagemUrl?: string };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  const idx = Math.max(1, parseInt(n, 10) || 1) - 1;

  let slide: Slide = { tipo: "capa", titulo: "Postaí", texto: "" };
  let cor = "#7C3AED";
  let fundo = "#0E0E0E";
  let marcaTexto = "POSTAÍ";
  let logoUrl = "";
  let site = "";
  let telefone = "";
  let paleta: string[] = [];
  try {
    const c = await prisma.conteudo.findUnique({ where: { id }, include: { marca: true } });
    if (c) {
      cor = c.marca.corPrimaria || cor;
      fundo = c.marca.corFundo || fundo;
      marcaTexto = (c.marca.logoTexto || c.marca.nome).toUpperCase();
      logoUrl = c.marca.logoUrl || "";
      site = c.marca.site || "";
      telefone = c.marca.telefone || "";
      try {
        const pal = JSON.parse(c.marca.paleta || "[]");
        if (Array.isArray(pal)) paleta = pal.filter((x) => typeof x === "string");
      } catch {}
      const arr = JSON.parse(c.slidesTexto || "[]") as Slide[];
      if (arr[idx]) slide = arr[idx];
    }
  } catch {}

  const tipo = slide.tipo ?? "conteudo";
  const isCapa = tipo === "capa";
  const isCta = tipo === "cta";
  const bg = isCapa ? cor : fundo;
  const CINZA = "#C9C9C9";

  // Régua: faixa multicolor com as cores do logo (ou um traço só na cor principal).
  const cores = paleta.length ? paleta : [cor];
  const Regua = () => (
    <div style={{ display: "flex", marginBottom: 36 }}>
      {cores.map((c, i) => (
        <div key={i} style={{ width: 36, height: 8, backgroundColor: c, display: "flex" }} />
      ))}
    </div>
  );

  // Faixa da marca: logo (se houver) ou o texto. `claro` = sobre fundo colorido.
  const marcaEl = (claro: boolean) =>
    logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} height={72} style={{ height: "72px", width: "auto", objectFit: "contain" }} />
    ) : (
      <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2, color: claro ? "#ffffff" : cor }}>{marcaTexto}</span>
    );

  if (slide.imagemUrl) {
    return new ImageResponse(
      (
        <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px", backgroundImage: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.82))" }}>
            <div style={{ display: "flex" }}>{marcaEl(true)}</div>
            {slide.titulo || slide.texto ? (
              <div style={{ display: "flex", flexDirection: "column", padding: "44px", borderRadius: 18, backgroundImage: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.82))" }}>
                {slide.titulo ? <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>{slide.titulo}</div> : null}
                {slide.texto ? <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: "#eaeaea", lineHeight: 1.3 }}>{slide.texto}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "1080px", height: "1350px", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: bg, padding: "90px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center" }}>{marcaEl(isCapa)}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {!isCapa && <Regua />}
          <div style={{ fontSize: isCapa ? 92 : 70, fontWeight: 800, color: "#fff", lineHeight: 1.05, display: "flex" }}>{slide.titulo ?? ""}</div>
          {slide.texto ? <div style={{ marginTop: 32, fontSize: 40, color: isCapa ? "#fff" : CINZA, lineHeight: 1.3, display: "flex" }}>{slide.texto}</div> : null}
          {isCta && telefone ? (
            <div style={{ marginTop: 48, display: "flex", backgroundColor: cor, color: "#fff", fontSize: 38, fontWeight: 700, padding: "26px 40px", borderRadius: 16 }}>{telefone}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: isCapa ? "#fff" : "#7a7a7a" }}>
          <span>{site}</span>
          <span>{isCapa ? "arraste →" : ""}</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}
