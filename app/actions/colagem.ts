"use server";

// VÍDEO ANÚNCIO (colagem): o fluxo inteiro do lado do site.
//   1. criarVideoColagem / salvarOfertaColagem — o dono cria e preenche a oferta (obrigatória).
//   2. gerarRoteiroColagem — a Bia escreve o JSON de cenas; o VALIDADOR (lib/colagem) confere e,
//      se faltar algo (ato, oferta, prazo, foto escura, fachada no gancho...), devolve pra ela
//      corrigir — até 3 tentativas.
//   3. gerarVozColagem — gera a narração (voz + jingle) e pega o tempo de CADA palavra (Whisper),
//      pra cada figurinha entrar na palavra certa.
//   4. montarVideoColagem — manda tudo pro endpoint /colagem do motor; ele avisa no /api/video-pronto.
// Usa o registro VideoTematico (modo "colagem") — assim o vídeo pronto entra no mesmo fluxo de
// Reels/agendamento dos vídeos do buffet.

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { fotosDivulgaveis } from "@/lib/fotos-divulgaveis";
import { gerarNarracaoMp3 } from "@/lib/narracao";
import { vozValida, VOZ_PADRAO } from "@/lib/vozes";
import { dispararMotorColagem } from "@/lib/video-engine";
import { baseUrl } from "@/lib/config";
import {
  corrigir, garantirOferta, completarCenas, soDetalhes, validarRoteiro, narracaoCompleta, alinharTempos, promptSistemaColagem, contarPalavras, prazoCurto,
  type Oferta, type Roteiro, type FotoInfo, type PalavraFalada,
} from "@/lib/colagem";

const OFERTA_VAZIA: Oferta = { principal: "", extras: [], prazo: "", condicoes: true };

function lerOferta(json: string): Oferta {
  try {
    const o = JSON.parse(json || "{}");
    return {
      principal: String(o.principal || "").slice(0, 70),
      extras: Array.isArray(o.extras) ? o.extras.map((x: unknown) => String(x || "").slice(0, 40)).filter(Boolean).slice(0, 3) : [],
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(o.prazo || "") ? o.prazo : "",
      condicoes: o.condicoes !== false,
    };
  } catch {
    return { ...OFERTA_VAZIA };
  }
}
function lerRoteiro(json: string): Roteiro | null {
  try {
    const r = JSON.parse(json || "{}");
    return Array.isArray(r?.cenas) && r.cenas.length ? (r as Roteiro) : null;
  } catch {
    return null;
  }
}

async function carregar(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { id: true, nome: true, slug: true, descricao: true, logoUrl: true, mascoteUrl: true, corPrimaria: true } } },
  });
  if (!v || v.modo !== "colagem") return { ok: false as const, erro: "Vídeo anúncio não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  return { ok: true as const, v };
}

// ---------- 1. criar / oferta ----------
export async function criarVideoColagem(marcaId: string, titulo = "") {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const nome = (titulo || "").trim().slice(0, 40) || "Vídeo anúncio";
  const v = await prisma.videoTematico.create({ data: { marcaId, titulo: nome, modo: "colagem" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, id: v.id };
}

export async function salvarOfertaColagem(videoId: string, oferta: Oferta) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const o = lerOferta(JSON.stringify(oferta));
  if (o.principal.trim().length < 3) return { ok: false as const, erro: "Escreva o benefício principal da oferta (ex: +10 amiguinhos grátis)." };
  const mudou = c.v.colagemOferta !== JSON.stringify(o);
  // Oferta nova = roteiro antigo não vale mais (os números mudaram).
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemOferta: JSON.stringify(o), ...(mudou ? { colagemRoteiro: "{}" } : {}) } });
  revalidatePath(`/painel/marcas/${c.v.marcaId}`);
  return { ok: true as const, oferta: o, roteiroZerado: mudou && c.v.colagemRoteiro !== "{}" };
}

