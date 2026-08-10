import sharp from "sharp";

// LOGO INVISÍVEL (PNG transparente) pro MOTOR DE VÍDEO. O motor EXIGE um logo pra montar
// (sem ele recusa com "Sem logo"). Quando o dono escolhe posicionar o logo POR CONTA (nos
// nossos quadros, via /api/quadro-tema), mandamos ESTE logo transparente pro motor — assim
// ele não reclama e não carimba nada visível, e o logo de verdade aparece onde o dono quis.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const png = await sharp({ create: { width: 240, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
  });
}
