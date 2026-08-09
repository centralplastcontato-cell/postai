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
// Se o dono DESCREVER o mascote (descricao), gera 3 versões da IDEIA dele (variando a pose);
// senão, sorteia 3 conceitos temáticos do castelo (a IA "sugere opções").
export async function gerarMascote(marcaId: string, descricao?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { corPrimaria: true, nome: true, mascotesArte: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const cor = marca.corPrimaria || "#7C3AED";
  const nome = marca.nome || "buffet infantil";
  const custom = (descricao || "").trim().slice(0, 400);

  const montarPrompt = (conceito: string, pose: string) =>
    `Mascote de personagem em estilo 3D FOFO (render 3D caprichado estilo Pixar), redondinho, simpático e carismático, para um buffet infantil chamado "${nome}". O mascote é: ${conceito}. Cores vibrantes e alegres harmonizando com a cor ${cor}. CORPO INTEIRO, de frente, ${pose}, expressão feliz, olhando para a câmera. Iluminação suave de estúdio. FUNDO TOTALMENTE TRANSPARENTE (sem cenário, sem chão, sem sombra projetada no chão). SEM texto, letras, números, logotipos ou molduras.`;

  // Descrição do dono → 3 versões da mesma ideia (varia a pose). Sem descrição → 3 conceitos.
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
    const blob = await put(`${marcaId}/mascote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`, Buffer.from(b64, "base64"), { access: "public", contentType: "image/png" });
    return blob.url;
  };

  let urls: string[] = [];
  try {
    const results = await Promise.allSettled(prompts.map(gerarUm));
    urls = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
  } catch (e) {
    console.error("Erro ao gerar mascote:", e);
  }
  if (!urls.length) return { ok: false as const, erro: "A IA não conseguiu gerar o mascote agora. Tente de novo." };

  const mascotes = [...urls, ...lerListaUrls(marca.mascotesArte).filter((u) => !urls.includes(u))].slice(0, 24);
  await prisma.marca.update({ where: { id: marcaId }, data: { mascotesArte: JSON.stringify(mascotes) } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, urls, mascotes };
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

// Tira o mascote oficial (deixa a marca sem mascote ativo) — a biblioteca de opções fica salva.
export async function removerMascote(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteUrl: "" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}
