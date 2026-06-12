"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { publicar, urlsAbsolutas, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";
import { sortearImagemBanco, sortearImagensBanco } from "@/app/actions/imagens";
import type { Marca } from "@prisma/client";

type SlideTexto = {
  tipo: "capa" | "conteudo" | "cta" | "aniv-capa" | "aniv" | "mosaico" | "capa-festiva" | "capa-foto" | "capa-moldura" | "capa-faixa";
  titulo: string;
  texto?: string;
  imagemUrl?: string;
  fotos?: string[]; // tipo "mosaico": as 4 fotos reais do banco que vão nos círculos
  corFundo?: string; // cor de fundo escolhida pra capa (templates de capa)
};

// Estilos de CAPA de carrossel que o usuário pode escolher (ou "aleatorio" sorteia).
const ESTILOS_CAPA = ["festiva", "foto", "moldura", "faixa", "mosaico"] as const;
const ehCapaEstilo = (t: string) => t === "mosaico" || t.startsWith("capa-");
type Gerado = { titulo: string; slides: SlideTexto[]; legenda: string; hashtags: string };

// Monta o "system prompt" no tom da marca (a partir do cadastro dela).
function sistemaDaMarca(marca: Marca): string {
  const tel = marca.telefone ? ` Telefone/WhatsApp: ${marca.telefone}.` : "";
  return `Você cria conteúdo de Instagram para a marca "${marca.nome}". ${
    marca.descricao || "Negócio local."
  }${tel}

Tom: profissional, próximo e confiável. Sem jargão de guru, sem "prezado cliente", no máximo 1 emoji por slide.

Você devolve SEMPRE um JSON válido:
{
  "titulo": "título curto do carrossel (uso interno)",
  "slides": [
    {"tipo":"capa","titulo":"frase de capa forte e curta","texto":"subtítulo opcional curto"},
    {"tipo":"conteudo","titulo":"título do slide","texto":"texto curto, 1-2 frases"},
    {"tipo":"cta","titulo":"chamada final","texto":"convite pra ação"}
  ],
  "legenda": "legenda do post (3-6 linhas com quebras \\n), termina com um convite${
    marca.telefone ? ` (ex: chamar no WhatsApp ${marca.telefone})` : ""
  }",
  "hashtags": "10 a 15 hashtags relevantes separadas por espaço, começando com #"
}
Regras: 1º slide é "capa", último é "cta", os do meio "conteudo". Títulos curtos (até ~8 palavras), textos curtos (até ~20 palavras). Português do Brasil.`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function gerarConteudo(marca: Marca, tema: string, nSlides: number): Promise<Gerado> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        { role: "system", content: sistemaDaMarca(marca) },
        { role: "user", content: `Crie um carrossel com exatamente ${nSlides} slides sobre: "${tema}".` },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da OpenAI.");
  return JSON.parse(content) as Gerado;
}

// Gera UMA foto de fundo (IA) e devolve a URL no Blob — ou null se falhar.
// Não toca no banco, pra poder rodar várias em paralelo sem corrida.
async function gerarFotoFundo(marca: Marca, descricao: string, ref: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // Fundo DECORATIVO ABSTRATO — nunca um ambiente/cena realista (pra não fingir
  // ser o espaço real do negócio). O espaço de verdade vem do banco de fotos reais.
  const prompt = `Fundo decorativo abstrato para um post de rede social da marca "${marca.nome}". Estilo: textura/padrão festivo e colorido — bokeh, confete, balões, formas geométricas suaves, gradiente alegre. NÃO é uma fotografia de ambiente, lugar, espaço, comida, objetos ou pessoas reais; é apenas um fundo artístico abstrato. Formato vertical. SEM texto, letras, números, logotipos, pessoas, rostos ou cenários reconhecíveis.`;
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1536" }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Resposta sem imagem.");
    const blob = await put(`${marca.id}/${ref}-${Date.now()}.png`, Buffer.from(b64, "base64"), {
      access: "public",
      contentType: "image/png",
    });
    return blob.url;
  } catch (e) {
    console.error("Erro ao gerar foto de fundo:", e);
    return null;
  }
}

