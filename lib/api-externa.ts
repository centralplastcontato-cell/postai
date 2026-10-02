import { createHash, randomBytes } from "crypto";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { urlExternaSegura } from "@/lib/foto-arte";
import { acessoExpirado } from "@/lib/plano";
import type { Conteudo, Publicacao } from "@prisma/client";

// API de AUTOMAÇÃO EXTERNA (/api/v1/posts): uma automação de fora (n8n, Make, Zapier, script)
// cria, consulta e cancela posts de UMA marca. O post vira um Conteudo (carrossel) ou uma
// Publicacao (feed/story/reels) comum, com origem="api" — e o piloto automático publica igual
// aos outros. A mídia é COPIADA pro Blob na entrada (link de origem pode expirar) e validada
// contra as regras do Instagram ANTES de aceitar, pra não falhar só na hora de publicar.

// ── Chave por marca ─────────────────────────────────────────────────────────────────────────
// Formato: "pa_" + 32 bytes aleatórios (base64url). No banco vai SÓ o SHA-256 dela.
export function gerarChave(): { chave: string; hash: string; prefixo: string } {
  const chave = `pa_${randomBytes(32).toString("base64url")}`;
  return { chave, hash: hashChave(chave), prefixo: chave.slice(0, 10) };
}

export function hashChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export type MarcaApi = { id: string; nome: string; slug: string; igUserId: string; accessToken: string };

// Resolve a marca pela chave do header Authorization. null = chave ausente/errada/revogada,
// marca desativada ou dono com acesso vencido.
export async function marcaDaChave(req: Request): Promise<{ ok: true; marca: MarcaApi } | { ok: false; status: number; erro: string }> {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(pa_[A-Za-z0-9_-]{20,})\s*$/);
  if (!m) return { ok: false, status: 401, erro: "Envie a chave da marca no cabeçalho: Authorization: Bearer pa_..." };
  const marca = await prisma.marca
    .findUnique({ where: { apiChaveHash: hashChave(m[1]) }, include: { usuario: { select: { admin: true, acessoAte: true } } } })
    .catch(() => undefined);
  if (marca === undefined) return { ok: false, status: 503, erro: "O banco demorou a responder. Tente de novo em instantes." };
  if (!marca) return { ok: false, status: 401, erro: "Chave inválida ou revogada." };
  if (!marca.ativa) return { ok: false, status: 403, erro: "Esta marca está desativada no Postaí." };
  if (marca.usuario && acessoExpirado(marca.usuario)) return { ok: false, status: 403, erro: "O acesso desta marca ao Postaí venceu." };
  return { ok: true, marca: { id: marca.id, nome: marca.nome, slug: marca.slug, igUserId: marca.igUserId, accessToken: marca.accessToken } };
}

// ── Erros de validação ──────────────────────────────────────────────────────────────────────
export type ErroCampo = { campo: string; codigo: string; mensagem: string };

export function respostaErro(status: number, erros: ErroCampo[] | string) {
  const lista = typeof erros === "string" ? [{ campo: "", codigo: status === 401 ? "NAO_AUTORIZADO" : "ERRO", mensagem: erros }] : erros;
  return Response.json({ ok: false, erro: lista.map((e) => e.mensagem).join(" "), erros: lista }, { status });
}

// ── Regras do Instagram (Content Publishing API) ────────────────────────────────────────────
export const FORMATOS = ["feed", "carrossel", "story", "reels"] as const;
export type FormatoApi = (typeof FORMATOS)[number];
export const STATUS_ENTRADA = ["agendado", "aguardando_aprovacao"] as const;

const MB = 1024 * 1024;
const MAX_VIDEO = 100 * MB; // Story de vídeo: 100 MB no Instagram; Reels aceita mais, mas a função do Postaí guarda o vídeo inteiro em memória
const MAX_LEGENDA = 2200;
const MAX_HASHTAGS = 30;
// Feed/carrossel: proporção entre 4:5 (retrato) e 1.91:1 (paisagem). Uma folguinha pro arredondamento.
const RAZAO_MIN_FEED = 0.8 - 0.005;
const RAZAO_MAX_FEED = 1.91 + 0.005;
const VIDEO_MAX_LARGURA = 1920;
const REELS_MIN_S = 3, REELS_MAX_S = 15 * 60;
const STORY_MIN_S = 3, STORY_MAX_S = 60;

