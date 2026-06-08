import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRANCO = "#ffffff";
const CINZA = "#C9C9C9";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let template = "dica";
  let titulo = "Postaí";
  let texto = "";
  let imagemUrl: string | null = null;
  let cor = "#7C3AED";
  let fundo = "#0E0E0E";
  let marcaTexto = "POSTAÍ";
  let logoUrl = "";
  let site = "";
  let telefone = "";
  let paleta: string[] = [];
  try {
    const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
    if (p) {
      template = p.template;
      titulo = p.titulo;
      texto = p.texto ?? "";
      imagemUrl = p.imagemUrl;
      cor = p.marca.corPrimaria || cor;
      fundo = p.marca.corFundo || fundo;
      marcaTexto = (p.marca.logoTexto || p.marca.nome).toUpperCase();
      logoUrl = p.marca.logoUrl || "";
      site = p.marca.site || "";
      telefone = p.marca.telefone || "";
      try {
        const arr = JSON.parse(p.marca.paleta || "[]");
        if (Array.isArray(arr)) paleta = arr.filter((c) => typeof c === "string");
      } catch {}
    }
  } catch {}

  // Régua: faixa multicolor com as cores do logo (ou um traço só na cor principal).
  const cores = paleta.length ? paleta : [cor];
  const Regua = ({ mb }: { mb: number }) => (
    <div style={{ display: "flex", marginBottom: mb }}>
      {cores.map((c, i) => (
        <div key={i} style={{ width: 36, height: 8, backgroundColor: c, display: "flex" }} />
      ))}
    </div>
  );

  const Marca = ({ claro }: { claro: boolean }) =>
    logoUrl ? (
      <div style={{ display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} height={72} style={{ height: "72px", width: "auto", objectFit: "contain" }} />
      </div>
    ) : (
      <div style={{ display: "flex" }}>
        <span style={{ backgroundColor: claro ? BRANCO : cor, color: claro ? cor : BRANCO, fontSize: 30, fontWeight: 700, letterSpacing: 2, padding: "10px 22px" }}>{marcaTexto}</span>
      </div>
    );
  const Rodape = ({ claro }: { claro: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: claro ? "rgba(255,255,255,0.85)" : "#7a7a7a" }}>
      <span>{site}</span>
      <span>{telefone}</span>
    </div>
  );

  const wrap = { width: "1080px", height: "1350px", display: "flex" as const, flexDirection: "column" as const, justifyContent: "space-between" as const, padding: "90px", fontFamily: "sans-serif" };

  // Com foto de fundo (qualquer template).
  if (imagemUrl) {
    const isProduto = template === "produto";
    return new ImageResponse(
      (
        <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "90px", backgroundImage: "linear-gradient(rgba(0,0,0,0.10), rgba(0,0,0,0.80))" }}>
            <Marca claro={false} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Regua mb={30} />
              <div style={{ display: "flex", fontSize: 78, fontWeight: 800, color: BRANCO, lineHeight: 1.05 }}>{titulo}</div>
              {texto ? <div style={{ display: "flex", marginTop: 26, fontSize: 40, color: "#eaeaea", lineHeight: 1.3 }}>{texto}</div> : null}
              {isProduto && telefone ? <div style={{ marginTop: 40, display: "flex", backgroundColor: cor, color: BRANCO, fontSize: 34, fontWeight: 700, padding: "20px 34px", borderRadius: 14 }}>{telefone}</div> : null}
            </div>
            <Rodape claro={true} />
          </div>
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  }

  if (template === "produto") {
    return new ImageResponse(
      (
        <div style={{ ...wrap, backgroundColor: fundo }}>
          <Marca claro={false} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Regua mb={30} />
            <div style={{ display: "flex", fontSize: 80, fontWeight: 800, color: BRANCO, lineHeight: 1.05 }}>{titulo}</div>
            {texto ? <div style={{ display: "flex", marginTop: 26, fontSize: 42, color: CINZA, lineHeight: 1.3 }}>{texto}</div> : null}
            {telefone ? <div style={{ marginTop: 44, display: "flex", backgroundColor: cor, color: BRANCO, fontSize: 36, fontWeight: 700, padding: "22px 38px", borderRadius: 14 }}>{telefone}</div> : null}
          </div>
          <Rodape claro={false} />
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  }

  if (template === "vinte_anos") {
    return new ImageResponse(
      (
        <div style={{ ...wrap, backgroundColor: cor }}>
          <Marca claro={true} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 800, color: BRANCO, lineHeight: 1.1 }}>{titulo}</div>
            {texto ? <div style={{ display: "flex", marginTop: 22, fontSize: 38, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{texto}</div> : null}
          </div>
          <Rodape claro={true} />
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  }

  if (template === "frase") {
    return new ImageResponse(
      (
        <div style={{ ...wrap, backgroundColor: fundo }}>
          <Marca claro={false} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 200, fontWeight: 800, color: cor, lineHeight: 0.6, height: 120 }}>“</div>
            <div style={{ display: "flex", fontSize: 78, fontWeight: 800, color: BRANCO, lineHeight: 1.15 }}>{titulo}</div>
            {texto ? <div style={{ display: "flex", marginTop: 30, fontSize: 38, color: CINZA, lineHeight: 1.3 }}>{texto}</div> : null}
          </div>
          <Rodape claro={false} />
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  }

  // dica (padrão)
  return new ImageResponse(
    (
      <div style={{ ...wrap, backgroundColor: fundo }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Marca claro={false} />
          <span style={{ display: "flex", backgroundColor: cor, color: BRANCO, fontSize: 30, fontWeight: 800, letterSpacing: 2, padding: "10px 22px", borderRadius: 10 }}>💡 DICA</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Regua mb={36} />
          <div style={{ display: "flex", fontSize: 80, fontWeight: 800, color: BRANCO, lineHeight: 1.07 }}>{titulo}</div>
          {texto ? <div style={{ display: "flex", marginTop: 30, fontSize: 42, color: CINZA, lineHeight: 1.3 }}>{texto}</div> : null}
        </div>
        <Rodape claro={false} />
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}
