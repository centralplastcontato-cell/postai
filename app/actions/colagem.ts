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
  garantirOferta, completarCenas, narracaoCompleta, alinharTempos, contarPalavras, prazoCurto, faixaPelaVelocidade, DURACAO,
  type Oferta, type Roteiro, type FotoInfo, type PalavraFalada,
} from "@/lib/colagem";
import { ATOS_MOLDE, moldePorId, sortearMoldes, sortearMascote, validarMoldes, soDetalhesMoldes, montarRoteiroMoldes, promptBiaMoldes, type Ato, type RespostaMoldes } from "@/lib/moldes";

export type Qualidade = {
  aprovado: boolean; coberturaMin: number; coberturaMedia: number; baseVaziaTrechos: string[]; cortados: string[]; ajustes: number; aviso: string;
  // checagem ampliada (motor v4) — opcionais: vídeos montados antes não têm
  duracao?: number; parados?: string[]; textosEncostando?: string[]; principalCoberto?: string[]; cenasLongas?: string[];
};
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
    qualidade: (() => { try { const q = JSON.parse(c.v.colagemQualidade || "{}"); return q && typeof q === "object" && "aprovado" in q ? (q as Qualidade) : null; } catch { return null; } })(),
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
// Velocidade REAL da voz escolhida (palavras por segundo), medida nos vídeos-anúncio já narrados
// com ela nesta marca — a Puck "animada", por exemplo, fala ~1,9 palavra/s; outras, 2,5+.
async function velocidadeDaVoz(marcaId: string, voz: string): Promise<number> {
  const vs = await prisma.videoTematico.findMany({
    where: { marcaId, modo: "colagem", narracaoVoz: voz, narracaoSeg: { gt: 8 }, NOT: { narracaoTexto: "" } },
    orderBy: { criadoEm: "desc" }, take: 3, select: { narracaoTexto: true, narracaoSeg: true },
  });
  const taxas = vs.map((x) => contarPalavras(x.narracaoTexto) / Math.max(5, x.narracaoSeg - 1.2)).filter((t) => t > 1 && t < 4); // 1,2s = o rabicho de música no fim
  return taxas.length ? taxas.reduce((a, b) => a + b, 0) / taxas.length : 2.3;
}