// Horário ISO 8601 COM fuso explícito (Z ou ±hh:mm). Sem fuso é ambíguo → recusado.
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

export type EntradaPost = {
  formato?: unknown;
  legenda?: unknown;
  hashtags?: unknown;
  horario?: unknown;
  status?: unknown;
  external_id?: unknown;
  midias: (string | File)[]; // link público OU arquivo enviado (multipart)
  capa?: string | File | null; // só Reels
};

type Normalizado = {
  formato: FormatoApi;
  legenda: string;
  hashtags: string;
  data: Date;
  status: "agendado" | "aguardando_aprovacao";
  externalId: string | null;
};

// Hashtags podem vir como texto ("#a #b") ou lista (["a", "#b"]). Sai sempre "#a #b".
function normalizarHashtags(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return "";
  const partes = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : null;
  if (!partes) return null;
  return partes
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
}

export function validarCampos(e: EntradaPost, agora = new Date()): { ok: true; v: Normalizado } | { ok: false; erros: ErroCampo[] } {
  const erros: ErroCampo[] = [];
  const formato = typeof e.formato === "string" ? (e.formato.trim().toLowerCase() as FormatoApi) : ("" as FormatoApi);
  if (!FORMATOS.includes(formato)) {
    erros.push({ campo: "formato", codigo: "FORMATO_INVALIDO", mensagem: `formato deve ser um de: ${FORMATOS.join(", ")}.` });
  }

  const legenda = e.legenda === undefined || e.legenda === null ? "" : typeof e.legenda === "string" ? e.legenda.trim() : null;
  if (legenda === null) erros.push({ campo: "legenda", codigo: "LEGENDA_INVALIDA", mensagem: "legenda deve ser texto." });

  const hashtags = normalizarHashtags(e.hashtags);
  if (hashtags === null) erros.push({ campo: "hashtags", codigo: "HASHTAGS_INVALIDAS", mensagem: "hashtags deve ser texto (\"#a #b\") ou lista ([\"a\", \"b\"])." });

  if (legenda !== null && hashtags !== null) {
    const total = [legenda, hashtags].filter(Boolean).join("\n\n");
    if (total.length > MAX_LEGENDA) {
      erros.push({ campo: "legenda", codigo: "LEGENDA_LONGA", mensagem: `legenda + hashtags passam de ${MAX_LEGENDA} caracteres (têm ${total.length}), o máximo do Instagram.` });
    }
    const qtd = (total.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    if (qtd > MAX_HASHTAGS) {
      erros.push({ campo: "hashtags", codigo: "HASHTAGS_DEMAIS", mensagem: `O Instagram aceita até ${MAX_HASHTAGS} hashtags por post (vieram ${qtd}, contando as da legenda).` });
    }
  }

  let data = new Date(NaN);
  if (typeof e.horario !== "string" || !ISO_COM_FUSO.test(e.horario.trim())) {
    erros.push({ campo: "horario", codigo: "HORARIO_INVALIDO", mensagem: "horario deve ser ISO 8601 com fuso, ex.: 2026-10-05T10:00:00-03:00." });
  } else {
    data = new Date(e.horario.trim());
    if (isNaN(data.getTime())) {
      erros.push({ campo: "horario", codigo: "HORARIO_INVALIDO", mensagem: "horario não é uma data válida." });
    } else if (data.getTime() < agora.getTime() - 60_000) {
      erros.push({ campo: "horario", codigo: "HORARIO_PASSADO", mensagem: "horario está no passado. Para publicar já, mande o horário de agora (ou alguns minutos à frente)." });
    }
  }

  const statusTxt = e.status === undefined || e.status === null || e.status === "" ? "aguardando_aprovacao" : String(e.status).trim().toLowerCase();
  if (!(STATUS_ENTRADA as readonly string[]).includes(statusTxt)) {
    erros.push({ campo: "status", codigo: "STATUS_INVALIDO", mensagem: `status deve ser "agendado" ou "aguardando_aprovacao".` });
  }

  let externalId: string | null = null;
  if (e.external_id !== undefined && e.external_id !== null && e.external_id !== "") {
    if ((typeof e.external_id !== "string" && typeof e.external_id !== "number") || String(e.external_id).trim().length > 200) {
      erros.push({ campo: "external_id", codigo: "EXTERNAL_ID_INVALIDO", mensagem: "external_id deve ser texto de até 200 caracteres." });
    } else {
      externalId = String(e.external_id).trim();
    }
  }

  // Quantidade de mídias por formato.
  const n = e.midias.length;
  if (FORMATOS.includes(formato)) {
    if (formato === "carrossel" && (n < 2 || n > 10)) {
      erros.push({ campo: "midias", codigo: "QUANTIDADE_MIDIAS", mensagem: `carrossel precisa de 2 a 10 mídias (vieram ${n}).` });
    } else if (formato !== "carrossel" && n !== 1) {
      erros.push({ campo: "midias", codigo: "QUANTIDADE_MIDIAS", mensagem: `${formato} precisa de exatamente 1 mídia (vieram ${n}).` });
    }
    if (e.capa && formato !== "reels") {
      erros.push({ campo: "capa", codigo: "CAPA_SO_REELS", mensagem: "capa só é aceita no formato reels." });
    }
  }

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    v: { formato, legenda: legenda as string, hashtags: hashtags as string, data, status: statusTxt as Normalizado["status"], externalId },
  };
}

