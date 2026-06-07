"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { publicar, urlsAbsolutas, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";
import type { Marca } from "@prisma/client";

type SlideTexto = {
  tipo: "capa" | "conteudo" | "cta";
  titulo: string;
  texto?: string;
  imagemUrl?: string;
};
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

export async function gerarCarrossel(input: {
  marcaId: string;
  tema: string;
  data: string; // YYYY-MM-DD
  nSlides?: number;
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

  const data = new Date(`${input.data}T12:00:00-03:00`);
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
  const slides = JSON.stringify(gerado.slides.map((_, i) => `/api/slide/${criado.id}/${i + 1}`));
  await prisma.conteudo.update({ where: { id: criado.id }, data: { slides } });

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

  let gerado: Gerado;
  try {
    gerado = await gerarConteudo(atual.marca, atual.tema, nSlides);
  } catch (e) {
    console.error("Erro ao regerar:", e);
    return { ok: false as const, erro: "Não consegui regerar agora." };
  }
  const slides = JSON.stringify(gerado.slides.map((_, i) => `/api/slide/${id}/${i + 1}`));
  await prisma.conteudo.update({
    where: { id },
    data: {
      titulo: gerado.titulo || atual.titulo,
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      slidesTexto: JSON.stringify(gerado.slides),
      slides,
      status: "a_postar",
    },
  });
  revalidatePath(`/painel/marcas/${atual.marcaId}`);
  return { ok: true as const, id };
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
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const base = input.descricao?.trim() || `${slide.titulo}. ${slide.texto ?? ""}`;
  const prompt = `Fotografia profissional, realista e limpa para a marca "${c.marca.nome}" (${
    c.marca.descricao || "negócio local"
  }). Tema: ${base}. Iluminação de estúdio, alta qualidade, formato vertical. NÃO inclua nenhum texto, letra, número ou logotipo na imagem.`;

  let b64: string | undefined;
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1536" }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Resposta sem imagem.");
  } catch (e) {
    console.error("Erro ao gerar imagem do slide:", e);
    return { ok: false as const, erro: "Não consegui gerar a imagem agora." };
  }
  let url: string;
  try {
    const blob = await put(`${c.marcaId}/slide-${input.id}-${input.indice}-${Date.now()}.png`, Buffer.from(b64, "base64"), {
      access: "public",
      contentType: "image/png",
    });
    url = blob.url;
  } catch (e) {
    console.error("Erro ao salvar imagem (Blob):", e);
    return { ok: false as const, erro: "Imagem gerada, mas não consegui salvar (Vercel Blob)." };
  }
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