export async function gerarRoteiroColagem(videoId: string, correcao?: { rascunho: string; erros: string[] }, ultimaTentativa = false) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const faixa = faixaPelaVelocidade(await velocidadeDaVoz(v.marcaId, v.narracaoVoz || VOZ_PADRAO));
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

  // MOLDES: o sistema sorteia um molde por ato (sem repetir a combinação do último vídeo do buffet)
  // e em quais atos o mascote aparece; a Bia só preenche as vagas e escreve a narração. Nas
  // correções, o rascunho carrega a mesma escolha (a Bia corrige em cima do mesmo layout).
  let escolha: Record<Ato, string> | null = null;
  let comMascote: Set<Ato> | null = null;
  let rascunhoBia = "";
  if (correcao?.rascunho) {
    try {
      const r = JSON.parse(correcao.rascunho) as { texto: string; escolha: Record<Ato, string>; mascote: Ato[] };
      if (r.escolha && ATOS_MOLDE.every((a) => moldePorId(r.escolha[a]))) { escolha = r.escolha; comMascote = new Set(r.mascote || ["oferta"]); rascunhoBia = r.texto || ""; }
    } catch {}
  }
  if (!escolha || !comMascote) {
    const ultimo = await prisma.videoTematico.findFirst({ where: { marcaId: v.marcaId, modo: "colagem", NOT: { id: videoId } }, orderBy: { criadoEm: "desc" }, select: { colagemRoteiro: true } });
    let ultima: Record<string, string> | undefined;
    try { ultima = (JSON.parse(ultimo?.colagemRoteiro || "{}") as Roteiro).moldes; } catch {}
    escolha = sortearMoldes(ultima);
    comMascote = sortearMascote(escolha);
  }

  const pedido = `OFERTA (obrigatória — use exatamente):
- Benefício principal: ${oferta.principal}
- Extras: ${oferta.extras.length ? oferta.extras.join("; ") : "(nenhum)"}
- Prazo: ${oferta.prazo ? `até ${prazoCurto(oferta.prazo)} (fale "até dia ..." por extenso)` : "(sem prazo)"}

FOTOS DISPONÍVEIS (id | categoria | descrição) — as primeiras costumam ser as melhores:
${lista}

Escreva o roteiro.`;

  const mensagens: { role: string; content: string }[] = [
    { role: "system", content: promptBiaMoldes({ nome: v.marca.nome, descricao: v.marca.descricao || "" }, faixa, escolha, comMascote) },
    { role: "user", content: pedido },
  ];
  if (rascunhoBia) {
    mensagens.push(
      { role: "assistant", content: rascunhoBia.slice(0, 20000) },
      { role: "user", content: `O roteiro foi REPROVADO na conferência. Corrija TODOS estes pontos e devolva o JSON completo de novo:\n- ${(correcao?.erros || []).slice(0, 12).join("\n- ")}` },
    );
  }

  let texto = "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", response_format: { type: "json_object" }, temperature: rascunhoBia ? 0.5 : 0.8, messages: mensagens }),
      signal: AbortSignal.timeout(42000), // + banco/conferência: cabe nos 60s do site
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    texto = data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("Erro ao escrever o roteiro da colagem:", e);
    return { ok: false as const, erro: "Não consegui falar com a Bia agora. Tenta de novo em instantes." };
  }
  const rascunho = (t: string) => JSON.stringify({ texto: t, escolha, mascote: [...comMascote!] });

  let resposta: RespostaMoldes;
  try {
    resposta = JSON.parse(texto) as RespostaMoldes;
  } catch {
    return { ok: false as const, reprovado: true as const, rascunho: rascunho(texto), erros: ["A resposta não veio em JSON válido — responda SÓ com o JSON no formato pedido."] };
  }
  const erros = validarMoldes(resposta, escolha, oferta, fotos, faixa, comMascote);
  // Fotos escolhidas: escura ou sem cor nenhuma → pede troca (mede todas em paralelo).
  const escolhidas = [...new Set(ATOS_MOLDE.flatMap((a) => Object.values(resposta[a]?.vagas || {}).map((x) => x?.foto || "")))].filter((id) => urlDe.has(id));
  const medidas = await Promise.all(escolhidas.map((id) => medirFoto(urlDe.get(id)!)));
  escolhidas.forEach((id, i) => {
    const m = medidas[i];
    if (m && m.brilho < 62) erros.push(`A foto "${id}" é muito escura — troque por outra mais clara e colorida.`);
    else if (m && m.cor < 18) erros.push(`A foto "${id}" está sem cor (cinza/apagada) — prefira uma mais colorida.`);
  });
  // Na última tentativa, problema só de gosto (tamanho um pouco fora) não segura o vídeo.
  if (erros.length && !(ultimaTentativa && soDetalhesMoldes(erros))) return { ok: false as const, reprovado: true as const, rascunho: rascunho(texto), erros };
  const roteiro = montarRoteiroMoldes(resposta, escolha, oferta, comMascote);

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
    // A voz é a MESMA dos outros vídeos (mesma voz e direção escolhidas, sem acelerar — acelerar
    // deixava a voz mais fina). Só as pausas mudas longas são encurtadas; o tempo (DURACAO) vem do
    // TAMANHO do texto (a Bia encurta se passar).
    const texto = narracaoCompleta(roteiro);
    const { url, segundos } = await gerarNarracaoMp3({ texto, vozId: voz, direcao: estilo, slugMarca: v.marca.slug || "marca", ref: videoId.slice(-6), apertarPausas: true });
    const palavrasTexto = contarPalavras(texto);
    // Já salva com o tempo ESTIMADO de cada palavra (dá pra montar mesmo se a marcação falhar);
    // a marcação exata (Whisper) é outra chamada — juntas passavam do limite de 60s do site.
    const alinhado = alinharTempos(roteiro, [], segundos);
    const antigo = v.narracaoUrl;
    await prisma.videoTematico.update({
      where: { id: videoId },
      data: { colagemRoteiro: JSON.stringify(alinhado), narracaoTexto: texto, narracaoVoz: voz, narracaoEstilo: estilo, narracaoUrl: url, narracaoSeg: Math.round(segundos) },
    });
    if (antigo.startsWith("http")) import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    const foraDoTempo = segundos > DURACAO.max + 0.4 ? ("longo" as const) : segundos < DURACAO.min - 8 ? ("curto" as const) : null;
    return { ok: true as const, url, segundos: Math.round(segundos), segundosExatos: segundos, foraDoTempo, palavrasTexto };
  } catch (e) {
    console.error("Erro ao gerar a voz da colagem:", e);
    return { ok: false as const, erro: "Não consegui gerar a voz agora." };
  }
}

