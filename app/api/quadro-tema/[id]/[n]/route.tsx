import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes } from "@/lib/arte";
import { fotoSeguraComTamanho } from "@/lib/foto-arte";

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
//  - SEM LOGO no quadro: o MOTOR já carimba o logo da marca no canto de baixo à direita de
//    todo quadro — desenhar outro aqui deixava o vídeo com DOIS logos. Por isso o rodapé fica
//    livre e a legenda tem largura limitada (não passa por baixo do logo dele).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// s-maxage é o que a CDN da Vercel respeita (max-age sozinho só vale pro navegador). O ?v= da
// URL muda quando o conteúdo muda, então o quadro pode ser guardado "pra sempre".
const CACHE = "public, s-maxage=31536000, max-age=31536000, immutable";

const L = 1080; // largura do Reels
const A = 1920; // altura do Reels
const AREA_FOTO_H = 1330; // altura máxima da área da foto
const AREA_FOTO_L = 950; // largura máxima da área da foto
const BORDA = 16; // espessura da moldura branca
// O MOTOR carimba o logo da marca no canto inferior DIREITO de todo quadro. Por isso o quadro
// NÃO desenha logo (sairiam dois) e a legenda fica limitada a esta largura, à esquerda — senão
// a frase passaria por baixo do logo dele.
const LARG_LEGENDA = 730;

