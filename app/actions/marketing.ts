"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { guardaMarca, guardaConteudo } from "@/lib/acesso";
import { publicarNasRedes, urlsAbsolutas, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, AGENTE } from "@/lib/config";
import { rotuloPlano } from "@/lib/plano";
import { planoDaMarca, checarLimiteFeed } from "@/lib/limites";
import { sortearImagemBanco, sortearImagensBanco } from "@/app/actions/imagens";
import { classificarCategoriasIA } from "@/lib/inteligencia";
import type { Marca } from "@prisma/client";

type SlideTexto = {
  tipo: "capa" | "conteudo" | "cta" | "aniv-capa" | "aniv" | "mosaico" | "capa-festiva" | "capa-foto" | "capa-moldura" | "capa-faixa";
  titulo: string;
  texto?: string;
  imagemUrl?: string;
  fotos?: string[]; // tipo "mosaico": as 4 fotos reais do banco que vão nos círculos
  corFundo?: string; // cor de fundo escolhida pra capa (templates de capa)
  recado?: string; // Aniversariantes: recado opcional por criança (aparece no slide dela)
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

REGRA CRÍTICA (nunca quebrar): a marca É o próprio local/espaço da festa. NUNCA escreva nada que mande o cliente "escolher o local", "reservar um espaço", "encontrar/procurar/comparar local, salão ou buffet", nem dicas genéricas que sugiram buscar outro lugar — isso manda o cliente pra longe e é um erro grave. Todo conteúdo posiciona a marca como O lugar onde a festa acontece; o convite é sempre comemorar/fechar a festa COM a marca, não procurar local por aí.

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
  hora?: number; // hora do post (BRT) — permite vários posts no mesmo dia em horas diferentes
}) {
  const g = await guardaMarca(input.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const tema = input.tema?.trim();
  if (!tema) return { ok: false as const, erro: "Informe um tema." };
  const nSlides = Math.min(10, Math.max(4, input.nSlides ?? 7));

  // Dia/hora + limite de feed/dia do pacote do dono (carrossel conta junto com o feed).
  // Validado ANTES da IA pra não gastar geração. Marca sem dono/plano (admin) = sem limite.
  const horaC = String(typeof input.hora === "number" ? input.hora : (marca.horaCarrossel ?? 10)).padStart(2, "0");
  const data = new Date(`${input.data}T${horaC}:00:00-03:00`);
  const plano = await planoDaMarca(marca.id);
  if (plano) {
    const lim = await checarLimiteFeed(marca.id, data, plano);
    if (lim.bloqueia) return { ok: false as const, erro: `O pacote ${rotuloPlano(plano)} permite ${lim.limite} post${lim.limite > 1 ? "s" : ""} de feed por dia — esse dia já tem ${lim.jaTem}. Escolha outro dia.` };
  }

  let gerado: Gerado;
  try {
    gerado = await gerarConteudo(marca, tema, nSlides);
  } catch (e) {
    console.error("Erro ao gerar carrossel:", e);
    return { ok: false as const, erro: "Não consegui gerar agora. Confira a chave da OpenAI." };
  }

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
  // Classifica a categoria de intenção (pra inteligência) a partir do tema + legenda.
  // Best-effort: se a IA falhar, fica null e o backfill resgata depois.
  const mapaCat = await classificarCategoriasIA([{ ref: criado.id, texto: `${tema}. ${gerado.legenda || ""}` }]);
  await prisma.conteudo.update({
    where: { id: criado.id },
    data: { slides, slidesTexto: JSON.stringify(slidesFinais), categoria: mapaCat[criado.id] ?? null },
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
  tituloCapa?: string; // título da capa (vazio = "Aniversariantes da Semana")
  legenda?: string; // legenda custom (vazio = gera automático com os nomes)
  corFundo?: string; // cor de fundo do carrossel (vazio = cor da marca)
  aniversariantes: { nome: string; idade?: string; fotoUrl: string; recado?: string }[];
}) {
  const g = await guardaMarca(input.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };

  const lista = (input.aniversariantes || [])
    .map((a) => ({ nome: (a.nome || "").trim(), idade: (a.idade || "").trim(), fotoUrl: (a.fotoUrl || "").trim(), recado: (a.recado || "").trim() }))
    .filter((a) => a.nome && a.fotoUrl);
  if (lista.length === 0) return { ok: false as const, erro: "Adicione pelo menos um aniversariante com foto e nome." };

  const cor = input.corFundo?.trim() || undefined;
  const tituloCapa = input.tituloCapa?.trim() || "Aniversariantes da Semana";
  const slides: SlideTexto[] = [
    { tipo: "aniv-capa", titulo: tituloCapa, texto: input.semana?.trim() || undefined, corFundo: cor },
    ...lista.map((a): SlideTexto => ({ tipo: "aniv", titulo: a.nome, texto: a.idade || undefined, imagemUrl: a.fotoUrl, recado: a.recado || undefined, corFundo: cor })),
  ];

  const nomes = lista.map((a) => a.nome).join(", ");
  const legenda =
    input.legenda?.trim() ||
    `🎉 Parabéns aos aniversariantes da semana! 🎂\n\nUm viva pra: ${nomes}! 🥳\n\nQue esse novo ciclo seja cheio de alegria, sorrisos e muita diversão. Felicidades!\n\nQuer comemorar com a gente? Chama no WhatsApp! 📲`;
  const hashtags = "#aniversario #aniversariantes #festainfantil #parabens #felizaniversario #buffetinfantil #festa #diversao";

  const horaC = String(marca.horaCarrossel ?? 10).padStart(2, "0");
  const data = new Date(`${input.data}T${horaC}:00:00-03:00`);
  const slug = `${marca.slug}-aniversariantes-${Date.now().toString(36).slice(-4)}`;
  const criado = await prisma.conteudo.create({
    data: {
      marcaId: marca.id,
      slug,
      data,
      titulo: tituloCapa,
      legenda,
      hashtags,
      slides: "[]",
      slidesTexto: JSON.stringify(slides),
      tema: null, // não foi gerado por IA → não aparece o botão "Regerar"
      categoria: "sazonal", // aniversariantes da semana é sempre sazonal
      status: "a_postar",
    },
  });
  const urls = JSON.stringify(slides.map((_, i) => `/api/slide/${criado.id}/${i + 1}`));
  await prisma.conteudo.update({ where: { id: criado.id }, data: { slides: urls } });
  revalidatePath(`/painel/marcas/${marca.id}`);
  return { ok: true as const, id: criado.id };
}

// Troca SÓ a capa (slide 0) do carrossel — estilo e cor — sem mexer no conteúdo dos
// outros slides nem no texto. Reaproveita aplicarEstiloCapa, que só altera o slide 0
// (mantém título/texto da capa; re-sorteia fotos no mosaico/foto/faixa).
export async function trocarCapaCarrossel(input: { id: string; estiloCapa: string; corFundo?: string }) {
  const g = await guardaConteudo(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = await prisma.conteudo.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  const slides = lerSlides(c.slidesTexto);
  if (!slides?.length) return { ok: false as const, erro: "Esse carrossel não tem slides." };
  const novos = await aplicarEstiloCapa(c.marca, slides, input.estiloCapa || "aleatorio", input.corFundo || undefined);
  await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(novos) } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

// Muda só a HORA de um carrossel já programado (mantém o dia). Bloqueia se já postado.
// Permite o dono espalhar vários posts do mesmo dia em horários diferentes pelo card.
export async function reagendarCarrossel(id: string, hora: number) {
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = await prisma.conteudo.findUnique({ where: { id }, select: { data: true, marcaId: true, status: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  if (c.status === "postado") return { ok: false as const, erro: "Esse carrossel já foi publicado." };
  const h = Math.max(0, Math.min(23, Math.floor(hora)));
  const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(c.data);
  const novaData = new Date(`${diaSP}T${String(h).padStart(2, "0")}:00:00-03:00`);
  await prisma.conteudo.update({ where: { id }, data: { data: novaData } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const };
}

export async function regerarCarrossel(id: string) {
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = await prisma.conteudo.findUnique({ where: { id }, select: { aprovado: true, marcaId: true } });
  if (!c) return { ok: false as const, erro: "Carrossel não encontrado." };
  await prisma.conteudo.update({ where: { id }, data: { aprovado: !c.aprovado } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const, aprovado: !c.aprovado };
}

export async function sugerirTemas(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const r = await publicarNasRedes(c.marca, urls, legenda);
  if (!r.ig.ok) return { ok: false as const, erro: r.ig.erro };

  await prisma.conteudo.update({ where: { id }, data: { status: "postado", postadoEm: new Date(), mediaId: r.ig.mediaId } });
  const onde = r.fb?.ok ? "Instagram + Facebook" : "Instagram";
  await registrarAtividade(AGENTE, `Postei "${c.titulo}" no ${onde} de ${c.marca.nome}.`, c.marcaId);
  revalidatePath(`/painel/marcas/${c.marcaId}`);
  return { ok: true as const, permalink: r.ig.permalink, facebook: r.fb?.ok ?? null, erroFacebook: r.fb && !r.fb.ok ? r.fb.erro : undefined };
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
  const g = await guardaConteudo(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
  const g = await guardaConteudo(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
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
    // Mantém TODO o resto do slide (imagemUrl, fotos do mosaico, corFundo) — só o
    // texto muda. Antes substituía o slide inteiro e a foto/cor sumiam ao regerar.
    slides[input.indice] = { ...slide, titulo: j.titulo || slide.titulo, texto: j.texto };
    await prisma.conteudo.update({ where: { id: input.id }, data: { slidesTexto: JSON.stringify(slides) } });
    revalidatePath(`/painel/marcas/${c.marcaId}`);
    return { ok: true as const };
  } catch (e) {
    console.error("Erro ao regerar slide:", e);
    return { ok: false as const, erro: "Não consegui regerar esse slide agora." };
  }
}

export async function marcarConteudo(formData: FormData) {
  const id = String(formData.get("id") || "");
  const g = await guardaConteudo(id);
  if (!g.ok) return;
  const status = String(formData.get("status") || "");
  const c = await prisma.conteudo.findUnique({ where: { id } });
  if (!c) return;
  // Marcar manualmente como postado registra o horário; desmarcar limpa.
  await prisma.conteudo.update({ where: { id }, data: { status, postadoEm: status === "postado" ? new Date() : null } });
  revalidatePath(`/painel/marcas/${c.marcaId}`);
}
