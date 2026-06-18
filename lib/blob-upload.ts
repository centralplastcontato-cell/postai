import { put } from "@vercel/blob";
import sharp from "sharp";

// Normaliza uma foto pra JPEG e sobe no Vercel Blob. O renderizador das artes (next/og) só
// aceita PNG/JPEG — webp/avif/heic quebrariam o render; e o resize evita guardar arquivos
// gigantes (fica leve pra postar na Meta). Se o sharp falhar, sobe o original como veio.
// Helper compartilhado entre o upload do painel (/api/marketing/upload) e o link público do
// Álbum da Festa (/api/f/[token]/upload).
export async function subirFotoNormalizada(file: File): Promise<string> {
  const bruto = Buffer.from(await file.arrayBuffer());
  let saida: Buffer = bruto;
  let contentType = file.type || "image/png";
  let ext = (file.name.split(".").pop() || "png").toLowerCase();
  try {
    saida = await sharp(bruto)
      .rotate() // respeita a orientação EXIF
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  } catch (e) {
    console.error("Não consegui normalizar a imagem (subindo original):", e);
  }
  const nomeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9.-]/g, "_") || "foto";
  const blob = await put(`upload/${Date.now()}-${nomeBase}.${ext}`, saida, {
    access: "public",
    contentType,
  });
  return blob.url;
}