// ---------- 3a. marca o tempo de CADA palavra falada (Whisper) ----------
// Chamada separada da geração da voz (as duas juntas estouravam o limite de 60s). Se falhar, a voz
// continua valendo com o tempo estimado.
export async function sincronizarVozColagem(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const roteiro = lerRoteiro(v.colagemRoteiro);
  if (!roteiro || !v.narracaoUrl.startsWith("http")) return { ok: false as const, erro: "Gere a voz primeiro." };
  const falada = await tempoDasPalavras(v.narracaoUrl);
  const palavrasTexto = contarPalavras(v.narracaoTexto);
  // A voz do Google às vezes REPETE trechos (sai bem mais palavra falada do que escrita).
  const repetiu = falada.length > palavrasTexto * 1.3;
  console.log(`colagem voz: ${v.narracaoSeg}s, ${palavrasTexto} palavras no texto, ${falada.length} faladas${repetiu ? " (REPETIU)" : ""}`);
  if (falada.length) {
    const alinhado = alinharTempos({ cenas: roteiro.cenas.map((x) => ({ ...x, inicio: undefined, fim: undefined, elementos: x.elementos.map((e) => ({ ...e, t: undefined })) })) }, falada, v.narracaoSeg);
    await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(alinhado) } });
  }
  return { ok: true as const, sincronizado: falada.length > 0, repetiu, palavrasFaladas: falada.length, palavrasTexto };
}

// ---------- 3b. duração (DURACAO: até 55s) ----------
// A voz saiu fora do tempo: a Bia reescreve SÓ as falas (mesmas cenas, fotos e figurinhas), mirando
// o número de palavras que dá ~32s nessa voz. Depois a tela gera a voz de novo.
// Fala "enchida" pela IA: o mesmo trecho de 3 palavras aparece 2x, ou termina numa lista de
// palavras soltas ("grátis, parcelamento, recreação, primeiros, WhatsApp.").
function falaRepetitiva(fala: string): boolean {
  const p = fala.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const vistos = new Set<string>();
  for (let i = 0; i + 2 < p.length; i++) {
    const tri = p.slice(i, i + 3).join(" ");
    if (vistos.has(tri)) return true;
    vistos.add(tri);
  }
  const pedacos = fala.split(/[,.!?;]/).map((x) => x.trim()).filter(Boolean);
  let soltos = 0;
  for (const x of pedacos) { soltos = x.split(/\s+/).length <= 1 ? soltos + 1 : 0; if (soltos >= 4) return true; }
  return false;
}