// Preenche a foto de cada slide: prioriza FOTO REAL do banco da marca (em rodízio,
// sem repetir na mesma leva); só cai na IA (fundo decorativo abstrato) quando o
// banco está vazio. O sorteio do banco é SEQUENCIAL (pro contador de rodízio
// equilibrar entre os slides); a geração de IA, que é lenta, roda em paralelo.
async function comFotosDeIA(marca: Marca, id: string, slides: SlideTexto[]): Promise<SlideTexto[]> {
  // As CAPAS de estilo (mosaico/capa-*) já trazem suas próprias fotos/cor — não recebem foto única.
  const doBanco: (string | null)[] = [];
  for (let i = 0; i < slides.length; i++) doBanco.push(ehCapaEstilo(slides[i].tipo) ? null : await sortearImagemBanco(marca.id));
  const fotos = await Promise.all(
    slides.map(async (s, i) => (ehCapaEstilo(s.tipo) ? null : doBanco[i] || (await gerarFotoFundo(marca, `${s.titulo}. ${s.texto ?? ""}`, `slide-${id}-${i}`)))),
  );
  return slides.map((s, i) => (fotos[i] ? { ...s, imagemUrl: fotos[i]! } : s));
}

// Transforma a CAPA (slide 0) no ESTILO escolhido (ou sorteia se "aleatorio"). Os
// estilos com foto (foto/faixa/mosaico) puxam do banco; festiva/moldura são só cor.
// O título gerado pela IA é mantido — só o visual da capa muda. corFundo = cor da capa.
async function aplicarEstiloCapa(marca: Marca, slides: SlideTexto[], estilo: string, corFundo?: string): Promise<SlideTexto[]> {
  if (!slides.length) return slides;
  let est = estilo;
  if (!(ESTILOS_CAPA as readonly string[]).includes(est)) est = ESTILOS_CAPA[Math.floor(Math.random() * ESTILOS_CAPA.length)];
  if (est === "mosaico") {
    const fotos = await sortearImagensBanco(marca.id, 4);
    if (!fotos.length) est = "festiva"; // sem banco, cai pra capa colorida (sem foto)
    else return slides.map((s, i) => (i === 0 ? { ...s, tipo: "mosaico", fotos, corFundo, imagemUrl: undefined } : s));
  }
  if (est === "foto" || est === "faixa") {
    const foto = await sortearImagemBanco(marca.id);
    if (!foto) est = "festiva"; // sem banco, cai pra capa colorida
    else return slides.map((s, i) => (i === 0 ? { ...s, tipo: `capa-${est}` as SlideTexto["tipo"], imagemUrl: foto, corFundo, fotos: undefined } : s));
  }
  // festiva, moldura (só cor, sem foto)
  return slides.map((s, i) => (i === 0 ? { ...s, tipo: `capa-${est}` as SlideTexto["tipo"], corFundo, imagemUrl: undefined, fotos: undefined } : s));
}

// Lê o estilo e a cor da CAPA atual (slide 0), pra preservar no regerar.
function estiloDaCapa(slidesTexto: string | null): { estilo: string; corFundo?: string } {
  try {
    const c = (JSON.parse(slidesTexto || "[]") as SlideTexto[])[0];
    if (c?.tipo === "mosaico") return { estilo: "mosaico", corFundo: c.corFundo };
    if (c?.tipo?.startsWith("capa-")) return { estilo: c.tipo.replace("capa-", ""), corFundo: c.corFundo };
  } catch {}
  return { estilo: "aleatorio" };
}

