import { ImageResponse } from "next/og";
import { carregarFontes } from "@/lib/arte";

// Favicon do site (ícone da aba do navegador), gerado na hora com a cara do Postaí:
// quadradinho arredondado com o degradê roxo→rosa da marca e o "P" branco (Fredoka).
// O Next expõe automaticamente como /icon e injeta a tag <link rel="icon"> em todas
// as páginas — nada a configurar no layout.
export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const fonts = carregarFontes();
  return new ImageResponse(
    (
      <div
        style={{
          width: "64px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
          borderRadius: 14,
          fontFamily: "Fredoka",
        }}
      >
        <span style={{ display: "flex", fontSize: 46, color: "#ffffff", marginTop: -4 }}>P</span>
      </div>
    ),
    { ...size, fonts },
  );
}
