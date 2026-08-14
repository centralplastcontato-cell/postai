"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { criarContainerReels, criarContainerStoryVideo, statusContainerReels, publicarContainerReels } from "@/lib/instagram";

// ESTÚDIO DO MASCOTE (Fase 1): gera opções de mascote em 3D fofo com FUNDO TRANSPARENTE
// (PNG), pra depois "colar" o MESMO mascote nos posts/vídeos e ele ficar sempre idêntico.
// A base 2D bem definida também é a referência pra fazer o 3D depois (vender nas festas).

function lerListaUrls(json: string | null): string[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && x.startsWith("http")) : [];
  } catch { return []; }
}

// Conceitos temáticos do castelo/buffet — a IA "sugere várias opções" sorteando destes.
const CONCEITOS = [
  "um reizinho/príncipe criança fofo, com coroa dourada e capinha vermelha, bochechas rosadas",
  "um dragãozinho amigável e redondo, escamas coloridas, guardião do castelo, sorriso simpático",
  "um cavaleirinho fofo de capacete com pluma e um escudo pequeno, corajoso e simpático",
  "um castelo mágico ANTROPOMÓRFICO (castelo andante) com bracinhos, perninhas, olhos grandes e um grande sorriso",
  "um leãozinho rei fofo com juba redondinha e coroa, expressão alegre",
  "uma corujinha sábia e fofa com um chapéu de mago com estrelas, olhos grandes",
];

function sortear3(): string[] {
  const c = [...CONCEITOS];
  // embaralha (Fisher-Yates) — server action, Math.random é permitido aqui
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, 3);
}

// Poses pra variar quando o dono descreve o mascote — 3 versões do MESMO personagem.
const POSES = [
  "pose amigável acenando com uma das mãos",
  "com os dois bracinhos abertos, dando boas-vindas",
  "fazendo joinha (positivo) e piscando o olho",
];

// Gera 3 opções de mascote em PARALELO (cabe na janela de 60s) e salva na biblioteca da marca.
// - Com IMAGEM de referência: a IA cria o mascote BASEADO nela (edição a partir de imagem).
// - Só com DESCRIÇÃO: 3 versões da ideia do dono (variando a pose).
// - Sem nada: sorteia 3 conceitos temáticos do castelo (a IA "sugere opções").
export async function gerarMascote(marcaId: string, descricao?: string, referenciaUrl?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { corPrimaria: true, nome: true, mascotesArte: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const cor = marca.corPrimaria || "#7C3AED";
  const nome = marca.nome || "buffet infantil";
  const custom = (descricao || "").trim().slice(0, 400);
  const ref = (referenciaUrl || "").trim();

  const salvar = async (b64: string): Promise<string> => {
    const blob = await put(`${marcaId}/mascote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`, Buffer.from(b64, "base64"), { access: "public", contentType: "image/png" });
    return blob.url;
  };

  let urls: string[] = [];
  try {
    if (ref) {
      // COM REFERÊNCIA: baixa a imagem 1x e gera 3 versões via /images/edits (baseadas nela).
      const rr = await fetch(ref, { signal: AbortSignal.timeout(20000) });
      if (!rr.ok) return { ok: false as const, erro: "Não consegui baixar a imagem de referência. Tente enviar de novo." };
      const ctype = rr.headers.get("content-type") || "image/png";
      const buf = Buffer.from(await rr.arrayBuffer());
      const promptRef = (pose: string) =>
        `Crie um MASCOTE 3D FOFO (render 3D caprichado estilo Pixar), redondinho e carismático, para o buffet infantil "${nome}", FIEL à imagem de referência enviada: MANTENHA o MESMO esquema de CORES, o mesmo formato e os elementos marcantes dela (NÃO troque as cores da referência). Apenas dê um acabamento 3D bem fofo e simpático.${custom ? ` Ajustes pedidos: ${custom}.` : ""} CORPO INTEIRO, de frente, ${pose}, expressão feliz. FUNDO TOTALMENTE TRANSPARENTE (sem cenário, sem chão, sem sombra projetada). SEM texto, letras, números, logotipos ou molduras.`;
      const gerarUmRef = async (pose: string): Promise<string> => {
        const form = new FormData();
        form.append("model", "gpt-image-1");
        form.append("prompt", promptRef(pose));
        form.append("size", "1024x1536");
        form.append("quality", "medium");
        form.append("background", "transparent");
        form.append("image", new Blob([buf], { type: ctype }), "referencia.png");
        const resp = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(55000) });
        if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
        const data = await resp.json();
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error("sem imagem");
        return salvar(b64);
      };
      const results = await Promise.allSettled(POSES.map(gerarUmRef));
      urls = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    } else {
      // SEM REFERÊNCIA: geração por texto (descrição do dono ou conceitos sorteados).
      const montarPrompt = (conceito: string, pose: string) =>
        `Mascote de personagem em estilo 3D FOFO (render 3D caprichado estilo Pixar), redondinho, simpático e carismático, para um buffet infantil chamado "${nome}". O mascote é: ${conceito}. Cores vibrantes e alegres harmonizando com a cor ${cor}. CORPO INTEIRO, de frente, ${pose}, expressão feliz, olhando para a câmera. Iluminação suave de estúdio. FUNDO TOTALMENTE TRANSPARENTE (sem cenário, sem chão, sem sombra projetada no chão). SEM texto, letras, números, logotipos ou molduras.`;
      const prompts = custom
        ? POSES.map((pose) => montarPrompt(custom, pose))
        : sortear3().map((c) => montarPrompt(c, "pose amigável acenando"));
      const gerarUm = async (prompt: string): Promise<string> => {
        const resp = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1536", quality: "medium", background: "transparent" }),
          signal: AbortSignal.timeout(55000),
        });
        if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
        const data = await resp.json();
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error("sem imagem");
        return salvar(b64);
      };
      const results = await Promise.allSettled(prompts.map(gerarUm));
      urls = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
    }
  } catch (e) {
    console.error("Erro ao gerar mascote:", e);
  }
  if (!urls.length) return { ok: false as const, erro: "A IA não conseguiu gerar o mascote agora. Tente de novo." };

  // Acumula na biblioteca (novas na frente, sem repetir). Limite alto (60) pra o dono poder
  // experimentar bastante sem perder as primeiras opções que gostou.
  const mascotes = [...urls, ...lerListaUrls(marca.mascotesArte).filter((u) => !urls.includes(u))].slice(0, 60);
  await prisma.marca.update({ where: { id: marcaId }, data: { mascotesArte: JSON.stringify(mascotes) } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, urls, mascotes };
}

