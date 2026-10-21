import fs from "fs";
import path from "path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { logoEmbutido } from "@/lib/foto-arte";
import { lerRoteiroCinema } from "@/lib/cinema";

// CAPA do VÍDEO CINEMA (miniatura do card e capa do Reels no perfil): a foto da cena em tela cheia,
// o logo no topo e um título GRANDE no estilo do vídeo — Montserrat pesada branca, com a palavra
// de destaque em itálico serifado amarelo e sublinhada. O título vem do roteiro ("*palavra*").
// Rota PÚBLICA (a Meta baixa a capa sem login): por isso a trava de LGPD também mora aqui —
// foto de festa sem autorização nunca é servida.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE = "public, s-maxage=31536000, max-age=31536000, immutable";
const L = 1080;
const A = 1920;
const AMARELO = "#FFC83D";
const falhou = (msg: string) => new Response(msg, { status: 503, headers: { "cache-control": "no-store" } });

let _fontes: { name: string; data: Buffer; weight: 400 | 800 | 900; style: "normal" | "italic" }[] | null = null;
function fontes() {
  if (_fontes) return _fontes;
  const dir = path.join(process.cwd(), "assets", "fonts");
  _fontes = [
    { name: "Montserrat", data: fs.readFileSync(path.join(dir, "montserrat-900.woff")), weight: 900, style: "normal" },
    { name: "Montserrat", data: fs.readFileSync(path.join(dir, "montserrat-800.woff")), weight: 800, style: "normal" },
    { name: "Instrument", data: fs.readFileSync(path.join(dir, "instrument-serif-italic.woff")), weight: 400, style: "italic" },
  ];
  return _fontes;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; arq: string }> }) {
  const { id } = await ctx.params;
  const v = await prisma.videoTematico.findUnique({ where: { id }, select: { modo: true, marcaId: true, titulo: true, colagemRoteiro: true, marca: { select: { logoUrl: true } } } });
  if (!v || v.modo !== "cinema") return new Response("Não encontrado.", { status: 404 });
  const r = lerRoteiroCinema(v.colagemRoteiro);
  const titulo = (r?.capa?.titulo || v.titulo || "").trim();
  const fotoId = r?.capa?.foto || r?.cenas.find((c) => c.foto)?.foto || "";
  const foto = fotoId
    ? await prisma.imagemMarca.findFirst({ where: { id: fotoId, marcaId: v.marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] }, select: { url: true } })
    : null;
  if (!foto?.url) return falhou("Sem foto liberada pra capa.");

  let fundo: string;
  try {
    const resp = await fetch(foto.url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return falhou("Foto não carregou.");
    const buf = await sharp(Buffer.from(await resp.arrayBuffer())).rotate().resize({ width: L, height: A, fit: "cover", position: "attention" })
      .modulate({ saturation: 1.12 }).linear(1.08, -6).jpeg({ quality: 86 }).toBuffer();
    fundo = `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return falhou("Foto não carregou.");
  }
  const logo = await logoEmbutido(v.marca.logoUrl);
  // tamanho do logo (o next/og precisa de largura/altura explícitas): cabe em 300×140
  let logoL = 0, logoA = 0;
  if (logo) {
    const m = await sharp(Buffer.from(logo.split(",")[1], "base64")).metadata().catch(() => null);
    if (m?.width && m.height) { const k = Math.min(300 / m.width, 140 / m.height); logoL = Math.round(m.width * k); logoA = Math.round(m.height * k); }
  }

  const palavras = titulo.split(/\s+/).filter(Boolean).map((w) => ({ t: w.replace(/\*/g, ""), d: /\*/.test(w) }));
  const letras = palavras.reduce((s, p) => s + p.t.length + 1, 0);
  const tam = letras <= 16 ? 150 : letras <= 26 ? 128 : letras <= 34 ? 110 : 96;

  const img = new ImageResponse(
    (
      <div style={{ width: L, height: A, display: "flex", position: "relative", background: "#05070f" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fundo} width={L} height={A} style={{ position: "absolute", left: 0, top: 0, width: L, height: A, objectFit: "cover" }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: L, height: A, display: "flex", background: "linear-gradient(180deg, rgba(5,8,20,0.55) 0%, rgba(5,8,20,0) 22%, rgba(5,8,20,0) 42%, rgba(5,8,20,0.78) 66%, rgba(5,8,20,0.95) 100%)" }} />
        {logo && logoL > 0 && (
          <div style={{ position: "absolute", top: 90, left: 0, width: L, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", background: "white", borderRadius: 40, padding: "18px 34px", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} width={logoL} height={logoA} style={{ width: logoL, height: logoA }} />
            </div>
          </div>
        )}
        <div style={{ position: "absolute", left: 60, right: 60, bottom: 250, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end" }}>
          {palavras.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: `0 ${Math.round(tam * 0.13)}px` }}>
              <span style={{
                fontFamily: p.d ? "Instrument" : "Montserrat", fontStyle: p.d ? "italic" : "normal", fontWeight: p.d ? 400 : 900,
                fontSize: p.d ? Math.round(tam * 1.25) : tam, lineHeight: 1.02, color: p.d ? AMARELO : "white", letterSpacing: p.d ? 0 : -3,
                textShadow: "0 6px 30px rgba(0,0,0,0.6)",
              }}>{p.t}</span>
              {p.d && <div style={{ width: "100%", height: Math.max(8, Math.round(tam * 0.07)), marginTop: -Math.round(tam * 0.06), borderRadius: 999, background: AMARELO, display: "flex" }} />}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, width: L, bottom: 150, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Montserrat", fontWeight: 800, fontSize: 34, color: "white", background: "rgba(255,255,255,0.14)", border: "2px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "14px 34px" }}>
            <svg width="24" height="28" viewBox="0 0 24 28"><polygon points="0,0 24,14 0,28" fill={AMARELO} /></svg>
            Assista até o final
          </div>
        </div>
      </div>
    ),
    { width: L, height: A, fonts: fontes() },
  );
  const png = Buffer.from(await img.arrayBuffer());
  const jpg = await sharp(png).jpeg({ quality: 86 }).toBuffer();
  return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
}
