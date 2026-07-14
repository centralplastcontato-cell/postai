import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes } from "@/lib/arte";
import { fotoSeguraComTamanho, logoEmbutido } from "@/lib/foto-arte";

// QUADRO do vídeo temático: a foto EMOLDURADA sobre o fundo da marca, com a LEGENDA embaixo
// (a copy que a Bia escreve). É esta arte 9:16 que o MOTOR DE VÍDEO baixa pra montar o Reels —
// o motor mora fora deste repo e o contrato dele não tem texto por foto, então a frase precisa
// já vir "queimada" na imagem. Desenhando aqui (mesma máquina de arte do carrossel), tipografia,
// cor e moldura ficam sob nosso controle e nada muda no motor.
//
// Decisões que vieram da revisão (importam):
//  - LGPD: a rota é PÚBLICA (o motor baixa sem login), então a trava de divulgação está AQUI
//    também — foto de festa sem autorização nunca é servida, nem por URL adivinhada.
//  - FALHA ALTA: foto/vídeo que não carrega devolve 503 sem cache. Um quadro "em branco" com
//    200 viraria um slide vazio no meio do Reels e ninguém perceberia até estar no Instagram.
//  - JPEG (não PNG): o next/og só emite PNG (~2-3 MB); convertemos com sharp (~300 KB). O motor
//    baixa 26 quadros — 78 MB viraria gargalo de download. A URL termina em .jpg pra ele não
//    depender só do content-type.
//  - LOGO EMBUTIDO: nada de <img src="/api/marca-logo"> (cada quadro chamaria outra função:
//    26 quadros = 52 funções, e o logo falhando derrubava o desenho inteiro).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// s-maxage é o que a CDN da Vercel respeita (max-age sozinho só vale pro navegador). O ?v= da
// URL muda quando o conteúdo muda, então o quadro pode ser guardado "pra sempre".
const CACHE = "public, s-maxage=31536000, max-age=31536000, immutable";

const L = 1080; // largura do Reels
const A = 1920; // altura do Reels
const AREA_FOTO_H = 1180; // altura máxima da área da foto
const AREA_FOTO_L = 940; // largura máxima da área da foto
const BORDA = 16; // espessura da moldura branca

const falhou = (msg: string) => new Response(msg, { status: 503, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  const idx = Math.max(1, parseInt(n, 10) || 1) - 1; // aceita "3" e "3.jpg"

  try {
    const v = await prisma.videoTematico.findUnique({
      where: { id },
      include: { marca: { select: { corPrimaria: true, corFundo: true, logoUrl: true, site: true, nome: true } } },
    });
    if (!v) return falhou("Vídeo não encontrado.");

    let ids: string[] = [];
    try {
      const a = JSON.parse(v.videoFotos || "[]");
      ids = Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : [];
    } catch {}
    const fotoId = ids[idx];
    if (!fotoId) return falhou("Quadro fora da sequência.");

    // LGPD — foto só entra se for da MESMA marca e estiver liberada (solta OU de festa
    // autorizada). Uma festa que revogou a autorização depois da seleção não vaza aqui.
    const img = await prisma.imagemMarca.findFirst({
      where: { id: fotoId, marcaId: v.marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] },
      select: { url: true },
    });
    if (!img) return falhou("Foto indisponível.");

    let legenda = "";
    try {
      const mapa = JSON.parse(v.videoTextos || "{}") as Record<string, string>;
      legenda = (mapa?.[fotoId] || "").trim();
    } catch {}

    const [foto, logo] = await Promise.all([fotoSeguraComTamanho(img.url), logoEmbutido(v.marca.logoUrl)]);
    if (!foto) return falhou("Não consegui preparar a foto.");

    const cor = v.marca.corPrimaria || "#7C3AED";
    const fundo = v.marca.corFundo || "#0E0E0E";
    const site = v.marca.site || "";

    // Moldura justa: escala a foto pra caber na área, mantendo a proporção dela.
    const escala = Math.min(AREA_FOTO_L / foto.largura, AREA_FOTO_H / foto.altura);
    const fw = Math.round(foto.largura * escala);
    const fh = Math.round(foto.altura * escala);
    // Frase longa = fonte menor (cabe sem estourar o quadro).
    const tam = legenda.length > 90 ? 46 : legenda.length > 55 ? 52 : 60;

    const png = await new ImageResponse(
      (
        <div
          style={{
            width: `${L}px`,
            height: `${A}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "70px 60px 80px",
            backgroundImage: `linear-gradient(160deg, ${cor} 0%, ${fundo} 100%)`,
            fontFamily: "Baloo",
          }}
        >
          {/* logo numa pastilha branca (letra colorida de logo some no fundo da marca) */}
          <div style={{ display: "flex", height: 116, alignItems: "center" }}>
            {logo ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 30px", backgroundColor: "#ffffff", borderRadius: 999, boxShadow: "0 8px 26px rgba(0,0,0,0.28)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} width={Math.round(88 * 1.76)} height={88} style={{ objectFit: "contain" }} />
              </div>
            ) : (
              <span style={{ display: "flex", fontSize: 40, fontWeight: 600, color: "#fff", letterSpacing: 2 }}>{(v.marca.nome || "").toUpperCase()}</span>
            )}
          </div>

          {/* a FOTO, com a moldura branca justa nela */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: `${AREA_FOTO_H}px` }}>
            <div style={{ display: "flex", padding: `${BORDA}px`, backgroundColor: "#ffffff", borderRadius: 8, boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.src} width={fw} height={fh} style={{ width: `${fw}px`, height: `${fh}px`, objectFit: "cover", borderRadius: 2 }} />
            </div>
          </div>

          {/* a LEGENDA (quando a foto tem uma) — sem ela, a foto passa limpa */}
          <div style={{ display: "flex", flexDirection: "column", width: "100%", minHeight: 210 }}>
            {legenda ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", width: 96, height: 9, backgroundColor: "#ffffff", borderRadius: 5, marginBottom: 24, opacity: 0.9 }} />
                <div style={{ display: "flex", fontSize: tam, fontWeight: 600, color: "#ffffff", lineHeight: 1.18, textShadow: "0 3px 14px rgba(0,0,0,0.45)" }}>{legenda}</div>
              </div>
            ) : (
              <div style={{ display: "flex" }} />
            )}
            {site ? <div style={{ display: "flex", marginTop: 26, fontSize: 26, color: "rgba(255,255,255,0.72)" }}>{site}</div> : null}
          </div>
        </div>
      ),
      { width: L, height: A, fonts: carregarFontes() },
    ).arrayBuffer();

    // PNG (2-3 MB) → JPEG (~300 KB): o motor baixa 26 quadros; o download é o gargalo, não o CPU.
    const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
  } catch (e) {
    console.error("Erro ao desenhar o quadro do vídeo:", e);
    return falhou("Não consegui desenhar o quadro.");
  }
}