export async function gerarCarrossel(input: {
  marcaId: string;
  tema: string;
  data: string; // YYYY-MM-DD
  nSlides?: number;
  estiloCapa?: string; // festiva | foto | moldura | faixa | mosaico | aleatorio
  corFundo?: string; // cor de fundo da capa (ou vazio = automático)
}) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const tema = input.tema?.trim();
  if (!tema) return { ok: false as const, erro: "Informe um tema." };
  const nSlides = Math.min(10, Math.max(4, input.nSlides ?? 7));

  let gerado: Gerado;
  try {
    gerado = await gerarConteudo(marca, tema, nSlides);
  } catch (e) {
    console.error("Erro ao gerar carrossel:", e);
    return { ok: false as const, erro: "Não consegui gerar agora. Confira a chave da OpenAI." };
  }

  const horaC = String(marca.horaCarrossel ?? 10).padStart(2, "0");
  const data = new Date(`${input.data}T${horaC}:00:00-03:00`);
  const slug = `${marca.slug}-${slugify(tema)}-${Date.now().toString(36).slice(-4)}`;
  const criado = await prisma.conteudo.create({
    data: {
      marcaId: marca.id,
      slug,
      data,
      titulo: gerado.titulo || tema,
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      slides: "[]",
      slidesTexto: JSON.stringify(gerado.slides),
      tema,
      status: "a_postar",
    },
  });
  // Aplica o ESTILO da capa (slide 0) ANTES de preencher as fotos dos demais slides.
  // Default = aleatório (variedade automática). corFundo vazio = automático (da paleta).
  const slidesBase = await aplicarEstiloCapa(marca, gerado.slides, input.estiloCapa || "aleatorio", input.corFundo || undefined);
  // Gera foto de IA pra cada slide. Se alguma falhar, aquele slide fica em cor sólida.
  const slidesFinais = await comFotosDeIA(marca, criado.id, slidesBase);
  const slides = JSON.stringify(slidesFinais.map((_, i) => `/api/slide/${criado.id}/${i + 1}`));
  await prisma.conteudo.update({
    where: { id: criado.id },
    data: { slides, slidesTexto: JSON.stringify(slidesFinais) },
  });

  revalidatePath(`/painel/marcas/${marca.id}`);
  return { ok: true as const, id: criado.id };
}

// Carrossel "Aniversariantes da Semana": montado MANUALMENTE a partir das fotos +
// nomes + idades que o usuário sobe (não é gerado por IA, então não tem "regerar").
export async function criarAniversariantes(input: {
  marcaId: string;
  data: string; // YYYY-MM-DD
  semana?: string;
  aniversariantes: { nome: string; idade?: string; fotoUrl: string }[];
}) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };

  const lista = (input.aniversariantes || [])
    .map((a) => ({ nome: (a.nome || "").trim(), idade: (a.idade || "").trim(), fotoUrl: (a.fotoUrl || "").trim() }))
    .filter((a) => a.nome && a.fotoUrl);
  if (lista.length === 0) return { ok: false as const, erro: "Adicione pelo menos um aniversariante com foto e nome." };

  const slides: SlideTexto[] = [
    { tipo: "aniv-capa", titulo: "Aniversariantes da Semana", texto: input.semana?.trim() || undefined },
    ...lista.map((a): SlideTexto => ({ tipo: "aniv", titulo: a.nome, texto: a.idade || undefined, imagemUrl: a.fotoUrl })),
  ];

  const nomes = lista.map((a) => a.nome).join(", ");
  const legenda = `🎉 Parabéns aos aniversariantes da semana! 🎂\n\nUm viva pra: ${nomes}! 🥳\n\nQue esse novo ciclo seja cheio de alegria, sorrisos e muita diversão. Felicidades!\n\nQuer comemorar com a gente? Chama no WhatsApp! 📲`;
  const hashtags = "#aniversario #aniversariantes #festainfantil #parabens #felizaniversario #buffetinfantil #festa #diversao";

  const horaC = String(marca.horaCarrossel ?? 10).padStart(2, "0");
  const data = new Date(`${input.data}T${horaC}:00:00-03:00`);
  const slug = `${marca.slug}-aniversariantes-${Date.now().toString(36).slice(-4)}`;
  const criado = await prisma.conteudo.create({
    data: {
      marcaId: marca.id,
      slug,
      data,
      titulo: "Aniversariantes da Semana",
      legenda,
      hashtags,
      slides: "[]",
      slidesTexto: JSON.stringify(slides),
      tema: null, // não foi gerado por IA → não aparece o botão "Regerar"
      status: "a_postar",
    },
  });
  const urls = JSON.stringify(slides.map((_, i) => `/api/slide/${criado.id}/${i + 1}`));
  await prisma.conteudo.update({ where: { id: criado.id }, data: { slides: urls } });
  revalidatePath(`/painel/marcas/${marca.id}`);
  return { ok: true as const, id: criado.id };
}

