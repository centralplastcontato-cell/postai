"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { criarContainerReels, criarContainerStoryVideo, statusContainerReels, publicarContainerReels } from "@/lib/instagram";
import { modoClipe, cenaClipe } from "@/lib/mascote-modos";
import { emendarClipes } from "@/lib/video-engine";

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
// Define a VOZ do castelinho (o jeitão da voz nos clipes). Fica salva na marca e é usada em todo
// clipe com fala — dá uma personalidade de voz consistente. "" = volta pro padrão.
export async function definirVozMascote(marcaId: string, voz: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteVoz: (voz || "").trim().slice(0, 300) } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

// Embrulha PCM cru (mono, 16-bit LE) num arquivo WAV. Se eu declarar um sampleRate MAIOR do que o
// real, o navegador toca mais rápido e mais AGUDO — é o efeito clássico de VOZ DE DESENHO ANIMADO
// (tipo esquilinho/personagem fofo). fator 1.0 = voz normal; 1.25 = bem cartoon.
function pcmParaWavAgudo(pcm: Buffer, sampleRateReal: number, fator: number): Buffer {
  const sr = Math.round(sampleRateReal * fator); // "engana" o player → sobe o tom
  const header = Buffer.alloc(44);
  const dataLen = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // tamanho do bloco fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 1 canal (mono)
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28); // byteRate = sr * canais * (bits/8)
  header.writeUInt16LE(2, 32); // blockAlign = canais * (bits/8)
  header.writeUInt16LE(16, 34); // bits por amostra
  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

// AMOSTRA da voz: gera um audiozinho pra o dono OUVIR a voz do mascote ANTES de gerar o vídeo.
// Usa o MESMO motor de voz dos vídeos do buffet (Google Gemini-TTS) — o que soa BEM e obedece a
// DIREÇÃO de voz (é isso que tira o tom robótico). Por cima, dá pra subir o TOM (`agudo`) pra
// aquele jeitão de personagem de DESENHO ANIMADO.
// OBS: o vídeo final é gerado pela IA de vídeo (Sora), que cria a voz dela — pode soar diferente.
export async function ouvirAmostraVoz(marcaId: string, vozId: string, direcao: string, frase?: string, agudo?: number) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const texto = (frase || "").trim().slice(0, 200) || "Oi! Venha comemorar a festa do seu filho aqui no nosso castelo!";
  // fator do tom (quanto sobe o agudo). 1.0 = natural; padrão 1.15 (desenho). Limita pra não virar chiado.
  const fator = Math.min(1.4, Math.max(1.0, typeof agudo === "number" && isFinite(agudo) ? agudo : 1.15));
  try {
    const { amostraVozPcm, TAXA_VOZ } = await import("@/lib/narracao");
    const int16 = await amostraVozPcm(texto, (vozId || "").trim(), (direcao || "").trim());
    const pcm = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength); // Int16 → bytes LE
    const wav = pcmParaWavAgudo(pcm, TAXA_VOZ, fator);
    return { ok: true as const, audio: `data:audio/wav;base64,${wav.toString("base64")}` };
  } catch (e) {
    console.error("Erro na amostra de voz do mascote:", e);
    return { ok: false as const, erro: "Não consegui gerar a amostra agora. Tente de novo." };
  }
}

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

