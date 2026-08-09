import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { carregarFontes, paletaDaMarca, logoUrlMarca, montarTituloColorido } from "@/lib/arte";
import { fotoSegura, fotosSeguras } from "@/lib/foto-arte";
import { seloDataComemorativa } from "@/lib/datas-comemorativas";
import type { ReactElement } from "react";
import { LayoutPromocao, LayoutFoto, LayoutDataComemorativa, LayoutDivulgacao, LayoutMosaico, LayoutCapaMoldura, LayoutCapaFaixa, LayoutFeedback, LayoutPreco, LayoutEnquete, LayoutVitrine, type DadosArte } from "@/lib/arte-layouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache forte: as URLs no painel levam ?v=<hash do conteúdo>, então a arte já
// renderizada vem do cache (CDN/navegador) e o ?v= troca quando o conteúdo muda.
const CACHE = { "cache-control": "public, max-age=31536000, immutable" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;

  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  const fonts = carregarFontes();

  if (!p) {
    return new ImageResponse(
      <div style={{ width: "1080px", height: "1350px", display: "flex", backgroundColor: "#2196F3" }} />,
      { width: 1080, height: 1350, fonts, headers: CACHE }
    );
  }

  const marca = p.marca;
  const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
  const logoSrc = marca.logoUrl ? logoUrlMarca(origin, marca.id) : "";

  let extra: { oferta?: string; validade?: string; inclui?: string[]; regras?: string; selo?: string; diferenciais?: string[]; corFundo?: string; fotos?: string[]; depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string; precoDe?: string; precoPor?: string; labelPor?: string; parcelas?: string; economia?: string; condicoes?: string[]; modoPreco?: string; ladoA?: string; ladoB?: string; fotoAutor?: string; google?: boolean; parcelamento?: string; layoutData?: string; mascoteCanto?: string; mascoteTam?: string; logoCanto?: string; logoTam?: string } = {};
  try {
    extra = JSON.parse(p.extra || "{}");
  } catch {}

  // LOGO com posição personalizada: quando o dono escolhe um canto, escondemos o logo PADRÃO
  // do modelo (logoSrc vazio) e colamos o logo no canto/tamanho escolhidos (overlay, igual ao
  // mascote). Canto vazio = comportamento padrão (o modelo desenha o logo onde sempre desenhou).
  const logoCustom = Boolean(logoSrc) && ["dir", "esq", "cima-dir", "cima-esq"].includes(extra.logoCanto || "");

  const base: DadosArte = {
    paleta,
    logoSrc: logoCustom ? "" : logoSrc,
    site: marca.site || "",
    telefone: marca.telefone || "",
    titulo: montarTituloColorido(p.titulo, paleta),
    textoApoio: p.texto || "",
  };

  // Normaliza a foto pra um formato que o next/og aceita (PNG/JPEG) — senão webp/avif
  // do banco quebram o render. Feito uma vez e reusado pelos templates com foto.
  const fotoUrl = await fotoSegura(p.imagemUrl);

  let arte: ReactElement;
  if (p.template === "promocao") {
    arte = LayoutPromocao({ ...base, oferta: extra.oferta, validade: extra.validade, inclui: extra.inclui, regras: extra.regras, corFundo: extra.corFundo, imagemUrl: fotoUrl });
  } else if (p.template === "data-comemorativa") {
    // A DATA do selo vem sempre do CALENDÁRIO quando o post cai num dia comemorativo
    // conhecido — corrige na hora posts antigos onde a IA chutou a data errada (ex: Dia
    // dos Pais é o 2º domingo de agosto, móvel). Fora de data conhecida, usa o selo salvo.
    const seloReal = seloDataComemorativa(p.data) || extra.selo;
    arte = LayoutDataComemorativa({ ...base, selo: seloReal, corFundo: extra.corFundo, imagemUrl: fotoUrl, layoutData: extra.layoutData });
  } else if (p.template === "divulgacao") {
    arte = LayoutDivulgacao({ ...base, diferenciais: extra.diferenciais, corFundo: extra.corFundo, parcelamento: extra.parcelamento, imagemUrl: fotoUrl });
  } else if (p.template === "mosaico") {
    arte = LayoutMosaico({ ...base, oferta: extra.oferta, validade: extra.validade, corFundo: extra.corFundo, fotos: await fotosSeguras(extra.fotos) });
  } else if (p.template === "moldura") {
    arte = LayoutCapaMoldura({ ...base, corFundo: extra.corFundo });
  } else if (p.template === "faixa") {
    arte = LayoutCapaFaixa({ ...base, corFundo: extra.corFundo, imagemUrl: fotoUrl });
  } else if (p.template === "feedback") {
    const fotoAutorUrl = extra.fotoAutor ? await fotoSegura(extra.fotoAutor) : undefined;
    arte = LayoutFeedback({ ...base, titulo: [], imagemUrl: fotoUrl, depoimento: extra.depoimento, autor: extra.autor, estrelas: extra.estrelas, destaque: extra.destaque, corCard: extra.corCard, fotoAutor: fotoAutorUrl, google: extra.google });
  } else if (p.template === "preco") {
    arte = LayoutPreco({ ...base, modoPreco: extra.modoPreco, precoDe: extra.precoDe, precoPor: extra.precoPor, labelPor: extra.labelPor, parcelas: extra.parcelas, economia: extra.economia, condicoes: extra.condicoes, validade: extra.validade, corFundo: extra.corFundo, imagemUrl: fotoUrl });
  } else if (p.template === "enquete") {
    arte = LayoutEnquete({ ...base, imagemUrl: fotoUrl, ladoA: extra.ladoA, ladoB: extra.ladoB, corFundo: extra.corFundo });
  } else if (p.template === "vitrine") {
    arte = LayoutVitrine({ ...base, corFundo: extra.corFundo, fotos: await fotosSeguras(extra.fotos) });
  } else {
    // dica e templates legados: foto de IA (ou cor sólida se ainda não tem foto)
    arte = LayoutFoto({ ...base, imagemUrl: fotoUrl });
  }

  // MASCOTE (Fase 2): cola o mascote oficial (PNG transparente) no canto escolhido pelo dono
  // por post ("dir"/"esq"; vazio = não mostra). Sempre a MESMA imagem → o mascote é idêntico
  // em todo post. Sobreposto por cima da arte, sem cobrir o miolo (fica num canto de baixo).
  const canto = extra.mascoteCanto;
  const cantosOk = ["dir", "esq", "cima-dir", "cima-esq"];
  const usaMascote = Boolean(marca.mascoteUrl) && cantosOk.includes(canto || "");
  const emCima = canto === "cima-dir" || canto === "cima-esq";
  const naDireita = canto === "dir" || canto === "cima-dir";
  // Tamanho do mascote: pequeno | médio (padrão) | grande.
  const dim = extra.mascoteTam === "p" ? { w: 250, h: 315 } : extra.mascoteTam === "g" ? { w: 460, h: 580 } : { w: 340, h: 430 };

  // LOGO overlay (quando o dono escolheu um canto): posição + tamanho como o mascote. O logo é
  // "paisagem" (mais largo que alto), então a caixa é mais achatada. Sombrinha pra destacar.
  const logoCanto = extra.logoCanto;
  const logoEmCima = logoCanto === "cima-dir" || logoCanto === "cima-esq";
  const logoNaDireita = logoCanto === "dir" || logoCanto === "cima-dir";
  const logoDim = extra.logoTam === "p" ? { w: 210, h: 92 } : extra.logoTam === "g" ? { w: 400, h: 172 } : { w: 300, h: 128 };

  const overlays: ReactElement[] = [];
  if (usaMascote && marca.mascoteUrl) {
    overlays.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key="mascote"
        src={marca.mascoteUrl}
        width={dim.w}
        height={dim.h}
        style={{ position: "absolute", ...(emCima ? { top: 18 } : { bottom: 18 }), ...(naDireita ? { right: 18 } : { left: 18 }), width: `${dim.w}px`, height: `${dim.h}px`, objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.4))" }}
      />
    );
  }
  if (logoCustom) {
    overlays.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key="logo"
        src={logoSrc}
        width={logoDim.w}
        height={logoDim.h}
        style={{ position: "absolute", ...(logoEmCima ? { top: 30 } : { bottom: 30 }), ...(logoNaDireita ? { right: 30 } : { left: 30 }), width: `${logoDim.w}px`, height: `${logoDim.h}px`, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
      />
    );
  }

  const conteudo: ReactElement = overlays.length ? (
    <div style={{ position: "relative", display: "flex", width: "1080px", height: "1350px" }}>
      {arte}
      {overlays}
    </div>
  ) : (
    arte
  );

  return new ImageResponse(conteudo, { width: 1080, height: 1350, fonts, headers: CACHE });
}