// ── Download + inspeção da mídia ────────────────────────────────────────────────────────────
type Bruto = { buf: Buffer; nome: string };

async function lerFonte(fonte: string | File, campo: string, limite: number): Promise<{ ok: true; b: Bruto } | { ok: false; erro: ErroCampo }> {
  if (typeof fonte !== "string") {
    if (fonte.size > limite) return { ok: false, erro: { campo, codigo: "MIDIA_GRANDE", mensagem: `${campo}: arquivo com ${(fonte.size / MB).toFixed(1)} MB passa do limite de ${limite / MB} MB.` } };
    return { ok: true, b: { buf: Buffer.from(await fonte.arrayBuffer()), nome: fonte.name || "arquivo" } };
  }
  const url = fonte.trim();
  if (!/^https?:\/\//i.test(url) || !urlExternaSegura(url)) {
    return { ok: false, erro: { campo, codigo: "MIDIA_URL_INVALIDA", mensagem: `${campo}: o link precisa ser http(s) público.` } };
  }
  let resp: Response;
  try {
    resp = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(40_000) });
  } catch {
    return { ok: false, erro: { campo, codigo: "MIDIA_INACESSIVEL", mensagem: `${campo}: não consegui baixar o link (tempo esgotado ou endereço fora do ar).` } };
  }
  if (!resp.ok || !resp.body) {
    return { ok: false, erro: { campo, codigo: "MIDIA_INACESSIVEL", mensagem: `${campo}: o link respondeu ${resp.status} — ele precisa ser público (sem login).` } };
  }
  const tam = Number(resp.headers.get("content-length") || 0);
  if (tam > limite) {
    await resp.body.cancel().catch(() => {});
    return { ok: false, erro: { campo, codigo: "MIDIA_GRANDE", mensagem: `${campo}: arquivo com ${(tam / MB).toFixed(1)} MB passa do limite de ${limite / MB} MB.` } };
  }
  // Lê em pedaços e corta se passar do limite (content-length pode não vir).
  const pedacos: Uint8Array[] = [];
  let total = 0;
  const leitor = resp.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      return { ok: false, erro: { campo, codigo: "MIDIA_GRANDE", mensagem: `${campo}: arquivo passa do limite de ${limite / MB} MB.` } };
    }
    pedacos.push(value);
  }
  const nome = decodeURIComponent(new URL(resp.url || url).pathname.split("/").pop() || "arquivo");
  return { ok: true, b: { buf: Buffer.concat(pedacos), nome } };
}