export async function ajustarTamanhoRoteiro(videoId: string, segundosAtuais: number) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const roteiro = lerRoteiro(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Sem roteiro pra ajustar." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const oferta = lerOferta(v.colagemOferta);
  const atuais = roteiro.cenas.reduce((s, x) => s + contarPalavras(x.narracao), 0);
  // pela velocidade REAL da voz (voz lenta = menos palavras). Alongar: no máximo +12 palavras por
  // rodada (pedir muito a mais fazia a IA encher de palavras soltas e frases repetidas).
  const pelaVoz = Math.round((atuais * DURACAO.ideal) / Math.max(10, segundosAtuais));
  const alvo = Math.max(50, Math.min(130, atuais + 12, pelaVoz));
  // meta POR CENA (a IA acerta muito melhor um número por cena do que um total)
  const fator = alvo / Math.max(1, atuais);
  const metaDa = (x: { narracao: string }) => Math.max(4, Math.round(contarPalavras(x.narracao) * fator));
  const cenasTxt = roteiro.cenas.map((x, i) => `${i + 1}. [${x.ato}] (hoje ${contarPalavras(x.narracao)} palavras → escreva ${metaDa(x)}) "${x.narracao}" — palavras que precisam continuar na fala: ${[...new Set(x.elementos.map((e) => e.gatilho).filter(Boolean))].join(", ")}`).join("\n");
  for (let tentativa = 1; tentativa <= 2; tentativa++) try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        temperature: 0.5,
        messages: [
          { role: "system", content: `Você ajusta o TAMANHO da narração de um vídeo-anúncio de buffet infantil, sem mudar a estrutura. Reescreva cada fala pra que o TOTAL tenha ${alvo} palavras (hoje tem ${atuais}), seguindo a META de palavras de CADA cena (está na lista). Conte as palavras de cada fala antes de responder. Mantenha o sentido, o tom informal, "você" (nunca "cê"), os números da oferta EXATOS (${oferta.principal}${oferta.extras.length ? "; " + oferta.extras.join("; ") : ""}${oferta.prazo ? "; prazo até " + prazoCurto(oferta.prazo) + ", falado por extenso" : ""}) e, em cada cena, as palavras listadas (elas disparam as figurinhas) — encaixadas em frases naturais, NUNCA como lista de palavras soltas no fim. Proibido repetir frase ou ideia já dita; cada fala tem que soar como gente falando. Responda só com JSON: {"narracoes":["fala da cena 1","fala da cena 2",...]} — uma por cena, na mesma ordem.` },
          { role: "user", content: cenasTxt },
        ],
      }),
      signal: AbortSignal.timeout(25000), // 2 tentativas cabem nos 60s do site
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { narracoes?: string[] };
    if (!Array.isArray(j.narracoes) || j.narracoes.length !== roteiro.cenas.length) throw new Error("resposta fora do formato");
    const ruim = j.narracoes.map(String).find(falaRepetitiva);
    if (ruim) throw new Error(`fala repetitiva: ${ruim.slice(0, 80)}`);
    const novas = j.narracoes.reduce((s2, x) => s2 + contarPalavras(String(x)), 0);
    // aceita se chegou perto do alvo OU se ao menos encurtou bem (a próxima rodada termina o serviço)
    if (novas > alvo + 6 && !(alvo < atuais && novas <= atuais - 5)) throw new Error(`ficou com ${novas} palavras (alvo ${alvo})`);
    const cenasNovas = roteiro.cenas.map((x, i) => ({ ...x, narracao: String(j.narracoes![i] || x.narracao).trim(), inicio: undefined, fim: undefined, elementos: x.elementos.map((e) => ({ ...e, t: undefined })) }));
    // roteiro de MOLDES: o layout não muda (gatilho que sumir da fala cai no tempo do molde)
    const novo = roteiro.cenas[0]?.molde ? { ...roteiro, cenas: cenasNovas } : completarCenas(garantirOferta({ cenas: cenasNovas }, oferta));
    await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(novo), narracaoTexto: narracaoCompleta(novo) } });
    return { ok: true as const, roteiro: novo, palavras: novo.cenas.reduce((s, x) => s + contarPalavras(x.narracao), 0) };
  } catch (e) {
    console.error(`Erro ao ajustar o tamanho do roteiro (tentativa ${tentativa}):`, e);
  }
  return { ok: false as const, erro: "Não consegui ajustar o tamanho da fala agora." };
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
  // Teto de 55s: voz mais longa → gerar de novo (a Bia encurta o texto), nunca esticar o vídeo.
  if (v.narracaoSeg > DURACAO.max + 0.4) return { ok: false as const, erro: `A voz ficou com ${v.narracaoSeg}s e o vídeo tem teto de ${DURACAO.max + 1}s (voz + respiro final). Clique em "Gerar voz de novo" — a Bia encurta o texto.` };

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
