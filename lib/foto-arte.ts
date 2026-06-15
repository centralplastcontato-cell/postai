import sharp from "sharp";

// O renderizador das artes (next/og / Satori) só desenha PNG e JPEG como <img>.
// WEBP, AVIF e HEIC (formatos comuns de fotos baixadas/printadas) QUEBRAM o render
// inteiro (erro 500 → arte não aparece). Estas funções garantem uma foto "Satori-safe":
//   - PNG/JPEG (e data URIs) passam direto, sem custo.
//   - Formatos não suportados são baixados e convertidos pra JPEG (data URI embutido).
//   - Se a foto não puder ser carregada, devolve undefined — a arte cai no fundo
//     colorido em vez de quebrar.
// Use SEMPRE que uma foto do banco/externa for entrar num ImageResponse.

function jaSuportada(url: string): boolean {
  if (url.startsWith("data:image/png") || url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return true;
  const semQuery = url.split("?")[0].toLowerCase();
  return semQuery.endsWith(".png") || semQuery.endsWith(".jpg") || semQuery.endsWith(".jpeg");
}

export async function fotoSegura(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  if (jaSuportada(url)) return url; // já é PNG/JPEG — sem fetch, sem custo
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    const jpg = await sharp(buf)
      .rotate() // respeita a orientação EXIF (foto de celular não fica deitada)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return undefined; // não derruba a arte — sem foto, vira fundo colorido
  }
}

// Versão pra listas (ex: as 4 fotos do Mosaico). Mantém a ordem e a contagem:
// se uma falhar na conversão, devolve a URL original (no pior caso quebra só ela).
export async function fotosSeguras(urls?: (string | undefined | null)[] | null): Promise<string[]> {
  if (!urls?.length) return [];
  return Promise.all(urls.map(async (u) => (await fotoSegura(u)) ?? u ?? "")).then((a) => a.filter(Boolean));
}