export async function dadosVideoColagem(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const roteiro = lerRoteiro(c.v.colagemRoteiro);
  const fotosIds = roteiro ? [...new Set(roteiro.cenas.flatMap((x) => x.elementos.filter((e) => e.tipo === "foto").map((e) => e.asset || "")))] : [];
  const imgs = fotosIds.length ? await prisma.imagemMarca.findMany({ where: { id: { in: fotosIds }, marcaId: c.v.marcaId }, select: { id: true, url: true } }) : [];
  return {
    ok: true as const,
    titulo: c.v.titulo,
    oferta: lerOferta(c.v.colagemOferta),
    roteiro,
    fotos: Object.fromEntries(imgs.map((i) => [i.id, i.url])),
    narracao: { url: c.v.narracaoUrl, segundos: c.v.narracaoSeg, voz: c.v.narracaoVoz || VOZ_PADRAO, estilo: c.v.narracaoEstilo },
    temTempos: Boolean(roteiro?.cenas.every((x) => typeof x.inicio === "number")) && c.v.narracaoUrl.startsWith("http"),
    videoUrl: c.v.videoUrl,
  };
}

// ---------- 2. roteiro (Bia + validador) ----------
// Foto escura/sem cor não serve pra anúncio. Mede de verdade (brilho médio da miniatura).
async function medirFoto(url: string): Promise<{ brilho: number; cor: number } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const { data } = await sharp(Buffer.from(await r.arrayBuffer())).resize(48, 48, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let soma = 0, sat = 0;
    for (let i = 0; i < data.length; i += 3) {
      const [a, b, c] = [data[i], data[i + 1], data[i + 2]];
      soma += 0.299 * a + 0.587 * b + 0.114 * c;
      sat += Math.max(a, b, c) - Math.min(a, b, c);
    }
    const n = data.length / 3;
    return { brilho: soma / n, cor: sat / n };
  } catch {
    return null;
  }
}

// Ordena o acervo pra Bia: crianças/festa/cor primeiro; espaço vazio, escuro e fachada por último.
function pontuar(descricao: string, categoria: string): number {
  const d = descricao.toLowerCase();
  let p = 0;
  if (/crian|menin|aniversari|parab|bolo|festa|brincando|sorrindo|dan[çc]/.test(d)) p += 3;
  if (/colorid|balõ|balo|decora|luzes|brinquedo|pula|tobog|piscina de bolinha/.test(d)) p += 1.5;
  if (categoria === "festa" || categoria === "brinquedos") p += 1;
  if (/vazi|sem pessoas|escur|noite/.test(d)) p -= 3;
  if (/fachada|entrada|letreiro|port[aã]o|externa/.test(d)) p -= 1;
  return p;
}

