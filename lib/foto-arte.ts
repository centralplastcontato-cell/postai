import sharp from "sharp";

// O renderizador das artes (next/og / Satori) é frágil com <img>: WEBP/AVIF/HEIC quebram,
// e mesmo PNG/JPEG PESADO, CORROMPIDO ou INACESSÍVEL pode estourar o render inteiro (500
// → arte não aparece). Estas funções garantem uma foto "Satori-safe":
//   - data URI PNG/JPEG passa direto (já está embutido).
//   - QUALQUER foto externa (http) é baixada e RE-ENCODADA pra um JPEG leve via sharp —
//     não confiamos na extensão. Foto válida vira JPEG pequeno; foto problemática vira
//     undefined (a arte cai no fundo colorido em vez de quebrar).
// Antes a gente passava .png/.jpg DIRETO (confiando na extensão) — e uma dessas, pesada
// ou quebrada, derrubava o render do Story (500). Reprocessar sempre fecha esse furo.
// Use SEMPRE que uma foto do banco/externa for entrar num ImageResponse.

function ehDataUriSuportado(url: string): boolean {
  return url.startsWith("data:image/png") || url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg");
}

// Guard de SSRF: a foto externa só é buscada se for http(s) público. Bloqueia loopback,
// IP privado, link-local e o endereço de metadados de nuvem (169.254.169.254) — pra um
// usuário não conseguir fazer o servidor buscar URLs internas via campo de imagem.
function urlExternaSegura(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // tira colchetes de IPv6
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return false; // "this host" / loopback / privado
    if (a === 169 && b === 254) return false; // link-local + metadados de nuvem
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
    if (a === 192 && b === 168) return false; // 192.168/16
  }
  return true;
}

export async function fotoSegura(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  if (ehDataUriSuportado(url)) return url; // já embutido e suportado — sem custo
  if (!urlExternaSegura(url)) return undefined; // SSRF: nunca busca host interno/privado
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    const jpg = await sharp(buf)
      .rotate() // respeita a orientação EXIF (foto de celular não fica deitada)
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return undefined; // não derruba a arte — sem foto, vira fundo colorido
  }
}

// Versão pra listas (ex: as 4 fotos do Mosaico). Mantém a ordem; foto que falhar na
// conversão é DESCARTADA (vira "" e some no filter) — nunca devolve URL crua que possa
// quebrar o render.
export async function fotosSeguras(urls?: (string | undefined | null)[] | null): Promise<string[]> {
  if (!urls?.length) return [];
  return Promise.all(urls.map(async (u) => (await fotoSegura(u)) ?? "")).then((a) => a.filter(Boolean));
}