export async function regerarCarrossel(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const atual = await prisma.conteudo.findUnique({ where: { id }, include: { marca: true } });
  if (!atual?.tema) return { ok: false as const, erro: "Esse carrossel não foi gerado por IA." };
  const nSlides = (() => {
    try {
      return (JSON.parse(atual.slidesTexto || "[]") as unknown[]).length || 7;
    } catch {
      return 7;
    }
  })();

  // Preserva o ESTILO e a COR da capa atual ao regerar.
  const cap = estiloDaCapa(atual.slidesTexto);

  let gerado: Gerado;
  try {
    gerado = await gerarConteudo(atual.marca, atual.tema, nSlides);
  } catch (e) {
    console.error("Erro ao regerar:", e);
    return { ok: false as const, erro: "Não consegui regerar agora." };
  }
  const slidesBase = await aplicarEstiloCapa(atual.marca, gerado.slides, cap.estilo, cap.corFundo);
  const slidesFinais = await comFotosDeIA(atual.marca, id, slidesBase);
  const slides = JSON.stringify(slidesFinais.map((_, i) => `/api/slide/${id}/${i + 1}`));
  await prisma.conteudo.update({
    where: { id },
    data: {
      titulo: gerado.titulo || atual.titulo,
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      slidesTexto: JSON.stringify(slidesFinais),
      slides,
      status: "a_postar",
    },
  });
  revalidatePath(`/painel/marcas/${atual.marcaId}`);
  return { ok: true as const, id };
}

// Carrossel JÁ postado: "regerar" não deve sobrescrever (não muda no Insta). Cria um
// NOVO carrossel ao lado — mesmo tema, nº de slides e capa-mosaico — em HOJE (data
// BRT), preservando o postado. Reusa gerarCarrossel (texto + fotos).
export async function regerarCarrosselComoNova(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const atual = await prisma.conteudo.findUnique({ where: { id }, include: { marca: true } });
  if (!atual?.tema) return { ok: false as const, erro: "Esse carrossel não foi gerado por IA." };
  let nSlides = 7;
  try {
    nSlides = (JSON.parse(atual.slidesTexto || "[]") as SlideTexto[]).length || 7;
  } catch {}
  const cap = estiloDaCapa(atual.slidesTexto);
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return gerarCarrossel({ marcaId: atual.marcaId, tema: atual.tema, data, nSlides, estiloCapa: cap.estilo, corFundo: cap.corFundo });
}

