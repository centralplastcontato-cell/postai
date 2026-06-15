import { put } from "@vercel/blob";
import sharp from "sharp";
import { estaLogado } from "@/lib/auth";

export const runtime = "nodejs";

// Remove o fundo (chroma key pela cor dos cantos), reduz o tamanho e devolve um
// PNG com transparência. Usado no logo da marca: assim ele renderiza limpo na
// arte (sem o quadradão de fundo) e fica embutido como base64 — não depende da
// URL do Blob (que pode cair no "Security Checkpoint" da Vercel e dar 403 no servidor).
async function logoTransparente(buf: Buffer): Promise<Buffer> {
  const pre = sharp(buf)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .ensureAlpha();
  const { data, info } = await pre.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels = 4 (RGBA)

  // Cor de fundo = média dos 4 cantos.
  const cantos = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let br = 0, bg = 0, bb = 0;
  for (const [x, y] of cantos) {
    const i = (y * width + x) * channels;
    br += data[i]; bg += data[i + 1]; bb += data[i + 2];
  }
  br /= 4; bg /= 4; bb /= 4;

  const TH = 70;       // até aqui de distância da cor de fundo = 100% transparente
  const FEATHER = 45;  // zona de transição (suaviza a borda)
  for (let p = 0; p < data.length; p += channels) {
    const dr = data[p] - br, dg = data[p + 1] - bg, db = data[p + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < TH) data[p + 3] = 0;
    else if (dist < TH + FEATHER) data[p + 3] = Math.round(((dist - TH) / FEATHER) * 255);
    // mais longe que TH+FEATHER: mantém o alpha original (faz parte do logo)
  }

  return sharp(data, { raw: { width, height, channels } })
    .trim() // corta as bordas transparentes sobrando
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function POST(req: Request) {
  if (!(await estaLogado())) {
    return Response.json({ ok: false, erro: "Sem permissão." }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, erro: "Arquivo ausente." });
    }

    // Logo: remove fundo + embute como base64 (não depende da URL do Blob).
    const tipo = new URL(req.url).searchParams.get("tipo");
    if (tipo === "logo") {
      try {
        const bruto = Buffer.from(await file.arrayBuffer());
        const png = await logoTransparente(bruto);
        const url = `data:image/png;base64,${png.toString("base64")}`;
        return Response.json({ ok: true, url });
      } catch (e) {
        console.error("Erro ao processar o logo:", e);
        return Response.json({ ok: false, erro: "Não consegui processar o logo." });
      }
    }

    // Demais imagens (fotos do banco/posts): NORMALIZA pra JPEG. O renderizador das
    // artes (next/og) só aceita PNG/JPEG — webp/avif/heic quebrariam o render. Também
    // redimensiona pra não guardar arquivos gigantes (e fica leve pra postar na Meta).
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
    return Response.json({ ok: true, url: blob.url });
  } catch (e) {
    console.error("Erro no upload:", e);
    return Response.json({ ok: false, erro: "Falha no upload (confira o Vercel Blob)." });
  }
}