// Usa uma IMAGEM ENVIADA pelo dono (upload) direto como mascote — sem a IA recriar. Salva na
// biblioteca e já marca como oficial. Pro dono que já tem a arte pronta do mascote dele.
export async function usarImagemComoMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!/^https?:\/\//.test(url)) return { ok: false as const, erro: "Imagem inválida." };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascotesArte: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const mascotes = [url, ...lerListaUrls(marca.mascotesArte).filter((u) => u !== url)].slice(0, 60);
  await prisma.marca.update({ where: { id: marcaId }, data: { mascotesArte: JSON.stringify(mascotes), mascoteUrl: url } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, url, mascotes };
}

// Tira o FUNDO da imagem do mascote (deixa transparente), mantendo o personagem fiel — pra ele
// colar limpo nos posts/vídeos (sem o quadradão branco). Usa /images/edits com background
// transparent + apara as bordas. Salva a versão nova e ja marca como oficial.
export async function removerFundoMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!/^https?:\/\//.test(url)) return { ok: false as const, erro: "Imagem inválida." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascotesArte: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  try {
    const rr = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!rr.ok) return { ok: false as const, erro: "Não consegui baixar a imagem." };
    const ctype = rr.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await rr.arrayBuffer());
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", "Deixe o FUNDO 100% TRANSPARENTE, removendo qualquer fundo (branco ou colorido) atrás do personagem. MANTENHA o personagem/mascote EXATAMENTE como está — as MESMAS cores, o mesmo formato, a mesma bandeira, as mesmas letras e todos os detalhes idênticos. Não redesenhe, não altere, não invente nada; APENAS remova o fundo.");
    form.append("size", "1024x1536");
    form.append("quality", "high");
    form.append("background", "transparent");
    form.append("image", new Blob([buf], { type: ctype }), "mascote.png");
    const resp = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(55000) });
    if (!resp.ok) return { ok: false as const, erro: `A IA não respondeu agora (${resp.status}). Tente de novo.` };
    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false as const, erro: "A IA não devolveu a imagem. Tente de novo." };
    let png = Buffer.from(b64, "base64");
    try { const sharp = (await import("sharp")).default; png = Buffer.from(await sharp(png).trim({ threshold: 10 }).png().toBuffer()); } catch (e) { console.error("Não consegui aparar o mascote:", e); }
    const blob = await put(`${marcaId}/mascote-transp-${Date.now()}.png`, png, { access: "public", contentType: "image/png" });
    const mascotes = [blob.url, ...lerListaUrls(marca.mascotesArte).filter((u) => u !== blob.url)].slice(0, 60);
    await prisma.marca.update({ where: { id: marcaId }, data: { mascotesArte: JSON.stringify(mascotes), mascoteUrl: blob.url } });
    revalidatePath(`/painel/marcas/${marcaId}`);
    return { ok: true as const, url: blob.url, mascotes };
  } catch (e) {
    console.error("Erro ao remover fundo do mascote:", e);
    return { ok: false as const, erro: "Não consegui remover o fundo agora. Tente de novo." };
  }
}