// Monta a imagem de PARTIDA do vídeo (720x1280, 9:16): o mascote sobre um fundo — uma COR sólida
// OU uma FOTO do buffet (cover-crop). A IA de vídeo aceita melhor uma referência já no tamanho final.
async function quadroPartidaMascote(mascotePng: Buffer, fundo: { cor: string } | { foto: Buffer }): Promise<Buffer> {
  if ("foto" in fundo) {
    // Fundo = foto do espaço. O mascote fica MENOR e mais pra baixo (como se estivesse no cenário).
    const base = await sharp(fundo.foto).resize(720, 1280, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
    const personagem = await sharp(mascotePng).resize(460, 760, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(personagem).metadata();
    const left = Math.round((720 - (meta.width || 460)) / 2);
    const top = Math.round(1280 - (meta.height || 760) - 90); // ~90px de margem embaixo
    return sharp(base).composite([{ input: personagem, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
  }
  const cor = /^#[0-9a-fA-F]{6}$/.test(fundo.cor) ? fundo.cor : "#FFFFFF";
  const personagem = await sharp(mascotePng).resize(560, 940, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: 720, height: 1280, channels: 4, background: cor } })
    .composite([{ input: personagem, gravity: "center" }])
    .png()
    .toBuffer();
}

// FASE 1 — inicia a geração do clipe e devolve o id do job (rápido).
// opts.modo: historia | divulgacao | abertura | fecho | livre (papel/roteiro/uso do clipe).
// opts.cena: id de um cenário curado (CENAS_CLIPE) — sempre "buffet infantil" e consistente. A FOTO
// do buffet (fundoFotoUrl), se houver, tem prioridade (é o cenário mais compatível de todos).
export async function gerarClipeMascote(marcaId: string, opts: { modo?: string; descricao?: string; segundos?: number; fundo?: string; fundoFotoUrl?: string; fala?: string; cena?: string } = {}) {
  const { descricao, segundos, fundo, fundoFotoUrl, fala, cena } = opts;
  const modo = modoClipe(opts.modo || "livre");
  const cenaSel = cena ? cenaClipe(cena) : null;
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteUrl: true, corPrimaria: true, mascoteVoz: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.mascoteUrl) return { ok: false as const, erro: "Escolha o mascote oficial primeiro." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const dur = [4, 8, 12].includes(segundos ?? 0) ? String(segundos) : String(modo.seg); // padrão = o do modo
  // Cor do fundo escolhida pelo dono (hex). Sem escolha → branco (limpo, o mascote azul se destaca).
  const corFundo = /^#[0-9a-fA-F]{6}$/.test(fundo || "") ? (fundo as string) : "#FFFFFF";

  // Fundo = FOTO do buffet: só vale se a foto for da marca e DIVULGÁVEL (LGPD — solta ou de festa
  // autorizada). Baixa a foto pra virar o cenário de partida.
  let fotoFundoBuf: Buffer | null = null;
  if (fundoFotoUrl && fundoFotoUrl.startsWith("http")) {
    const foto = await prisma.imagemMarca.findFirst({ where: { url: fundoFotoUrl, marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] }, select: { url: true } });
    if (!foto) return { ok: false as const, erro: "Essa foto não pode ser usada (não é do seu acervo autorizado)." };
    try {
      const fr = await fetch(fundoFotoUrl, { signal: AbortSignal.timeout(20000) });
      if (fr.ok) fotoFundoBuf = Buffer.from(await fr.arrayBuffer());
    } catch {}
    if (!fotoFundoBuf) return { ok: false as const, erro: "Não consegui baixar a foto do fundo. Tente outra." };
  }

  try {
    const rr = await fetch(marca.mascoteUrl, { signal: AbortSignal.timeout(20000) });
    if (!rr.ok) return { ok: false as const, erro: "Não consegui baixar o mascote." };
    const buf = Buffer.from(await rr.arrayBuffer());
    const partida = await quadroPartidaMascote(buf, fotoFundoBuf ? { foto: fotoFundoBuf } : { cor: corFundo });

    const acao = (descricao || "").trim().slice(0, 400) || modo.acaoSugestao || "acenando feliz, dando boas-vindas, com um sorriso alegre";
    // Se o dono escreveu uma FALA, o mascote FALA (lip sync + voz de personagem fofo). Senão, só música.
    const falaTxt = (fala || "").trim().slice(0, 160);
    // Voz DEFINIDA do castelinho (o dono escolhe uma vez e fica salva) — dá personalidade consistente.
    const vozDesc = (marca.mascoteVoz || "").trim() || "de personagem de DESENHO ANIMADO estilo Disney/Pixar — MUITO expressiva, exagerada, teatral e cômica, cheia de emoção e energia, tom agudo e cantado (como um personagem clássico de filme de animação infantil)";
    const audio = falaTxt
      ? `ÁUDIO: o mascote FALA, em português do Brasil, com a BOCA sincronizada (lip sync), a frase: "${falaTxt}". Voz ${vozDesc}. A fala tem que estar CLARA e bem sincronizada com a boca. Uma musiquinha bem baixinha por trás, sem competir com a voz.`
      : `ÁUDIO: uma MÚSICA instrumental alegre, animada e cativante de fundo (clima festivo de buffet infantil), com efeitos sonoros fofos e divertidos combinando com o movimento. NINGUÉM falando, sem narração e sem voz humana — só a música e os efeitos.`;

    // TRAVA DE IDENTIDADE — vai em TODO clipe: o personagem é EXATAMENTE o da referência (mesma cara,
    // cores, coroa/bandeira, proporções). É o que mantém o castelinho consistente entre um vídeo e outro.
    const identidade = "O personagem é EXATAMENTE o mesmo da imagem de referência: mesmíssima cara, mesmas cores, mesma coroa/bandeira e acessórios, mesmas proporções e mesmo estilo 3D fofo. NÃO redesenhe o personagem, NÃO invente detalhes novos, NÃO mude as cores dele.";
    // PAPEL do clipe conforme o modo (o que ele está fazendo/comunicando).
    const papel: Record<string, string> = {
      historia: "É um clipe em que o mascote CONTA UMA HISTORINHA divertida pras crianças, com carisma e expressão.",
      divulgacao: "É um clipe de DIVULGAÇÃO: o mascote convida, animado, as famílias a agendarem uma festa no buffet.",
      abertura: "É a ABERTURA de um vídeo de festa: o mascote dá as boas-vindas de um jeito rápido, animado e chamativo.",
      fecho: "É o ENCERRAMENTO de um vídeo de festa: o mascote se despede com carinho e convida a agendar a festa.",
      livre: "",
    };
    const papelTxt = papel[modo.id] || "";
    // CENÁRIO — na ordem de compatibilidade: (1) FOTO REAL do buffet; (2) CENÁRIO CURADO (sempre
    // "buffet infantil", descrito igual sempre — nada aleatório); (3) COR SÓLIDA lisa.
    const cenarioTxt = fotoFundoBuf
      ? `CENÁRIO: o mascote está na frente do CENÁRIO REAL de buffet infantil que aparece no fundo da imagem de referência. MANTENHA esse cenário real coerente e sem distorcer; o mascote se movimenta de forma natural dentro dele, com um leve movimento de câmera acompanhando.`
      : cenaSel
        ? `CENÁRIO: o mascote está ${cenaSel.prompt}. Cenário em estilo desenho 3D infantil, caprichado, coerente e alegre (nada aleatório fora do clima de buffet infantil), com um leve movimento de câmera.`
        : `CENÁRIO: NÃO crie cenário. FUNDO em uma cor SÓLIDA, LISA e UNIFORME EXATAMENTE igual à da imagem de referência (${corFundo}) — não escureça, não coloque objetos nem gradiente. Câmera parada, personagem centralizado.`;

    const prompt = `${papelTxt} Anime o personagem mascote da imagem de referência: ele está ${acao}, com movimento suave, fofo e natural. ${identidade} ${cenarioTxt} Vídeo vertical 9:16, sem nenhum texto ou legenda na imagem. ${audio}`.replace(/\s+/g, " ").trim();

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
// salvarGaleria=false (usado nas CENAS de uma história): guarda o MP4 no Blob e devolve a URL, mas
// NÃO joga na galeria (as cenas soltas são temporárias — só a história emendada vai pra galeria).
export async function statusClipeMascote(marcaId: string, jobId: string, salvarGaleria = true) {
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

    if (salvarGaleria) {
      const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
      const novos = [blob.url, ...lerListaUrls(marca?.mascoteClipes ?? "[]")].slice(0, 30);
      await prisma.marca.update({ where: { id: marcaId }, data: { mascoteClipes: JSON.stringify(novos) } });
      revalidatePath(`/painel/marcas/${marcaId}`);
    }
    return { ok: true as const, pronto: true as const, url: blob.url };
  } catch (e) {
    console.error("Erro ao finalizar o clipe do mascote:", e);
    return { ok: false as const, erro: "Não consegui finalizar o clipe." };
  }
}

// Apaga um clipe da galeria (e libera o espaço no Blob). Se esse clipe estava definido como a
// ABERTURA ou o FECHO dos Reels, também tira essa marcação (senão apontaria pra um vídeo que sumiu).
export async function excluirClipeMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true, mascoteAbertura: true, mascoteFecho: true } });
  const restantes = lerListaUrls(marca?.mascoteClipes ?? "[]").filter((u) => u !== url);
  await prisma.marca.update({
    where: { id: marcaId },
    data: {
      mascoteClipes: JSON.stringify(restantes),
      ...(marca?.mascoteAbertura === url ? { mascoteAbertura: "" } : {}),
      ...(marca?.mascoteFecho === url ? { mascoteFecho: "" } : {}),
    },
  });
  try { const { del } = await import("@vercel/blob"); await del(url); } catch {}
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, clipes: restantes };
}