// Marca/desmarca "✓ Aprovado" do carrossel — revisão INTERNA (não vai pra rede).
export async function alternarAprovacaoCarrossel(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id }, select: { aprovado: true, marcaId: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  await prisma.conteudo.update({ where: { id }, data: { aprovado: !c.aprovado } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const, aprovado: !c.aprovado };
}

export async function sugerirTemas(marcaId: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const usados = await prisma.conteudo.findMany({
    where: { marcaId },
    select: { tema: true, titulo: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const evitar = usados.map((c) => c.tema || c.titulo).filter(Boolean).join("; ");
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.9,
        messages: [
          { role: "system", content: sistemaDaMarca(marca) },
          {
            role: "user",
            content: `Sugira 6 TEMAS novos de carrossel pra essa marca, úteis pro público dela. Evite repetir: ${
              evitar || "nenhum"
            }. Responda só com JSON: {"temas": ["tema 1", ...]} — cada tema curto.`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { temas?: string[] };
    const temas = (j.temas ?? []).filter(Boolean).slice(0, 6);
    if (temas.length === 0) throw new Error("Resposta vazia.");
    return { ok: true as const, temas };
  } catch (e) {
    console.error("Erro ao sugerir temas:", e);
    return { ok: false as const, erro: "Não consegui sugerir temas agora." };
  }
}

export async function postarInstagram(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id }, include: { marca: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  if (c.status === "postado") return { ok: false as const, erro: "Esse carrossel já foi postado." };
  if (!marcaConectada(c.marca)) {
    return { ok: false as const, erro: `Conecte o Instagram da marca "${c.marca.nome}" primeiro.` };
  }
  let caminhos: string[] = [];
  try {
    caminhos = JSON.parse(c.slides) as string[];
  } catch {}
  const urls = urlsAbsolutas(baseUrl(), caminhos);
  if (urls.length < 1) return { ok: false as const, erro: "Carrossel sem imagens." };

  const legenda = `${c.legenda}\n\n${c.hashtags}`.trim().slice(0, 2200);
  const r = await publicar(
    { igUserId: c.marca.igUserId, accessToken: c.marca.accessToken },
    urls,
    legenda
  );
  if (!r.ok) return { ok: false as const, erro: r.erro };

  await prisma.conteudo.update({ where: { id }, data: { status: "postado" } });
  await registrarAtividade(APP_NAME, `Postei "${c.titulo}" no @ de ${c.marca.nome}.`, c.marcaId);
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const, permalink: r.permalink };
}

// ---- Imagens nos slides (IA ou upload) ----

function lerSlides(slidesTexto: string | null): SlideTexto[] | null {
  try {
    return JSON.parse(slidesTexto || "[]") as SlideTexto[];
  } catch {
    return null;
  }
}

export async function gerarImagemSlide(input: { id: string; indice: number; descricao?: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  const slides = lerSlides(c.slidesTexto);
  const slide = slides?.[input.indice];
  if (!slide) return { ok: false as const, erro: "Slide não encontrado." };
  if (!process.env.OPENAI_API_KEY) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const base = input.descricao?.trim() || `${slide.titulo}. ${slide.texto ?? ""}`;
  const url = await gerarFotoFundo(c.marca, base, `slide-${input.id}-${input.indice}`);
  if (!url) return { ok: false as const, erro: "Não consegui gerar a imagem agora." };
  slides![input.indice] = { ...slide, imagemUrl: url };
  await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(slides) } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const, url };
}

export async function definirImagemSlide(input: { id: string; indice: number; url: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id: input.id } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  const slides = lerSlides(c.slidesTexto);
  if (!slides?.[input.indice]) return { ok: false as const, erro: "Slide não encontrado." };
  slides[input.indice] = { ...slides[input.indice], imagemUrl: input.url };
  await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(slides) } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

export async function removerImagemSlide(input: { id: string; indice: number }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id: input.id } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  const slides = lerSlides(c.slidesTexto);
  const slide = slides?.[input.indice];
  if (!slide) return { ok: false as const, erro: "Slide não encontrado." };
  delete slide.imagemUrl;
  slides[input.indice] = slide;
  await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(slides) } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

export async function regerarSlide(input: { id: string; indice: number }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const c = await prisma.conteudo.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  const slides = lerSlides(c.slidesTexto);
  const slide = slides?.[input.indice];
  if (!slide) return { ok: false as const, erro: "Slide não encontrado." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const tema = c.tema || c.titulo || c.marca.nome;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.9,
        messages: [
          { role: "system", content: sistemaDaMarca(c.marca) },
          {
            role: "user",
            content: `Tema do carrossel: "${tema}". Reescreva APENAS UM slide do tipo "${slide.tipo}" com um ângulo novo, diferente de "${slide.titulo}". Responda só com JSON: {"titulo":"...","texto":"..."}.`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { titulo?: string; texto?: string };
    slides[input.indice] = { tipo: slide.tipo, titulo: j.titulo || slide.titulo, texto: j.texto };
    await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(slides) } });
    revalidatePath(`/painel/marcas/${c.marcaId}`);
    return { ok: true as const };
  } catch (e) {
    console.error("Erro ao regerar slide:", e);
    return { ok: false as const, erro: "Não consegui regerar esse slide agora." };
  }
}

export async function marcarConteudo(formData: FormData) {
  if (!(await estaLogado())) return;
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const c = await prisma.conteudo.findUnique({ where: { id } });
  if (!c) return;
  await prisma.conteudo.update({ where: { id }, data: { status } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
}