// FASE 4 — FICHA PRO 3D: a partir do mascote oficial, gera uma PRANCHA DE REFERÊNCIA com as
// vistas de FRENTE, LADO e COSTAS (turnaround), fundo claro, alta qualidade. É o material que
// um artista/serviço de 3D usa pra modelar o mascote (pra vender nas festas).
export async function gerarFicha3d(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteUrl: true, nome: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.mascoteUrl) return { ok: false as const, erro: "Escolha o mascote oficial primeiro." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  try {
    const rr = await fetch(marca.mascoteUrl, { signal: AbortSignal.timeout(20000) });
    if (!rr.ok) return { ok: false as const, erro: "Não consegui baixar o mascote." };
    const ctype = rr.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await rr.arrayBuffer());

    // UMA imagem só com as 3 vistas (turnaround). Assim a IA desenha a BANDEIRA/COROA uma
    // única vez e repete igual nas três — é o único jeito de ficarem CONSISTENTES (gerar
    // separado sempre variava). Pra não cortar: figuras pequenas, braços rentes e muita margem.
    const prompt = "Prancha de referência (model sheet / turnaround) do MESMO personagem da imagem, para modelagem 3D, em UMA ÚNICA imagem. Mostre o personagem em TRÊS vistas lado a lado, na mesma escala e alinhadas pela base: 1) FRENTE, 2) LADO (perfil), 3) COSTAS. É EXATAMENTE O MESMO personagem nas três vistas — a MESMA bandeirinha branca com a MESMA coroa verde simples (sem texto, sem letras), IDÊNTICA nas três. IMPORTANTE pra caber sem cortar: desenhe as figuras PEQUENAS, com MUITO espaço vazio/margem entre elas e nas bordas (principalmente uma margem GENEROSA no TOPO, acima das bandeiras), e com os BRAÇOS RELAXADOS RENTES AO CORPO (não esticados para os lados). A bandeirinha no alto do mastro tem que aparecer INTEIRA e LIVRE — NENHUMA mão, braço, luva ou dedo pode tocar, sobrepor ou cobrir a bandeira; as mãos ficam bem embaixo, ao lado do corpo. ENQUADRAMENTO: centralize o conjunto das três figuras no meio da imagem, com a MESMA margem vazia à ESQUERDA e à DIREITA (simétrico), e deixe folga suficiente nas laterais pra que as mãos/luvas das figuras das pontas apareçam INTEIRAS, sem encostar nem cortar nas bordas. Mostre cada figura INTEIRA — bandeira, mãos e pés — sem CORTAR nada. Estilo 3D fofo idêntico à referência, mesmas cores e proporções. Fundo cinza-claro liso de estúdio, iluminação uniforme. Sem legendas, sem números, sem molduras.";
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1536x1024");
    form.append("quality", "medium");
    form.append("image", new Blob([buf], { type: ctype }), "mascote.png");
    const resp = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(55000) });
    if (!resp.ok) return { ok: false as const, erro: `A IA não respondeu agora (${resp.status}). Tente de novo.` };
    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false as const, erro: "A IA não devolveu a ficha. Tente de novo." };
    const blob = await put(`${marcaId}/mascote-ficha3d-${Date.now()}.png`, Buffer.from(b64, "base64"), { access: "public", contentType: "image/png" });
    await prisma.marca.update({ where: { id: marcaId }, data: { mascoteFicha3d: JSON.stringify([blob.url]) } });
    revalidatePath(`/painel/marcas/${marcaId}`);
    return { ok: true as const, urls: [blob.url] };
  } catch (e) {
    console.error("Erro ao gerar ficha 3D:", e);
    return { ok: false as const, erro: "Não consegui gerar a ficha agora. Tente de novo." };
  }
}

