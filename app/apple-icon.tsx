import { ImageResponse } from "next/og";
import { carregarFontes } from "@/lib/arte";

// Ícone grande pra iPhone/iPad (quando o cliente salva o site na tela de início).
// Mesmo desenho do favicon (app/icon.tsx), em 180×180 — o Next expõe como /apple-icon.
export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const fonts = carregarFontes();
  return new ImageResponse(
    (
      <div
        style={{
          width: "180px",
          height: "180px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
          fontFamily: "Fredoka",
        }}
      >
        <span style={{ display: "flex", fontSize: 128, color: "#ffffff", marginTop: -10 }}>P</span>
      </div>
    ),
    { ...size, fonts },
  );
}
