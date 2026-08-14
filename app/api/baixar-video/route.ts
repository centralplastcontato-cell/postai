import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BAIXAR O VÍDEO passando pelo NOSSO servidor (mesma origem). Isso conserta o download no
// COMPUTADOR: o host do vídeo (motor de vídeo / Blob) nem sempre libera o navegador a baixar
// direto pra outro site (trava de CORS), e aí o "fetch" no navegador falha. Como o SERVIDOR
// busca sem essa trava, ele pega o MP4 e devolve já marcado como "baixar arquivo".
//
// De quebra, aplicamos "faststart": movemos o índice do MP4 (átomo 'moov') pro COMEÇO do
// arquivo. Sem isso, o WhatsApp não gera a miniatura (fica um quadrado preto) — porque ele lê
// só o início do arquivo pra montar a capinha. Se o vídeo já estiver ok (ou o arquivo for
// estranho), mandamos os bytes originais sem mexer — nunca corrompe.

// Move o box 'moov' pra frente do 'mdat' e corrige os offsets de chunk (stco/co64). Devolve o
// buffer novo, ou null se não se aplica / algo parece errado (aí o chamador usa o original).
function faststart(buf: Buffer): Buffer | null {
  try {
    // 1) lista os boxes de topo (ftyp, mdat, moov, free…)
    const boxes: { type: string; start: number; size: number; header: number }[] = [];
    let pos = 0;
    while (pos + 8 <= buf.length) {
      let size = buf.readUInt32BE(pos);
      const type = buf.toString("latin1", pos + 4, pos + 8);
      let header = 8;
      if (size === 1) {
        const hi = buf.readUInt32BE(pos + 8);
        const lo = buf.readUInt32BE(pos + 12);
        size = hi * 2 ** 32 + lo;
        header = 16;
      } else if (size === 0) {
        size = buf.length - pos; // vai até o fim
      }
      if (size < header || pos + size > buf.length) return null; // malformado → não mexe
      boxes.push({ type, start: pos, size, header });
      pos += size;
    }
    if (pos !== buf.length) return null; // sobrou lixo → não mexe

    const moov = boxes.find((b) => b.type === "moov");
    const mdat = boxes.find((b) => b.type === "mdat");
    if (!moov || !mdat) return null;
    if (moov.start < mdat.start) return null; // já está na frente (faststart) → nada a fazer

    // 2) copia o moov e soma o tamanho dele em todos os offsets de chunk (o mdat vai "descer").
    const moovBuf = Buffer.from(buf.subarray(moov.start, moov.start + moov.size));
    if (moovBuf.length !== moov.size) return null;
    if (!patchChunkOffsets(moovBuf, moov.size)) return null;

    // 3) remonta: [tudo antes do mdat] + moov + [do mdat até o moov] + [depois do moov]
    const novo = Buffer.concat([
      buf.subarray(0, mdat.start),
      moovBuf,
      buf.subarray(mdat.start, moov.start),
      buf.subarray(moov.start + moov.size),
    ]);
    if (novo.length !== buf.length) return null; // invariante de segurança: tamanho não muda
    return novo;
  } catch {
    return null;
  }
}

// Percorre o moov procurando tabelas de offset (stco = 32 bits, co64 = 64 bits) e soma `delta`
// em cada entrada. Devolve false se achar algo malformado.
function patchChunkOffsets(moov: Buffer, delta: number): boolean {
  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex", "udta"]);
  function walk(start: number, end: number): boolean {
    let p = start;
    while (p + 8 <= end) {
      let size = moov.readUInt32BE(p);
      const type = moov.toString("latin1", p + 4, p + 8);
      let header = 8;
      if (size === 1) {
        const hi = moov.readUInt32BE(p + 8);
        const lo = moov.readUInt32BE(p + 12);
        size = hi * 2 ** 32 + lo;
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) return false;
      const conteudo = p + header;
      if (type === "stco") {
        const n = moov.readUInt32BE(conteudo + 4); // pula version/flags (4 bytes) → contagem
        let o = conteudo + 8;
        for (let i = 0; i < n; i++) {
          if (o + 4 > p + size) return false;
          moov.writeUInt32BE((moov.readUInt32BE(o) + delta) >>> 0, o);
          o += 4;
        }
      } else if (type === "co64") {
        const n = moov.readUInt32BE(conteudo + 4);
        let o = conteudo + 8;
        for (let i = 0; i < n; i++) {
          if (o + 8 > p + size) return false;
          const v = moov.readUInt32BE(o) * 2 ** 32 + moov.readUInt32BE(o + 4) + delta;
          moov.writeUInt32BE(Math.floor(v / 2 ** 32), o);
          moov.writeUInt32BE(v >>> 0, o + 4);
          o += 8;
        }
      } else if (CONTAINERS.has(type)) {
        if (!walk(conteudo, p + size)) return false;
      }
      p += size;
    }
    return true;
  }
  return walk(0, moov.length);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  const nomeBruto = (searchParams.get("nome") || "video").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "video";
  const nomeArquivo = nomeBruto.toLowerCase().endsWith(".mp4") ? nomeBruto : `${nomeBruto}.mp4`;

  if (!/^https:\/\//i.test(url)) {
    return new Response("URL inválida.", { status: 400 });
  }

  // Segurança: só baixamos vídeos que REALMENTE existem no banco (impede usar isso pra buscar
  // qualquer endereço da internet — anti-SSRF). Confere festa, vídeo do buffet e clipe do mascote.
  const [festa, tema, clipe] = await Promise.all([
    prisma.festa.findFirst({ where: { videoUrl: url }, select: { id: true } }),
    prisma.videoTematico.findFirst({ where: { videoUrl: url }, select: { id: true } }),
    prisma.marca.findFirst({ where: { mascoteClipes: { contains: url } }, select: { id: true } }),
  ]);
  if (!festa && !tema && !clipe) {
    return new Response("Vídeo não encontrado.", { status: 404 });
  }

  const upstream = await fetch(url).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("Não consegui buscar o vídeo agora.", { status: 502 });
  }

  // Buffer o arquivo pra poder aplicar o faststart (miniatura no WhatsApp). Se não der pra
  // melhorar, seguimos com os bytes originais.
  const original = Buffer.from(await upstream.arrayBuffer());
  const ehMp4 = (upstream.headers.get("content-type") || "").includes("mp4") || url.toLowerCase().includes(".mp4");
  const corpo = (ehMp4 ? faststart(original) : null) || original;

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4");
  headers.set("Content-Length", String(corpo.length));
  headers.set("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(new Uint8Array(corpo), { status: 200, headers });
}