// Define o mascote OFICIAL da marca (tem que estar na biblioteca de opções geradas).
export async function definirMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascotesArte: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!lerListaUrls(marca.mascotesArte).includes(url)) return { ok: false as const, erro: "Esse mascote não está na sua biblioteca." };
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteUrl: url } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, url };
}

// Exclui UMA opção da biblioteca de mascotes (a que o dono não gostou). Se for a oficial,
// também desativa o mascote oficial. Apaga o arquivo do Blob pra liberar espaço (best-effort).
export async function excluirMascoteArte(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascotesArte: true, mascoteUrl: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const restantes = lerListaUrls(marca.mascotesArte).filter((u) => u !== url);
  const data: { mascotesArte: string; mascoteUrl?: string } = { mascotesArte: JSON.stringify(restantes) };
  if (marca.mascoteUrl === url) data.mascoteUrl = ""; // era a oficial → desativa
  await prisma.marca.update({ where: { id: marcaId }, data });
  try { const { del } = await import("@vercel/blob"); await del(url); } catch {} // libera espaço
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, mascotes: restantes };
}

// Tira o mascote oficial (deixa a marca sem mascote ativo) — a biblioteca de opções fica salva.
export async function removerMascote(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteUrl: "" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// DAR VIDA AO MASCOTE (Fase 5): anima o mascote com IA de vídeo (image-to-video da OpenAI/Sora).
// Pega o mascote OFICIAL como referência + uma descrição do que ele faz e devolve um CLIPE de ~4s
// (9:16), pra usar de abertura/fecho dos Reels. É em 2 fases (a IA leva 1-2 min): 1) inicia o job
// e devolve o id; 2) a tela consulta até ficar pronto, aí baixamos o MP4 e guardamos no Blob.
// ─────────────────────────────────────────────────────────────────────────────
const CLIPE_MODELO = process.env.OPENAI_VIDEO_MODEL || "sora-2"; // dá pra trocar por env sem mexer no código

// Monta a imagem de PARTIDA do vídeo: o mascote centralizado num quadro 720x1280 (9:16) sobre a cor
// da marca. A IA de vídeo aceita melhor uma referência já no tamanho/proporção do vídeo final.
async function quadroPartidaMascote(mascotePng: Buffer, cor: string): Promise<Buffer> {
  const fundo = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#7C3AED";
  const personagem = await sharp(mascotePng).resize(560, 940, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
  return sharp({ create: { width: 720, height: 1280, channels: 4, background: fundo } })
    .composite([{ input: personagem, gravity: "center" }])
    .png()
    .toBuffer();
}

// FASE 1 — inicia a geração do clipe e devolve o id do job (rápido).
export async function gerarClipeMascote(marcaId: string, descricao?: string, segundos?: number) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteUrl: true, corPrimaria: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.mascoteUrl) return { ok: false as const, erro: "Escolha o mascote oficial primeiro." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const dur = [4, 8, 12].includes(segundos ?? 0) ? String(segundos) : "8"; // padrão 8s
  try {
    const rr = await fetch(marca.mascoteUrl, { signal: AbortSignal.timeout(20000) });
    if (!rr.ok) return { ok: false as const, erro: "Não consegui baixar o mascote." };
    const buf = Buffer.from(await rr.arrayBuffer());
    const partida = await quadroPartidaMascote(buf, marca.corPrimaria || "#7C3AED");

    const acao = (descricao || "").trim().slice(0, 400) || "acenando feliz, dando boas-vindas, com um sorriso alegre";
    const prompt = `O MESMO personagem mascote da imagem de referência, ${acao}. Animação 3D fofa e alegre, movimento suave e natural, mantendo EXATAMENTE o mesmo desenho, as mesmas cores e as mesmas proporções do personagem da imagem. Câmera parada, personagem centralizado. Vídeo vertical 9:16. Sem texto, sem legendas na imagem. ÁUDIO: uma MÚSICA instrumental alegre, animada e cativante de fundo (clima festivo de buffet infantil), com efeitos sonoros fofos e divertidos combinando com o movimento. NINGUÉM falando, sem narração e sem voz humana — só a música e os efeitos.`;

    const form = new FormData();
    form.append("model", CLIPE_MODELO);
    form.append("prompt", prompt);
    form.append("seconds", dur);
    form.append("size", "720x1280");
    form.append("input_reference", new Blob([new Uint8Array(partida)], { type: "image/png" }), "partida.png");

    const resp = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(50000),
    });
    if (!resp.ok) {
      const txt = (await resp.text()).slice(0, 300);
      return { ok: false as const, erro: `A IA de vídeo não aceitou (${resp.status}). ${txt}` };
    }
    const data = await resp.json();
    if (!data?.id) return { ok: false as const, erro: "A IA não devolveu o id do vídeo." };
    return { ok: true as const, jobId: String(data.id) };
  } catch (e) {
    console.error("Erro ao iniciar o clipe do mascote:", e);
    return { ok: false as const, erro: "Não consegui iniciar o clipe agora." };
  }
}

