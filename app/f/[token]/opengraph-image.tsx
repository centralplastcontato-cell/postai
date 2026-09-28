import { ImageResponse } from "next/og";
import { festaPorToken, marcaPorTokenFotos } from "@/lib/festa";
import { parseAniversariantes, rotuloAniversariantes } from "@/lib/aniversariantes";
import { carregarFontes } from "@/lib/arte";

// Imagem de preview (Open Graph) do LINK DA FESTA/de criar — o que o WhatsApp mostra ao
// compartilhar. Personalizada com o nome do aniversariante (ou da marca), em vez do card
// genérico "Postaí" (app/opengraph-image.tsx). Mesmo token da página, mesmo runtime.
export const runtime = "nodejs";
export const alt = "Postaí";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function hexParaRgba(hex: string, a: number): string {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fonts = carregarFontes();
  const base = { width: "1200px", height: "630px", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0a", fontFamily: "Fredoka", padding: "0 90px" };

  const festa = await festaPorToken(token);
  if (festa) {
    const nomes = rotuloAniversariantes(parseAniversariantes(festa.aniversariantes)) || "Festa";
    const cor = festa.marca.corPrimaria || "#7C3AED";
    return new ImageResponse(
      (
        <div style={{ ...base, backgroundImage: `radial-gradient(circle at 50% 30%, ${hexParaRgba(cor, 0.45)}, rgba(0,0,0,0) 58%)`, position: "relative" }}>
          {festa.marca.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={festa.marca.logoUrl} width={110} height={110} style={{ position: "absolute", top: 56, objectFit: "contain", borderRadius: 20 }} />
          )}
          <div style={{ display: "flex", fontSize: 60 }}>📸</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 76, fontFamily: "Baloo", color: "#ffffff", textAlign: "center", maxWidth: 1000, lineHeight: 1.15 }}>
            {nomes}
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 36, color: "rgba(255,255,255,0.78)", textAlign: "center", maxWidth: 900, lineHeight: 1.3 }}>
            Suba as fotos da festa aqui 💜
          </div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 26, color: "rgba(255,255,255,0.45)" }}>{festa.marca.nome}</div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const marca = await marcaPorTokenFotos(token);
  const cor = marca?.corPrimaria || "#7C3AED";
  return new ImageResponse(
    (
      <div style={{ ...base, backgroundImage: `radial-gradient(circle at 50% 30%, ${hexParaRgba(cor, 0.45)}, rgba(0,0,0,0) 58%)` }}>
        {marca?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marca.logoUrl} width={120} height={120} style={{ objectFit: "contain", borderRadius: 22, marginBottom: 24 }} />
        )}
        <div style={{ display: "flex", fontSize: 66, fontFamily: "Baloo", color: "#ffffff", textAlign: "center", maxWidth: 1000, lineHeight: 1.2 }}>
          🏰 {marca?.nome || "Postaí"}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 34, color: "rgba(255,255,255,0.78)" }}>
          {marca ? "Cadastre a festa e suba as fotos" : "Link inválido ou desativado"}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
