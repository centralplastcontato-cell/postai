import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes } from "@/lib/arte";
import { fotoParaCapa } from "@/lib/foto-arte";
import { parseAniversariantes, tituloCapaFesta } from "@/lib/aniversariantes";

// CAPA do vídeo da FESTA (9:16): a foto de abertura com o título "Fulano fez X aninhos" por cima.
// Antes o MOTOR DE VÍDEO (Cloud Run, fora deste repo) escrevia esse título — numa fonte fixa,
// numa LINHA SÓ. Com nome comprido ou dois aniversariantes ("Luisa e Maria Sofia fez 11 aninhos")
// a frase estourava a tela e as pontas eram cortadas. Desenhando aqui, o título QUEBRA LINHA e a
// fonte encolhe conforme o tamanho — e o motor recebe a capa pronta com textoCapa="" (não escreve
// nada por cima). Mesmo caminho já usado no vídeo temático (/api/quadro-tema).
//
// Decisões que importam:
//  - Foto de GRUPO não pode ser cortada (a festa de gêmeos/irmãos tem todo mundo na foto): a foto
//    entra INTEIRA (fit), e o fundo é ela mesma BORRADA (no lugar do preto chapado) — nada de
//    tarja e ninguém sai do quadro.
//  - O MOTOR carimba o LOGO da marca no TOPO da capa: a faixa de cima fica livre (nada nosso lá).
//  - FALHA: se a foto não carregar, NÃO devolve 503 (isso deixaria o vídeo sem capa). Cai num
//    fundo com a cor da marca + o título — capa simples é melhor que capa quebrada.
//  - LGPD: diferente do /quadro-tema (que mistura fotos de VÁRIAS festas numa compilação
//    pública), aqui só sai a capa da PRÓPRIA festa — a mesma foto que já era servida crua pela
//    URL do Blob (pública, id não-adivinhável). Por isso não há trava extra de autorização.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// s-maxage é o que a CDN da Vercel respeita. O ?v= muda quando o conteúdo muda (ver festas.ts),
// então a capa pode ser guardada "pra sempre".
const CACHE = "public, s-maxage=31536000, max-age=31536000, immutable";

const L = 1080; // largura do Reels
const A = 1920; // altura do Reels

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const festaId = id.replace(/\.jpg$/i, ""); // aceita "<id>" e "<id>.jpg" (o motor prefere extensão)

  try {
    const festa = await prisma.festa.findUnique({
      where: { id: festaId },
      select: {
        aniversariante: true,
        aniversariantes: true,
        videoCapa: true,
        marca: { select: { corPrimaria: true, corFundo: true } },
        fotos: { select: { id: true, url: true } },
      },
    });
    if (!festa) return new Response("Festa não encontrada.", { status: 404, headers: { "cache-control": "no-store" } });

    const cor = festa.marca.corPrimaria || "#7C3AED";
    const fundo = festa.marca.corFundo || "#0E0E0E";

    const anivs = parseAniversariantes(festa.aniversariantes);
    const titulo = tituloCapaFesta(anivs, festa.aniversariante);

    // a foto da capa: a escolhida (videoCapa) ou a 1ª da festa.
    const mapa = new Map(festa.fotos.map((f) => [f.id, f.url]));
    const capaUrl = (festa.videoCapa && mapa.get(festa.videoCapa)) || festa.fotos[0]?.url || null;
    const foto = await fotoParaCapa(capaUrl, L, A);

    // Fonte encolhe conforme o título cresce — e ainda assim QUEBRA LINHA (largura limitada).
    const n = titulo.length;
    const tam = n <= 20 ? 92 : n <= 30 ? 80 : n <= 44 ? 66 : n <= 60 ? 56 : 48;

    const png = await new ImageResponse(
      (
        <div style={{ width: `${L}px`, height: `${A}px`, display: "flex", position: "relative", fontFamily: "Baloo" }}>
          {/* FUNDO: a foto borrada (ou o gradiente da marca, se a foto falhar) */}
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto.bg} width={L} height={A} style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, backgroundImage: `linear-gradient(160deg, ${cor} 0%, ${fundo} 100%)` }} />
          )}

          {/* Escurece o topo (legibilidade do logo do motor) e o rodapé (legibilidade do título) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${L}px`,
              height: `${A}px`,
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.85) 100%)",
            }}
          />

          {/* CONTEÚDO por cima: faixa livre no topo (logo do motor) → foto inteira → título embaixo */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", width: `${L}px`, height: `${A}px`, padding: "210px 0 0" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foto.fg}
                  width={foto.fw}
                  height={foto.fh}
                  style={{ width: `${foto.fw}px`, height: `${foto.fh}px`, borderRadius: 18, boxShadow: "0 20px 55px rgba(0,0,0,0.55)" }}
                />
              ) : (
                <div style={{ display: "flex" }} />
              )}
            </div>

            {/* O TÍTULO: fonte forte, largura limitada (quebra linha de verdade), sombra pra ler
                sobre qualquer foto. Alinhado à esquerda, como o motor fazia. */}
            <div style={{ display: "flex", padding: "36px 64px 150px", minHeight: 240, alignItems: "flex-end" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: tam,
                  fontWeight: 600,
                  color: "#ffffff",
                  lineHeight: 1.12,
                  textShadow: "0 4px 22px rgba(0,0,0,0.7)",
                }}
              >
                {titulo}
              </div>
            </div>
          </div>
        </div>
      ),
      { width: L, height: A, fonts: carregarFontes() },
    ).arrayBuffer();

    // PNG (2-3 MB) → JPEG (~300 KB): o motor baixa a capa; o download é o gargalo, não o CPU.
    const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
  } catch (e) {
    console.error("Erro ao desenhar a capa da festa:", e);
    return new Response("Não consegui desenhar a capa.", { status: 503, headers: { "cache-control": "no-store" } });
  }
}