// FASE 2 — a tela consulta de tempos em tempos. Enquanto processa → { pronto:false }. Quando fica
// pronto, baixa o MP4, guarda no Blob e adiciona na galeria de clipes da marca.
export async function statusClipeMascote(marcaId: string, jobId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  try {
    const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { ok: false as const, erro: `Não consegui checar o vídeo (${r.status}).` };
    const j = await r.json();
    const st = String(j?.status || "");
    if (st === "failed" || st === "error") return { ok: false as const, erro: j?.error?.message || "A IA não conseguiu gerar o vídeo." };
    if (st !== "completed") return { ok: true as const, pronto: false as const, progresso: typeof j?.progress === "number" ? j.progress : null };

    // pronto → baixa o conteúdo (MP4) e guarda no nosso Blob.
    const cont = await fetch(`https://api.openai.com/v1/videos/${jobId}/content`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(55000),
    });
    if (!cont.ok) return { ok: false as const, erro: "Não consegui baixar o clipe pronto." };
    const bytes = Buffer.from(await cont.arrayBuffer());
    const blob = await put(`${marcaId}/mascote-clipe-${Date.now()}.mp4`, bytes, { access: "public", contentType: "video/mp4" });

    const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
    const novos = [blob.url, ...lerListaUrls(marca?.mascoteClipes ?? "[]")].slice(0, 30);
    await prisma.marca.update({ where: { id: marcaId }, data: { mascoteClipes: JSON.stringify(novos) } });
    revalidatePath(`/painel/marcas/${marcaId}`);
    return { ok: true as const, pronto: true as const, url: blob.url };
  } catch (e) {
    console.error("Erro ao finalizar o clipe do mascote:", e);
    return { ok: false as const, erro: "Não consegui finalizar o clipe." };
  }
}

// Apaga um clipe da galeria (e libera o espaço no Blob).
export async function excluirClipeMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
  const restantes = lerListaUrls(marca?.mascoteClipes ?? "[]").filter((u) => u !== url);
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteClipes: JSON.stringify(restantes) } });
  try { const { del } = await import("@vercel/blob"); await del(url); } catch {}
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, clipes: restantes };
}

// ── POSTAR O CLIPE do mascote direto no Instagram (Reels ou Story), em 2 fases (o vídeo processa na
// Meta, ~1min) — igual o "Postar agora" dos Reels. FASE 1 cria o container; a tela consulta a FASE 2.
export async function prepararPostClipe(marcaId: string, url: string, tipo: "reels" | "story") {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { igUserId: true, accessToken: true, nome: true, mascoteClipes: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.igUserId || !marca.accessToken) return { ok: false as const, erro: "A marca não está conectada ao Instagram." };
  if (!url.startsWith("http") || !lerListaUrls(marca.mascoteClipes).includes(url)) return { ok: false as const, erro: "Clipe não encontrado." };
  const conn = { igUserId: marca.igUserId, accessToken: marca.accessToken };
  const c = tipo === "story"
    ? await criarContainerStoryVideo(conn, url)
    : await criarContainerReels(conn, url, `${marca.nome} 🏰`);
  if (!c.ok) return { ok: false as const, erro: c.erro };
  return { ok: true as const, containerId: c.containerId };
}

export async function concluirPostClipe(marcaId: string, containerId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { igUserId: true, accessToken: true } });
  if (!marca?.igUserId || !marca.accessToken) return { ok: false as const, erro: "A marca não está conectada ao Instagram." };
  const conn = { igUserId: marca.igUserId, accessToken: marca.accessToken };
  const st = await statusContainerReels(conn, containerId);
  if (st === "IN_PROGRESS" || st === "UNKNOWN") return { ok: true as const, pronto: false as const };
  if (st === "ERROR" || st === "EXPIRED") return { ok: false as const, erro: `A Meta não conseguiu processar o vídeo (${st}). Tente de novo.` };
  const r = await publicarContainerReels(conn, containerId);
  if (!r.ok) return { ok: false as const, erro: r.erro };
  return { ok: true as const, pronto: true as const, permalink: r.permalink };
}