// UMA tentativa por chamada (a Vercel corta em 60s): se reprovar, devolve o rascunho + os
// problemas e a TELA chama de novo mandando a correção (até 3 vezes).
export async function gerarRoteiroColagem(videoId: string, correcao?: { rascunho: string; erros: string[] }, ultimaTentativa = false) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const oferta = lerOferta(v.colagemOferta);
  if (oferta.principal.trim().length < 3) return { ok: false as const, erro: "Preencha a oferta primeiro (o benefício principal é obrigatório)." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const acervo = (await fotosDivulgaveis(v.marcaId, { comDescricao: true }))
    .map((f) => ({ ...f, pts: pontuar(f.descricao, f.categoria) }))
    .sort((a, b) => b.pts - a.pts || a.usos - b.usos)
    .slice(0, 60);
  if (acervo.length < 4) return { ok: false as const, erro: "Preciso de pelo menos 4 fotos com descrição no banco de imagens pra montar o anúncio." };
  const fotos = new Map<string, FotoInfo>(acervo.map((f) => [f.id, { descricao: f.descricao, categoria: f.categoria }]));
  const urlDe = new Map(acervo.map((f) => [f.id, f.url]));

  const lista = acervo.map((f) => `${f.id} | ${f.categoria} | ${f.descricao}`).join("\n");
  const pedido = `OFERTA (obrigatória — use exatamente):
- Benefício principal: ${oferta.principal}
- Extras: ${oferta.extras.length ? oferta.extras.join("; ") : "(nenhum)"}
- Prazo: ${oferta.prazo ? `até ${prazoCurto(oferta.prazo)} (fale "até dia ..." por extenso; escreva "Até ${prazoCurto(oferta.prazo)}" num adesivo)` : "(sem prazo)"}
- Tem condições/letras miúdas: ${oferta.condicoes ? 'sim — rodapé "Consulte condições" na última cena' : "não"}

FOTOS DISPONÍVEIS (id | categoria | descrição) — as primeiras costumam ser as melhores:
${lista}

Escreva o roteiro de cenas.`;

  const mensagens: { role: string; content: string }[] = [
    { role: "system", content: promptSistemaColagem({ nome: v.marca.nome, descricao: v.marca.descricao || "" }) },
    { role: "user", content: pedido },
  ];
  if (correcao?.rascunho) {
    mensagens.push(
      { role: "assistant", content: correcao.rascunho.slice(0, 20000) },
      { role: "user", content: `O roteiro foi REPROVADO na conferência. Corrija TODOS estes pontos e devolva o JSON completo de novo:\n- ${correcao.erros.slice(0, 12).join("\n- ")}` },
    );
  }

  let texto = "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", response_format: { type: "json_object" }, temperature: correcao ? 0.5 : 0.8, messages: mensagens }),
      signal: AbortSignal.timeout(45000),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    texto = data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("Erro ao escrever o roteiro da colagem:", e);
    return { ok: false as const, erro: "Não consegui falar com a Bia agora. Tenta de novo em instantes." };
  }

  let roteiro: Roteiro;
  try {
    roteiro = completarCenas(garantirOferta(corrigir(JSON.parse(texto) as Roteiro), oferta));
  } catch {
    return { ok: false as const, reprovado: true as const, rascunho: texto, erros: ["A resposta não veio em JSON válido — responda SÓ com o JSON no formato pedido."] };
  }
  const erros = validarRoteiro(roteiro, oferta, fotos);
  // Fotos escolhidas: escura ou sem cor nenhuma → pede troca (mede todas em paralelo).
  const escolhidas = [...new Set(roteiro.cenas.flatMap((x) => x.elementos.filter((e) => e.tipo === "foto").map((e) => e.asset || "")))].filter((id) => urlDe.has(id));
  const medidas = await Promise.all(escolhidas.map((id) => medirFoto(urlDe.get(id)!)));
  escolhidas.forEach((id, i) => {
    const m = medidas[i];
    if (m && m.brilho < 62) erros.push(`A foto "${id}" é muito escura — troque por outra mais clara e colorida.`);
    else if (m && m.cor < 18) erros.push(`A foto "${id}" está sem cor (cinza/apagada) — prefira uma mais colorida.`);
  });
  // Na última tentativa, problema só de gosto (tamanho do texto, foto meio apagada) não segura o vídeo.
  if (erros.length && !(ultimaTentativa && soDetalhes(erros))) return { ok: false as const, reprovado: true as const, rascunho: texto, erros };

  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(roteiro), narracaoTexto: narracaoCompleta(roteiro) } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, roteiro, palavras: roteiro.cenas.reduce((s, x) => s + contarPalavras(x.narracao), 0) };
}

// ---------- 3. voz + tempo de cada palavra ----------
async function tempoDasPalavras(audioUrl: string): Promise<PalavraFalada[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const audio = await fetch(audioUrl, { signal: AbortSignal.timeout(20000) });
    if (!audio.ok) return [];
    const form = new FormData();
    form.append("file", new Blob([await audio.arrayBuffer()], { type: "audio/mpeg" }), "narracao.mp3");
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(45000) });
    if (!r.ok) { console.error("Whisper", r.status, await r.text().catch(() => "")); return []; }
    const d = await r.json();
    return Array.isArray(d.words) ? (d.words as PalavraFalada[]) : [];
  } catch (e) {
    console.error("Whisper falhou (uso tempo estimado):", e);
    return [];
  }
}