const falhou = (msg: string) => new Response(msg, { status: 503, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  const num = parseInt(n, 10); // aceita "3" e "3.jpg"
  // n = 0 é a CAPA (a foto de abertura com a frase-gancho). Ela também é desenhada aqui porque
  // o motor escreve o texto da capa numa fonte fixa e SEM quebrar linha — frase de gancho de
  // verdade estourava a tela ("Diversão que vira lembrança pra vida" virava "rsão que vira...").
  const ehCapa = num === 0;
  const idx = ehCapa ? -1 : Math.max(1, num || 1) - 1;

  try {
    const v = await prisma.videoTematico.findUnique({
      where: { id },
      include: { marca: { select: { corPrimaria: true, corFundo: true } } },
    });
    if (!v) return falhou("Vídeo não encontrado.");

    let ids: string[] = [];
    try {
      const a = JSON.parse(v.videoFotos || "[]");
      ids = Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : [];
    } catch {}
    const fotoId = ehCapa ? v.videoCapa || ids[0] : ids[idx];
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

    const foto = await fotoSeguraComTamanho(img.url);
    if (!foto) return falhou("Não consegui preparar a foto.");

    const cor = v.marca.corPrimaria || "#7C3AED";
    const fundo = v.marca.corFundo || "#0E0E0E";

    // A CAPA dá mais espaço pro gancho (ele é o que segura o dedo) — foto um pouco menor.
    // E deixa uma faixa livre no TOPO: na capa, o motor carimba o logo da marca ali no meio
    // (nos outros quadros ele carimba embaixo à direita — testado).
    const areaH = ehCapa ? 1120 : AREA_FOTO_H;
    // Moldura justa: escala a foto pra caber na área, mantendo a proporção dela.
    const escala = Math.min(AREA_FOTO_L / foto.largura, areaH / foto.altura);
    const fw = Math.round(foto.largura * escala);
    const fh = Math.round(foto.altura * escala);
    // Frase longa = fonte menor (cabe sem estourar). A capa é maior e forte (é o gancho), e
    // pode ocupar a largura toda — o logo do motor fica embaixo dela, não do lado.
    const tam = ehCapa
      ? legenda.length > 40
        ? 66
        : legenda.length > 26
          ? 78
          : 92
      : legenda.length > 85
        ? 44
        : legenda.length > 52
          ? 50
          : 58;

    // Estilo do FUNDO do quadro (escolhido pelo dono): "cheia" = a foto preenche a tela toda (sem
    // moldura); senão (padrão) a foto BORRADA e escurecida atrás, com a foto emoldurada por cima.
    const modo = v.videoFundo === "cheia" ? "cheia" : "desfocada";
    // "cor" = a foto emoldurada sobre um DEGRADÊ das cores da marca (sem a foto borrada atrás).
    const fundoCor = v.videoFundo === "cor";
    // CAPA CHAMATIVA ("impacto"): só no quadro 0 e quando o dono escolheu esse estilo. Foto na tela
    // toda + texto GIGANTE com contorno (tipo thumbnail de YouTube), seja qual for o fundo dos outros quadros.
    // Capa "grande" (fundo na tela toda + texto gigante embaixo): "impacto" usa a SUA foto,
    // "ia" usa a ARTE festiva gerada pela IA. Layout é o mesmo; muda só a imagem de fundo.
    const capaGrande = ehCapa && (v.capaEstilo === "impacto" || v.capaEstilo === "ia");

    // Fundo borrado (modo padrão): borra a foto com sharp (o next/og não faz blur). Se falhar,
    // cai no degradê das cores da marca.
    let bgBlur = "";
    if (modo === "desfocada" && !capaGrande && !fundoCor) {
      try {
        const raw = Buffer.from((foto.src.split(",")[1] || ""), "base64");
        const b = await sharp(raw).resize(L, A, { fit: "cover", position: "attention" }).blur(30).modulate({ brightness: 0.5 }).jpeg({ quality: 62 }).toBuffer();
        bgBlur = `data:image/jpeg;base64,${b.toString("base64")}`;
      } catch (e) {
        console.error("Não consegui borrar o fundo (uso o degradê):", e);
      }
    }

    // A LEGENDA (ou o GANCHO, na capa) — a MESMA peça nos dois modos de fundo.
    const legendaEl = legenda ? (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", width: ehCapa ? 130 : 96, height: ehCapa ? 12 : 9, backgroundColor: "#ffffff", borderRadius: 6, marginBottom: ehCapa ? 28 : 22, opacity: 0.9 }} />
        <div style={{ display: "flex", fontSize: tam, fontWeight: 600, color: "#ffffff", lineHeight: ehCapa ? 1.1 : 1.18, textShadow: ehCapa ? "0 4px 20px rgba(0,0,0,0.55)" : "0 3px 14px rgba(0,0,0,0.45)" }}>{legenda}</div>
      </div>
    ) : (
      <div style={{ display: "flex" }} />
    );

    // Imagem de fundo da capa grande: arte da IA (se estilo "ia" e já gerada) OU a sua foto em
    // tela cheia (cover-crop). A arte da IA é remota — o próprio next/og baixa e o objectFit ajusta.
    let bgImp = "";
    if (capaGrande) {
      if (v.capaEstilo === "ia" && (v.capaIaUrl || "").startsWith("http")) {
        bgImp = v.capaIaUrl;
      } else {
        try {
          const raw = Buffer.from((foto.src.split(",")[1] || ""), "base64");
          const b = await sharp(raw).resize(L, A, { fit: "cover", position: "attention" }).jpeg({ quality: 84 }).toBuffer();
          bgImp = `data:image/jpeg;base64,${b.toString("base64")}`;
        } catch (e) {
          console.error("Não consegui preparar a capa chamativa (uso a foto normal):", e);
        }
      }
    }
    const upper = (legenda || "").toUpperCase();
    const tamImp = upper.length > 44 ? 92 : upper.length > 28 ? 116 : 142;
    // CONTORNO GROSSO estilo thumbnail: anel de sombras pretas nas 8 direções + uma sombra suave.
    const ow = 6;
    const contornoImp = [
      `${ow}px ${ow}px 0 #000`, `-${ow}px ${ow}px 0 #000`, `${ow}px -${ow}px 0 #000`, `-${ow}px -${ow}px 0 #000`,
      `${ow}px 0 0 #000`, `-${ow}px 0 0 #000`, `0 ${ow}px 0 #000`, `0 -${ow}px 0 #000`, `0 12px 32px rgba(0,0,0,0.55)`,
    ].join(",");
    // CAPA CHAMATIVA: foto preenche a tela, texto gigante embaixo (o motor carimba o logo no TOPO da capa).
    const impactoEl = (
      <div style={{ width: `${L}px`, height: `${A}px`, display: "flex", position: "relative", fontFamily: "Baloo" }}>
        {bgImp ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgImp} width={L} height={A} style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start", padding: "0 70px 200px", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 63%, rgba(0,0,0,0.92) 100%)" }}>
          {upper ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", width: 250, height: 26, backgroundColor: cor, borderRadius: 13, marginBottom: 34, boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }} />
              <div style={{ display: "flex", fontSize: tamImp, fontWeight: 600, color: "#ffffff", lineHeight: 1.0, letterSpacing: -2, textShadow: contornoImp, maxWidth: `${L - 120}px` }}>{upper}</div>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
      </div>
    );

    // MOLDURA da foto (agora respeitada no vídeo do buffet): cor e espessura da borda ao redor da foto.
    const mol = v.videoMoldura || "branca";
    const molCorMarca = /^#[0-9a-fA-F]{6}$/.test(v.videoMolduraCor || "") ? v.videoMolduraCor : cor;
    const molCor = mol === "preta" ? "#141414" : mol === "marca" ? molCorMarca : "#ffffff";
    const molPad = mol === "nenhuma" ? 0 : mol === "grossa" ? 30 : BORDA;

    const el = capaGrande ? impactoEl :
      modo === "cheia" ? (
        // FOTO NA TELA TODA: preenche o 9:16 (corta as beiradas); legenda embaixo, sobre um
        // escurecido pra ler. Sem moldura.
        <div style={{ width: `${L}px`, height: `${A}px`, display: "flex", position: "relative", fontFamily: "Baloo" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.src} width={L} height={A} style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start", padding: ehCapa ? "215px 60px 150px" : "60px 60px 210px", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,0.35) 68%, rgba(0,0,0,0.82) 100%)" }}>
            <div style={{ display: "flex", flexDirection: "column", width: ehCapa ? "100%" : `${LARG_LEGENDA}px`, minHeight: 120 }}>{legendaEl}</div>
          </div>
        </div>
      ) : (
        // FOTO BORRADA ATRÁS (padrão): foto emoldurada e centralizada, sobre a versão borrada dela.
        <div style={{ width: `${L}px`, height: `${A}px`, display: "flex", position: "relative", fontFamily: "Baloo" }}>
          {bgBlur ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bgBlur} width={L} height={A} style={{ position: "absolute", top: 0, left: 0, width: `${L}px`, height: `${A}px`, objectFit: "cover" }} />
          ) : null}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${L}px`,
              height: `${A}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              // O rodapé (ou o topo, na capa) é do LOGO do motor — nada nosso nessas faixas.
              padding: ehCapa ? "215px 60px 150px" : "60px 60px 210px",
              backgroundImage: bgBlur
                ? "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.60) 100%)"
                : `linear-gradient(160deg, ${fundoCor && /^#[0-9a-fA-F]{6}$/.test(v.videoFundoCor) ? v.videoFundoCor : cor} 0%, ${fundoCor ? "#101018" : fundo} 100%)`,
            }}
          >
            {/* a FOTO, com a moldura branca justa nela */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: `${areaH}px` }}>
              <div style={{ display: "flex", padding: `${molPad}px`, backgroundColor: mol === "nenhuma" ? "transparent" : molCor, borderRadius: 8, boxShadow: mol === "nenhuma" ? "none" : "0 18px 50px rgba(0,0,0,0.45)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.src} width={fw} height={fh} style={{ width: `${fw}px`, height: `${fh}px`, objectFit: "cover", borderRadius: mol === "nenhuma" ? 8 : 2 }} />
              </div>
            </div>
            {/* O TEXTO (gancho na capa; legenda estreita nos demais, o logo do motor mora à direita). */}
            <div style={{ display: "flex", flexDirection: "column", width: ehCapa ? "100%" : `${LARG_LEGENDA}px`, marginRight: ehCapa ? 0 : "auto", marginTop: ehCapa ? 52 : 44, minHeight: 190 }}>{legendaEl}</div>
          </div>
        </div>
      );

    const png = await new ImageResponse(el, { width: L, height: A, fonts: carregarFontes() }).arrayBuffer();

    // PNG (2-3 MB) → JPEG (~300 KB): o motor baixa 26 quadros; o download é o gargalo, não o CPU.
    const jpg = await sharp(Buffer.from(png)).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
  } catch (e) {
    console.error("Erro ao desenhar o quadro do vídeo:", e);
    return falhou("Não consegui desenhar o quadro.");
  }
}
