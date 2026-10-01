import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, logoUrlMarca } from "@/lib/arte";

// QUADRO FINAL do vídeo temático: a tela de FECHAMENTO da marca — o LOGO no CENTRO sobre um degradê
// das cores da marca, com a frase do convite embaixo. Entra como o ÚLTIMO quadro do slideshow (o
// motor toca por cima a voz do convite), pra o Reels terminar com a marca em destaque em vez de uma
// tela "preta". É desenhado aqui (mesma máquina de arte dos outros quadros) — o motor só junta.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE = "public, s-maxage=31536000, max-age=31536000, immutable";
const L = 1080; // largura do Reels
const A = 1920; // altura do Reels

const falhou = (msg: string) => new Response(msg, { status: 503, headers: { "cache-control": "no-store" } });

// Fecha a frase com pontuação se faltar (mesma regra dos outros quadros).
function pontuarFrase(t: string): string {
  const s = (t || "").trim();
  if (!s) return s;
  if (/[.!?…:)]$/.test(s)) return s;
  return /[\p{L}\p{N}]$/u.test(s) ? `${s}!` : s;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;

  try {
    const v = await prisma.videoTematico.findUnique({
      where: { id },
      include: { marca: { select: { corPrimaria: true, corFundo: true, logoUrl: true, id: true } } },
    });
    if (!v) return falhou("Vídeo não encontrado.");

    const cor = v.marca.corPrimaria || "#7C3AED";
    const fundo = v.marca.corFundo || "#0E0E0E";
    const temLogo = Boolean(v.marca.logoUrl);
    const texto = pontuarFrase((v.videoTextoFinal || "").trim() || "Vem viver a festa dos sonhos com a gente");

    // ESTILO COLAGEM: tela de fechamento no mesmo papel kraft dos outros quadros, com a OFERTA
    // (o que o dono escreveu/a Bia escreveu — ver gerarCtaNarracao) e um "adesivo" de WhatsApp.
    // É só visual (vídeo não é clicável) — a chamada de verdade é a VOZ convidando a chamar no zap.
    if (v.videoFundo === "colagem") {
      const colagemFinalEl = (
        <div style={{ width: `${L}px`, height: `${A}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", fontFamily: "Baloo", padding: "0 80px", backgroundImage: "linear-gradient(135deg, #F2E4C4 0%, #E7D6A8 55%, #D9C78E 100%)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, display: "flex", backgroundImage: "radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.16) 100%)" }} />
          {temLogo ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderRadius: 14, padding: "18px 34px", boxShadow: "0 10px 26px rgba(0,0,0,0.3)", transform: "rotate(-2deg)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.marca.logoUrl} width={320} height={120} style={{ width: "320px", height: "120px", objectFit: "contain" }} />
            </div>
          ) : null}
          <div style={{ display: "flex", marginTop: 48, maxWidth: `${L - 160}px`, fontSize: 56, fontWeight: 700, color: "#2a2016", textAlign: "center", lineHeight: 1.2 }}>
            {texto}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 56, backgroundColor: "#25D366", color: "#ffffff", fontSize: 44, fontWeight: 700, padding: "22px 44px", borderRadius: 999, boxShadow: "0 14px 30px rgba(0,0,0,0.3)", transform: "rotate(3deg)" }}>
            📱 Chama no WhatsApp!
          </div>
          {v.videoTextoFinal.trim() ? (
            <div style={{ display: "flex", position: "absolute", bottom: 64, fontSize: 24, color: "#6b5c3f" }}>Consulte condições</div>
          ) : null}
        </div>
      );
      const png = await new ImageResponse(colagemFinalEl, { width: L, height: A, fonts: carregarFontes() }).arrayBuffer();
      const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
      return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
    }

    const el = (
      <div
        style={{
          width: `${L}px`,
          height: `${A}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Baloo",
          padding: "0 90px",
          backgroundImage: `linear-gradient(160deg, ${cor} 0%, ${fundo} 100%)`,
        }}
      >
        {temLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrlMarca(origin, v.marca.id)}
            width={640}
            height={320}
            style={{ width: "640px", height: "320px", objectFit: "contain", filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.45))" }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            marginTop: temLogo ? 56 : 0,
            maxWidth: `${L - 200}px`,
            fontSize: 62,
            fontWeight: 600,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.16,
            textShadow: "0 3px 16px rgba(0,0,0,0.5)",
          }}
        >
          {texto}
        </div>
      </div>
    );

    const png = await new ImageResponse(el, { width: L, height: A, fonts: carregarFontes() }).arrayBuffer();
    const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
  } catch (e) {
    console.error("Erro ao desenhar o quadro final:", e);
    return falhou("Não consegui desenhar o quadro final.");
  }
}
