import { ImageResponse } from "next/og";
import { carregarFontes } from "@/lib/arte";

// Imagem de preview (Open Graph) que o WhatsApp/redes mostram ao compartilhar o link.
// Gerada na hora com a cara do Postaí — o Next a expõe automaticamente como og:image.
export const runtime = "nodejs";
export const alt = "Postaí — seu Instagram no piloto automático";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const fonts = carregarFontes();
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage: "radial-gradient(circle at 50% 32%, rgba(124,58,237,0.45), rgba(0,0,0,0) 58%)",
          fontFamily: "Fredoka",
          padding: "0 90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ display: "flex", fontSize: 150, color: "#ffffff", letterSpacing: 1 }}>Postaí</span>
          <span style={{ display: "flex", fontSize: 150, color: "#8b4ef5" }}>.</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 50, color: "rgba(255,255,255,0.95)", textAlign: "center", maxWidth: 1000, lineHeight: 1.18 }}>
          Seu Instagram no piloto automático 🚀
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 32, color: "rgba(255,255,255,0.62)", textAlign: "center", maxWidth: 920, lineHeight: 1.3 }}>
          Carrosséis, posts e stories criados por IA e postados sozinhos.
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