// Vídeo = contêiner ISO-BMFF (MP4/MOV): bytes 4..8 são "ftyp".
function ehVideo(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp";
}

// Lê duração e dimensões de um MP4/MOV direto das caixas (moov → mvhd / trak → tkhd + hdlr),
// sem ffmpeg. null = arquivo sem as caixas necessárias (corrompido ou "moov" ausente).
export function lerMp4(buf: Buffer): { duracao: number; largura: number; altura: number } | null {
  type Caixa = { tipo: string; ini: number; fim: number }; // ini = começo do CONTEÚDO
  const caixas = (ini: number, fim: number): Caixa[] => {
    const out: Caixa[] = [];
    let p = ini;
    while (p + 8 <= fim) {
      let tam = buf.readUInt32BE(p);
      const tipo = buf.toString("latin1", p + 4, p + 8);
      let cab = 8;
      if (tam === 1) {
        if (p + 16 > fim) break;
        tam = Number(buf.readBigUInt64BE(p + 8));
        cab = 16;
      } else if (tam === 0) {
        tam = fim - p;
      }
      if (tam < cab || p + tam > fim) break;
      out.push({ tipo, ini: p + cab, fim: p + tam });
      p += tam;
    }
    return out;
  };
  try {
    const moov = caixas(0, buf.length).find((c) => c.tipo === "moov");
    if (!moov) return null;
    const filhos = caixas(moov.ini, moov.fim);
    const mvhd = filhos.find((c) => c.tipo === "mvhd");
    if (!mvhd) return null;
    const v = buf.readUInt8(mvhd.ini);
    const escala = v === 1 ? buf.readUInt32BE(mvhd.ini + 20) : buf.readUInt32BE(mvhd.ini + 12);
    const dur = v === 1 ? Number(buf.readBigUInt64BE(mvhd.ini + 24)) : buf.readUInt32BE(mvhd.ini + 16);
    if (!escala) return null;
    for (const trak of filhos.filter((c) => c.tipo === "trak")) {
      const dentro = caixas(trak.ini, trak.fim);
      const mdia = dentro.find((c) => c.tipo === "mdia");
      const hdlr = mdia && caixas(mdia.ini, mdia.fim).find((c) => c.tipo === "hdlr");
      if (!hdlr || buf.toString("latin1", hdlr.ini + 8, hdlr.ini + 12) !== "vide") continue;
      const tkhd = dentro.find((c) => c.tipo === "tkhd");
      if (!tkhd) continue;
      const tv = buf.readUInt8(tkhd.ini);
      const matriz = tkhd.ini + (tv === 1 ? 52 : 40);
      let largura = Math.round(buf.readUInt32BE(matriz + 36) / 65536);
      let altura = Math.round(buf.readUInt32BE(matriz + 40) / 65536);
      // Matriz de rotação 90°/270° (vídeo de celular gravado em pé): a=0 → troca largura/altura.
      if (buf.readInt32BE(matriz) === 0) [largura, altura] = [altura, largura];
      return { duracao: dur / escala, largura, altura };
    }
    return null;
  } catch {
    return null;
  }
}

type MidiaPronta = { buf: Buffer; contentType: string; ext: string; tipo: "imagem" | "video"; largura: number; altura: number; duracao?: number };

const fmtRazao = (l: number, a: number) => `${l}x${a} (${(l / a).toFixed(2)}:1)`;

