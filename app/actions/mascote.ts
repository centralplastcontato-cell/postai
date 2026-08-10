"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";

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
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", "Prancha de referência (model sheet / turnaround) do MESMO personagem da imagem, para modelagem 3D. Mostre o personagem de CORPO INTEIRO em TRÊS vistas EMPILHADAS uma EMBAIXO da outra (em COLUNA), na mesma escala e centralizadas: de cima para baixo — 1) VISTA DE FRENTE, 2) VISTA DE LADO (perfil), 3) VISTA DE COSTAS. MANTENHA TODOS os elementos do personagem IDÊNTICOS à referência, INCLUSIVE a BANDEIRINHA no topo (mantenha a bandeira nas três vistas; o texto dela não precisa ficar legível). MUITO IMPORTANTE: deixe MARGEM em volta de cada vista e mostre o personagem INTEIRO — do TOPO (a bandeira) até os PÉS, com as MÃOS e os braços completos — sem CORTAR nenhuma parte (nem as mãos, nem as laterais, nem o topo, nem os pés). Pose neutra em pé (T-pose leve), proporções e cores iguais nas três vistas, mesmo estilo 3D fofo. Fundo cinza-claro liso de estúdio, iluminação uniforme, alto nível de detalhe. Sem legendas, sem números, sem molduras ao redor.");
    form.append("size", "1024x1536");
    // "medium" (não "high") pra caber no limite de 60s da função — a ficha é referência pra
    // o 3D (não precisa de render final), e dá pra gerar de novo se quiser.
    form.append("quality", "medium");
    form.append("image", new Blob([buf], { type: ctype }), "mascote.png");
    const resp = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(55000) });
    if (!resp.ok) return { ok: false as const, erro: `A IA não respondeu agora (${resp.status}). Tente de novo.` };
    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false as const, erro: "A IA não devolveu a ficha. Tente de novo." };
    const blob = await put(`${marcaId}/mascote-ficha3d-${Date.now()}.png`, Buffer.from(b64, "base64"), { access: "public", contentType: "image/png" });
    await prisma.marca.update({ where: { id: marcaId }, data: { mascoteFicha3d: blob.url } });
    revalidatePath(`/painel/marcas/${marcaId}`);
    return { ok: true as const, url: blob.url };
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