export async function gerarVozColagem(videoId: string, vozId?: string, direcao?: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar." };
  const roteiro = lerRoteiro(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Peça o roteiro pra Bia primeiro." };
  const voz = vozValida(vozId || v.narracaoVoz || VOZ_PADRAO);
  const estilo = (direcao ?? v.narracaoEstilo ?? "").trim().slice(0, 900);
  try {
    const { url, segundos } = await gerarNarracaoMp3({ texto: narracaoCompleta(roteiro), vozId: voz, direcao: estilo, slugMarca: v.marca.slug || "marca", ref: videoId.slice(-6) });
    const falada = await tempoDasPalavras(url);
    const alinhado = alinharTempos(roteiro, falada, segundos);
    const antigo = v.narracaoUrl;
    await prisma.videoTematico.update({
      where: { id: videoId },
      data: { colagemRoteiro: JSON.stringify(alinhado), narracaoTexto: narracaoCompleta(roteiro), narracaoVoz: voz, narracaoEstilo: estilo, narracaoUrl: url, narracaoSeg: Math.round(segundos) },
    });
    if (antigo.startsWith("http")) import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    const aviso = segundos < 26 ? "A narração ficou curta — se quiser um vídeo mais cheio, peça outro roteiro." : segundos > 38 ? "A narração passou de 35s — se quiser mais curto, peça outro roteiro." : "";
    return { ok: true as const, url, segundos: Math.round(segundos), sincronizado: falada.length > 0, aviso };
  } catch (e) {
    console.error("Erro ao gerar a voz da colagem:", e);
    return { ok: false as const, erro: "Não consegui gerar a voz agora." };
  }
}

// ---------- 4. motor ----------
export async function montarVideoColagem(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "Já estou montando esse vídeo — aguarde um pouquinho." };
  const roteiro = lerRoteiro(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Peça o roteiro pra Bia primeiro." };
  if (!v.narracaoUrl.startsWith("http") || !roteiro.cenas.every((x) => typeof x.inicio === "number")) return { ok: false as const, erro: "Gere a voz antes de montar o vídeo." };

  // LGPD: só fotos desta marca, soltas ou de festa autorizada.
  const ids = [...new Set(roteiro.cenas.flatMap((x) => x.elementos.filter((e) => e.tipo === "foto").map((e) => e.asset || "")))];
  const imgs = await prisma.imagemMarca.findMany({
    where: { id: { in: ids }, marcaId: v.marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] },
    select: { id: true, url: true },
  });
  if (imgs.length !== ids.length) return { ok: false as const, erro: "Alguma foto do roteiro não está mais disponível — peça um roteiro novo." };

  const antigo = v.videoUrl;
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: "gerando" } });
  const r = await dispararMotorColagem({
    roteiro,
    fotos: Object.fromEntries(imgs.map((i) => [i.id, i.url])),
    audioUrl: v.narracaoUrl,
    mascote: v.marca.mascoteUrl ? { url: v.marca.mascoteUrl } : undefined,
    logoUrl: v.marca.logoUrl || undefined,
    nomeArquivo: `${v.marca.slug || "reels"}-anuncio`,
    ref: videoId,
    callbackUrl: process.env.VIDEO_CALLBACK_URL || `${baseUrl()}/api/video-pronto`,
    callbackToken: process.env.VIDEO_CALLBACK_SECRET || "",
  });
  if (!r.ok) {
    await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: antigo } });
    return { ok: false as const, erro: r.erro };
  }
  await prisma.imagemMarca.updateMany({ where: { id: { in: ids } }, data: { usos: { increment: 1 } } }).catch(() => {});
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}