// Baixa (ou lê o arquivo), confere tipo/tamanho/proporção/duração e prepara pra subir.
// Imagem é sempre re-encodada pra JPEG (o único formato de foto que o Instagram aceita).
export async function prepararMidia(
  fonte: string | File,
  campo: string,
  formato: FormatoApi,
  papel: "midia" | "capa",
  avisos: string[],
): Promise<{ ok: true; m: MidiaPronta } | { ok: false; erro: ErroCampo }> {
  const lido = await lerFonte(fonte, campo, MAX_VIDEO);
  if (!lido.ok) return lido;
  const { buf } = lido.b;
  const erro = (codigo: string, mensagem: string) => ({ ok: false as const, erro: { campo, codigo, mensagem: `${campo}: ${mensagem}` } });

  if (ehVideo(buf)) {
    if (papel === "capa") return erro("TIPO_MIDIA", "a capa precisa ser uma imagem (JPEG/PNG).");
    if (formato === "feed" || formato === "carrossel") {
      return erro("TIPO_MIDIA", formato === "feed" ? "feed aceita só imagem — para vídeo use o formato reels." : "o carrossel do Postaí aceita só imagens.");
    }
    const info = lerMp4(buf);
    if (!info) return erro("VIDEO_INVALIDO", "não consegui ler o vídeo — envie um MP4 (H.264) ou MOV válido.");
    const { duracao, largura, altura } = info;
    const [min, max] = formato === "story" ? [STORY_MIN_S, STORY_MAX_S] : [REELS_MIN_S, REELS_MAX_S];
    if (duracao < min || duracao > max) {
      return erro("DURACAO_VIDEO", `o vídeo tem ${duracao.toFixed(1)}s; ${formato === "story" ? "Story de vídeo" : "Reels"} aceita de ${min}s a ${max >= 60 ? `${max / 60} min` : `${max}s`}.`);
    }
    if (formato === "story" && buf.length > 100 * MB) return erro("MIDIA_GRANDE", "Story de vídeo aceita até 100 MB.");
    if (!largura || !altura) return erro("VIDEO_INVALIDO", "o vídeo não tem faixa de imagem.");
    if (largura > VIDEO_MAX_LARGURA) {
      return erro("RESOLUCAO_VIDEO", `largura de ${largura}px passa do máximo do Instagram (${VIDEO_MAX_LARGURA}px).`);
    }
    const razao = largura / altura;
    if (razao < 0.01 || razao > 10) return erro("PROPORCAO", `proporção ${fmtRazao(largura, altura)} fora do aceito pelo Instagram.`);
    if (Math.abs(razao - 9 / 16) > 0.02) avisos.push(`${campo}: o vídeo é ${fmtRazao(largura, altura)}; o ideal é 9:16 (ex.: 1080x1920) — o Instagram vai cortar ou pôr bordas.`);
    const ehMov = buf.toString("latin1", 8, 12) === "qt  ";
    return { ok: true, m: { buf, contentType: ehMov ? "video/quicktime" : "video/mp4", ext: ehMov ? "mov" : "mp4", tipo: "video", largura, altura, duracao } };
  }

  // (Imagem grande não é problema: re-encodamos pra JPEG de até 1440px, bem abaixo dos 8 MB do Instagram.)
  let jpg: { data: Buffer; info: sharp.OutputInfo };
  try {
    jpg = await sharp(buf, { failOn: "error" })
      .rotate() // respeita a orientação EXIF
      .resize({ width: 1440, withoutEnlargement: true }) // 1440px = maior largura que o Instagram usa
      .flatten({ background: "#ffffff" }) // PNG transparente → fundo branco (JPEG não tem alfa)
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return erro("TIPO_MIDIA", "não é uma imagem (JPEG/PNG/WebP) nem um vídeo (MP4/MOV) válido.");
  }
  const { width: largura, height: altura } = jpg.info;
  const razao = largura / altura;
  if (papel === "midia" && (formato === "feed" || formato === "carrossel")) {
    if (razao < RAZAO_MIN_FEED || razao > RAZAO_MAX_FEED) {
      return erro("PROPORCAO", `imagem ${fmtRazao(largura, altura)} fora do aceito no feed: de 4:5 (0.80, retrato) a 1.91:1 (paisagem).`);
    }
    if (largura < 320) avisos.push(`${campo}: imagem com ${largura}px de largura — o Instagram amplia (abaixo de 320px fica borrada).`);
  }
  if (papel === "midia" && formato === "story" && Math.abs(razao - 9 / 16) > 0.02) {
    avisos.push(`${campo}: a imagem é ${fmtRazao(largura, altura)}; o ideal para Story é 9:16 (ex.: 1080x1920) — o Instagram vai cortar ou pôr bordas.`);
  }
  return { ok: true, m: { buf: jpg.data, contentType: "image/jpeg", ext: "jpg", tipo: "imagem", largura, altura } };
}