// Define (ou tira) qual clipe é a ABERTURA / o FECHO dos Reels das festas. url="" tira a marcação.
// O clipe precisa estar na galeria da marca (não dá pra apontar pra um vídeo de fora).
export async function definirAberturaMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
  const novo = url && lerListaUrls(marca?.mascoteClipes ?? "[]").includes(url) ? url : "";
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteAbertura: novo } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, abertura: novo };
}
export async function definirFechoMascote(marcaId: string, url: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
  const novo = url && lerListaUrls(marca?.mascoteClipes ?? "[]").includes(url) ? url : "";
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteFecho: novo } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, fecho: novo };
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRIA EM CENAS: a Bia escreve um roteiro dividido em CENAS (cada uma com o que o mascote FAZ e
// o que ele FALA). A tela gera um clipe por cena e, no fim, o motor EMENDA tudo num vídeo só — assim
// dá pra passar dos 12s do clipe único e contar uma historinha de verdade.
// ─────────────────────────────────────────────────────────────────────────────
export type CenaHistoria = { acao: string; fala: string };

// A Bia escreve as cenas a partir de um briefing curto do dono (ex: "o castelinho mostrando os
// brinquedos e chamando pra festa"). Devolve `numCenas` cenas, cada uma com ação + fala curta.
export async function escreverCenasHistoria(marcaId: string, briefing: string, numCenas: number): Promise<{ ok: true; cenas: CenaHistoria[] } | { ok: false; erro: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, erro: "OPENAI_API_KEY não configurada." };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { nome: true } });
  const n = Math.max(2, Math.min(5, Math.round(numCenas || 3)));
  const tema = (briefing || "").trim().slice(0, 300) || "o castelinho dando boas-vindas, mostrando a diversão do buffet e convidando pra fazer a festa lá";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Você é roteirista de vídeos curtos e fofos do mascote (o "castelinho") de um buffet infantil chamado "${marca?.nome || "o buffet"}". Escreva uma historinha ENCANTADORA dividida em EXATAMENTE ${n} cenas curtas, em português do Brasil, tom alegre de desenho animado pra crianças e famílias. Para CADA cena, dê: "acao" = o que o mascote faz na cena (movimento/expressão, sem falar de câmera), curto; "fala" = a frase que o mascote FALA na cena, CURTA (no máximo ~12 palavras, cabe em poucos segundos), encadeando a história de uma cena pra outra (começo, meio e fim), e a ÚLTIMA cena deve convidar a agendar a festa no buffet. Responda SÓ em JSON no formato {"cenas":[{"acao":"...","fala":"..."}]} com ${n} itens.` },
          { role: "user", content: `Tema da historinha: ${tema}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return { ok: false, erro: "Não consegui escrever as cenas agora. Tente de novo." };
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    let cenas: CenaHistoria[] = [];
    try {
      const parsed = JSON.parse(String(content || "{}"));
      const arr = Array.isArray(parsed?.cenas) ? parsed.cenas : [];
      cenas = arr.map((c: unknown) => ({
        acao: String((c as { acao?: unknown })?.acao || "").trim().slice(0, 300),
        fala: String((c as { fala?: unknown })?.fala || "").trim().slice(0, 160),
      })).filter((c: CenaHistoria) => c.acao || c.fala).slice(0, n);
    } catch { return { ok: false, erro: "A Bia respondeu num formato inesperado. Tente de novo." }; }
    if (cenas.length < 2) return { ok: false, erro: "Não consegui montar as cenas. Tente escrever o tema de outro jeito." };
    return { ok: true, cenas };
  } catch {
    return { ok: false, erro: "Não consegui escrever as cenas agora. Tente de novo." };
  }
}

// Depois que a tela gerou o clipe de CADA cena (URLs temporárias, fora da galeria), o motor EMENDA
// tudo num vídeo só. Salva a HISTÓRIA final na galeria e apaga as cenas soltas do Blob.
export async function emendarHistoriaMascote(marcaId: string, urls: string[]): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, erro: g.erro };
  const cenas = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && u.startsWith("http"));
  if (cenas.length < 2) return { ok: false, erro: "Preciso de pelo menos 2 cenas." };
  const r = await emendarClipes(cenas, `historia-${marcaId}`);
  if (!r.ok) return { ok: false, erro: r.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { mascoteClipes: true } });
  const novos = [r.videoUrl, ...lerListaUrls(marca?.mascoteClipes ?? "[]")].slice(0, 30);
  await prisma.marca.update({ where: { id: marcaId }, data: { mascoteClipes: JSON.stringify(novos) } });
  // As cenas soltas eram temporárias — tira do Blob (a história final já tem tudo).
  import("@vercel/blob").then(({ del }) => Promise.all(cenas.map((c) => del(c).catch(() => {})))).catch(() => {});
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true, url: r.videoUrl };
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