// ── Criação ─────────────────────────────────────────────────────────────────────────────────
export type ResultadoCriacao =
  | { ok: true; criado: boolean; post: PostApiJson; avisos: string[] }
  | { ok: false; status: number; erros: ErroCampo[] };

const tituloDaLegenda = (legenda: string, formato: FormatoApi) => {
  const primeira = legenda.split("\n").map((l) => l.trim()).find(Boolean) || "";
  const base = primeira.replace(/#[\p{L}\p{N}_]+/gu, "").trim();
  const rotulo = { feed: "Post", carrossel: "Carrossel", story: "Story", reels: "Reels" }[formato];
  return (base ? `${base.length > 60 ? `${base.slice(0, 57)}…` : base}` : `${rotulo} da automação`).slice(0, 80);
};

export async function criarPostApi(marca: MarcaApi, e: EntradaPost): Promise<ResultadoCriacao> {
  const val = validarCampos(e);
  if (!val.ok) return { ok: false, status: 400, erros: val.erros };
  const v = val.v;

  // Idempotência: mesmo external_id nesta marca → devolve o post já criado (não duplica).
  if (v.externalId) {
    const existente = await buscarPorExternalId(marca.id, v.externalId);
    if (existente) return { ok: true, criado: false, post: await postParaJson(existente, marca), avisos: [] };
  }

  // Limite do pacote (marca sem dono / dono sem plano = sem limite, como no painel).
  const { planoDaMarca, checarLimiteFeed } = await import("@/lib/limites");
  const { planoTemStory, rotuloPlano } = await import("@/lib/plano");
  const plano = await planoDaMarca(marca.id);
  if (plano && v.formato === "story" && !planoTemStory(plano)) {
    return { ok: false, status: 403, erros: [{ campo: "formato", codigo: "PLANO_SEM_STORY", mensagem: "O Story está disponível a partir do pacote Profissional." }] };
  }
  if (plano && (v.formato === "feed" || v.formato === "carrossel")) {
    const lim = await checarLimiteFeed(marca.id, v.data, plano);
    if (lim.bloqueia) {
      return { ok: false, status: 409, erros: [{ campo: "horario", codigo: "LIMITE_DO_PLANO", mensagem: `O pacote ${rotuloPlano(plano)} permite ${lim.limite} post(s) de feed por dia — esse dia já tem ${lim.jaTem}.` }] };
    }
  }

  // Baixa e valida TODAS as mídias antes de subir qualquer coisa.
  const avisos: string[] = [];
  const preparadas = await Promise.all([
    ...e.midias.map((f, i) => prepararMidia(f, `midias[${i}]`, v.formato, "midia", avisos)),
    ...(e.capa ? [prepararMidia(e.capa, "capa", v.formato, "capa", avisos)] : []),
  ]);
  const erros = preparadas.flatMap((p) => (p.ok ? [] : [p.erro]));
  if (erros.length) return { ok: false, status: 422, erros };
  const prontas = preparadas.map((p) => (p as { ok: true; m: MidiaPronta }).m);
  const midias = prontas.slice(0, e.midias.length);
  const capa = e.capa ? prontas[prontas.length - 1] : null;

  if (v.formato === "reels" && midias[0].tipo !== "video") {
    return { ok: false, status: 422, erros: [{ campo: "midias[0]", codigo: "TIPO_MIDIA", mensagem: "midias[0]: reels precisa de um vídeo (MP4/MOV)." }] };
  }
  if (v.formato === "carrossel") {
    const r0 = midias[0].largura / midias[0].altura;
    if (midias.some((m) => Math.abs(m.largura / m.altura - r0) > 0.02)) {
      avisos.push("As imagens do carrossel têm proporções diferentes — o Instagram corta todas na proporção da primeira.");
    }
  }
  if (!marca.igUserId || !marca.accessToken) {
    avisos.push("A marca ainda não está conectada ao Instagram — o post fica guardado, mas só será publicado depois de conectar.");
  }

  // Sobe pro Blob do Postaí (o link de origem pode expirar depois).
  const pasta = `api/${marca.slug}/${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const subidas: string[] = [];
  try {
    for (const [i, m] of prontas.entries()) {
      const nome = capa && i === prontas.length - 1 ? `capa.${m.ext}` : `${i + 1}.${m.ext}`;
      const b = await put(`${pasta}/${nome}`, m.buf, { access: "public", contentType: m.contentType });
      subidas.push(b.url);
    }
  } catch (err) {
    console.error("[api] falha ao subir mídia:", err);
    if (subidas.length) await del(subidas).catch(() => {});
    return { ok: false, status: 502, erros: [{ campo: "midias", codigo: "ARMAZENAMENTO", mensagem: "Não consegui guardar a mídia agora. Tente de novo em instantes." }] };
  }
  const urls = subidas.slice(0, midias.length);
  const capaUrl = capa ? subidas[subidas.length - 1] : null;

  const status = v.status === "agendado" ? "a_postar" : "aguardando_aprovacao";
  const titulo = tituloDaLegenda(v.legenda, v.formato);
  const sufixo = `${Date.now().toString(36).slice(-6)}${randomBytes(2).toString("hex")}`;
  const comum = { marcaId: marca.id, data: v.data, titulo, legenda: v.legenda, hashtags: v.hashtags, status, origem: "api", externalId: v.externalId };

  try {
    let reg: Registro;
    if (v.formato === "carrossel") {
      const c = await prisma.conteudo.create({
        data: { ...comum, slug: `${marca.slug}-api-${sufixo}`, slides: JSON.stringify(urls), slidesTexto: null, tema: null, categoria: null },
      });
      reg = { tipo: "carrossel", c };
    } else {
      const ehVideoMidia = midias[0].tipo === "video";
      const p = await prisma.publicacao.create({
        data: {
          ...comum,
          slug: `${marca.slug}-api-${sufixo}`,
          template: "arte-pronta", // o painel mostra a mídia como veio, sem template por cima
          texto: "",
          imagemUrl: ehVideoMidia ? capaUrl : urls[0],
          videoUrl: ehVideoMidia ? urls[0] : null,
          extra: JSON.stringify(capaUrl ? { capaUrl } : {}),
          tema: null,
          categoria: null,
          formato: v.formato, // feed | story | reels
          espelhar: false, // a automação manda o Story separado se quiser
        },
      });
      reg = { tipo: "publicacao", p };
    }
    const { registrarAtividade } = await import("@/lib/atividade");
    const { AGENTE } = await import("@/lib/config");
    const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(v.data);
    await registrarAtividade(
      AGENTE,
      status === "a_postar"
        ? `Recebi da automação o ${v.formato} "${titulo}" — agendado pra ${quando}.`
        : `Recebi da automação o ${v.formato} "${titulo}" (${quando}) — aguardando sua aprovação.`,
      marca.id,
    ).catch(() => {});
    return { ok: true, criado: true, post: await postParaJson(reg, marca), avisos };
  } catch (err) {
    await del(subidas).catch(() => {});
    // Corrida: dois envios do mesmo external_id ao mesmo tempo → o 2º cai aqui. Devolve o 1º.
    if (v.externalId && (err as { code?: string }).code === "P2002") {
      const existente = await buscarPorExternalId(marca.id, v.externalId);
      if (existente) return { ok: true, criado: false, post: await postParaJson(existente, marca), avisos: [] };
    }
    console.error("[api] falha ao criar post:", err);
    return { ok: false, status: 500, erros: [{ campo: "", codigo: "ERRO_INTERNO", mensagem: "Não consegui salvar o post. Tente de novo." }] };
  }
}

// ── Leitura / serialização ──────────────────────────────────────────────────────────────────
export type Registro = { tipo: "carrossel"; c: Conteudo } | { tipo: "publicacao"; p: Publicacao };

export async function buscarPorExternalId(marcaId: string, externalId: string): Promise<Registro | null> {
  const [c, p] = await Promise.all([
    prisma.conteudo.findUnique({ where: { marcaId_externalId: { marcaId, externalId } } }),
    prisma.publicacao.findUnique({ where: { marcaId_externalId: { marcaId, externalId } } }),
  ]);
  if (c) return { tipo: "carrossel", c };
  if (p) return { tipo: "publicacao", p };
  return null;
}

// Só posts que vieram da API e são DESTA marca (a chave de uma marca nunca enxerga outra).
export async function buscarPorId(marcaId: string, id: string): Promise<Registro | null> {
  const [c, p] = await Promise.all([
    prisma.conteudo.findFirst({ where: { id, marcaId, origem: "api" } }),
    prisma.publicacao.findFirst({ where: { id, marcaId, origem: "api" } }),
  ]);
  if (c) return { tipo: "carrossel", c };
  if (p) return { tipo: "publicacao", p };
  return null;
}

export type PostApiJson = {
  id: string;
  external_id: string | null;
  formato: string;
  status: "aguardando_aprovacao" | "agendado" | "processando" | "publicado" | "falhou" | "rascunho";
  horario: string;
  legenda: string;
  hashtags: string;
  midias: string[];
  capa: string | null;
  motivo_falha: string | null;
  link_instagram: string | null;
  publicado_em: string | null;
  criado_em: string;
};

function statusExterno(status: string, erro: string | null, containerId: string): PostApiJson["status"] {
  if (status === "postado") return "publicado";
  if (status === "aguardando_aprovacao") return "aguardando_aprovacao";
  if (status === "rascunho") return "rascunho";
  if (containerId) return "processando"; // vídeo já entregue à Meta (nova tentativa, se houve falha antes)
  if (erro) return "falhou";
  return "agendado";
}

export function midiasDoRegistro(r: Registro): { midias: string[]; capa: string | null } {
  if (r.tipo === "carrossel") {
    try {
      const a = JSON.parse(r.c.slides);
      return { midias: Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : [], capa: null };
    } catch {
      return { midias: [], capa: null };
    }
  }
  const p = r.p;
  if (p.videoUrl !== null) return { midias: p.videoUrl ? [p.videoUrl] : [], capa: p.imagemUrl || null };
  return { midias: p.imagemUrl ? [p.imagemUrl] : [], capa: null };
}

export async function postParaJson(r: Registro, marca: Pick<MarcaApi, "igUserId" | "accessToken">): Promise<PostApiJson> {
  const x = r.tipo === "carrossel" ? r.c : r.p;
  const formato = r.tipo === "carrossel" ? "carrossel" : r.p.formato;
  const containerId = r.tipo === "publicacao" ? r.p.reelsContainerId : "";
  const status = statusExterno(x.status, x.erroPostagem, containerId);

  // Link do post: guardado na publicação; se ainda não temos, busca uma vez na Meta e guarda.
  let permalink = x.permalink;
  if (status === "publicado" && !permalink && x.mediaId && marca.accessToken) {
    const { buscarPermalink } = await import("@/lib/instagram");
    permalink = await buscarPermalink(marca.accessToken, x.mediaId);
    if (permalink) {
      if (r.tipo === "carrossel") await prisma.conteudo.update({ where: { id: x.id }, data: { permalink } }).catch(() => {});
      else await prisma.publicacao.update({ where: { id: x.id }, data: { permalink } }).catch(() => {});
    }
  }
  const { midias, capa } = midiasDoRegistro(r);
  return {
    id: x.id,
    external_id: x.externalId,
    formato,
    status,
    horario: x.data.toISOString(),
    legenda: x.legenda,
    hashtags: x.hashtags,
    midias,
    capa,
    motivo_falha: status === "falhou" ? x.erroPostagem : null,
    link_instagram: permalink ?? null,
    publicado_em: x.status === "postado" && x.postadoEm ? x.postadoEm.toISOString() : null,
    criado_em: x.createdAt.toISOString(),
  };
}

// Apaga do Blob as mídias que a API copiou pra esse post (best-effort). Só arquivos da pasta api/.
export async function apagarMidiasDoRegistro(r: Registro) {
  const { midias, capa } = midiasDoRegistro(r);
  const nossas = [...midias, ...(capa ? [capa] : [])].filter((u) => /\.blob\.vercel-storage\.com\/api\//.test(u));
  if (nossas.length) await del(nossas).catch(() => {});
}
