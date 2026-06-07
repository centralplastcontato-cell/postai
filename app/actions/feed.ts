"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { publicar, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";
import { TEMPLATES, type Template } from "@/lib/feed-templates";
import type { Marca } from "@prisma/client";

const GUIA: Record<Template, string> = {
  dica: 'Faça uma DICA prática e útil pro público da marca. O "titulo" é a dica em si, direta.',
  produto:
    'Destaque UM produto ou serviço da marca. O "titulo" é o produto/serviço + principal benefício; o "texto" reforça a vantagem.',
  vinte_anos:
    'Reforce CREDIBILIDADE/autoridade da marca (experiência, qualidade, atendimento). O "titulo" é uma frase de confiança curta.',
  frase:
    'Crie uma FRASE de impacto curta (estilo citação) ligada ao universo da marca. O "titulo" é a frase; "texto" pode complementar ou ficar vazio.',
};

function sistema(marca: Marca): string {
  const tel = marca.telefone ? ` Telefone/WhatsApp: ${marca.telefone}.` : "";
  return `Você cria POSTS DE FEED (imagem única) para o Instagram da marca "${marca.nome}". ${
    marca.descricao || "Negócio local."
  }${tel}

Tom: profissional, próximo e confiável. Sem jargão de guru, sem "prezado cliente", no máximo 1 emoji no texto.

Devolva SEMPRE um JSON válido:
{
  "titulo": "frase principal forte e curta (até ~9 palavras) — texto GRANDE da arte",
  "texto": "texto de apoio curto, 1 frase (até ~18 palavras)",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}
Português do Brasil.`;
}

type Gerado = { titulo: string; texto?: string; legenda: string; hashtags: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Próxima data de feed (dias da agenda da marca) ainda livre.
async function proximaDataFeed(marca: Marca): Promise<Date> {
  const dias = marca.diasFeed.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  const usadas = new Set(
    (await prisma.publicacao.findMany({ where: { marcaId: marca.id }, select: { data: true } })).map(
      (p) => p.data.toISOString().slice(0, 10)
    )
  );
  const hoje = new Date();
  for (let i = 0; i < 40; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (!dias.includes(d.getDay())) continue;
    const iso = d.toISOString().slice(0, 10);
    if (usadas.has(iso)) continue;
    return new Date(`${iso}T${String(marca.horaPost).padStart(2, "0")}:00:00-03:00`);
  }
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  return new Date(`${amanha.toISOString().slice(0, 10)}T10:00:00-03:00`);
}

async function gerarTexto(marca: Marca, template: Template, tema?: string): Promise<Gerado> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const pedido = tema?.trim()
    ? `${GUIA[template]} Tema/assunto sugerido: "${tema.trim()}".`
    : `${GUIA[template]} Escolha um ângulo novo e útil.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.85,
      messages: [
        { role: "system", content: sistema(marca) },
        { role: "user", content: pedido },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da OpenAI.");
  return JSON.parse(content) as Gerado;
}

export async function gerarPublicacao(input: {
  marcaId: string;
  template: Template;
  tema?: string;
  data?: string;
}) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const template = (TEMPLATES as readonly string[]).includes(input.template) ? input.template : "dica";

  let gerado: Gerado;
  try {
    gerado = await gerarTexto(marca, template, input.tema);
  } catch (e) {
    console.error("Erro ao gerar publicação:", e);
    return { ok: false as const, erro: "Não consegui gerar agora. Confira a chave da OpenAI." };
  }
  const data = input.data
    ? new Date(`${input.data}T${String(marca.horaPost).padStart(2, "0")}:00:00-03:00`)
    : await proximaDataFeed(marca);
  const slug = `${marca.slug}-${template}-${slugify(gerado.titulo || template)}-${Date.now().toString(36).slice(-4)}`;
  const criado = await prisma.publicacao.create({
    data: {
      marcaId: marca.id,
      slug,
      data,
      template,
      titulo: gerado.titulo || marca.nome,
      texto: gerado.texto || "",
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      tema: input.tema?.trim() || null,
      status: "a_postar",
    },
  });
  revalidatePath(`/painel/marcas/${marca.id}`);
  return { ok: true as const, id: criado.id };
}

export async function regerarPublicacao(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  let gerado: Gerado;
  try {
    gerado = await gerarTexto(p.marca, p.template as Template, p.tema ?? undefined);
  } catch (e) {
    console.error("Erro ao regerar publicação:", e);
    return { ok: false as const, erro: "Não consegui regerar agora." };
  }
  await prisma.publicacao.update({
    where: { id },
    data: {
      titulo: gerado.titulo || p.titulo,
      texto: gerado.texto || "",
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      status: "a_postar",
    },
  });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function excluirPublicacao(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.delete({ where: { id } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function gerarImagemPublicacao(input: { id: string; descricao?: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const base = input.descricao?.trim() || `${p.titulo}. ${p.texto ?? ""}`;
  const prompt = `Fotografia profissional, realista e limpa para a marca "${p.marca.nome}" (${
    p.marca.descricao || "negócio local"
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
    console.error("Erro ao gerar imagem da publicação:", e);
    return { ok: false as const, erro: "Não consegui gerar a imagem agora." };
  }
  let url: string;
  try {
    const blob = await put(`${p.marcaId}/feed-${input.id}-${Date.now()}.png`, Buffer.from(b64, "base64"), {
      access: "public",
      contentType: "image/png",
    });
    url = blob.url;
  } catch (e) {
    console.error("Erro ao salvar imagem (Blob):", e);
    return { ok: false as const, erro: "Imagem gerada, mas não consegui salvar (Vercel Blob)." };
  }
  await prisma.publicacao.update({ where: { id: input.id }, data: { imagemUrl: url } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const, url };
}

export async function definirImagemPublicacao(input: { id: string; url: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id: input.id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.update({ where: { id: input.id }, data: { imagemUrl: input.url } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function removerImagemPublicacao(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.update({ where: { id }, data: { imagemUrl: null } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function postarPublicacao(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  if (p.status === "postado") return { ok: false as const, erro: "Essa publicação já foi postada." };
  if (!marcaConectada(p.marca)) {
    return { ok: false as const, erro: `Conecte o Instagram da marca "${p.marca.nome}" primeiro.` };
  }
  const legenda = `${p.legenda}\n\n${p.hashtags}`.trim().slice(0, 2200);
  const r = await publicar(
    { igUserId: p.marca.igUserId, accessToken: p.marca.accessToken },
    [`${baseUrl()}/api/feed/${id}`],
    legenda
  );
  if (!r.ok) return { ok: false as const, erro: r.erro };
  await prisma.publicacao.update({ where: { id }, data: { status: "postado" } });
  await registrarAtividade(APP_NAME, `Postei "${p.titulo}" no @ de ${p.marca.nome}.`, p.marcaId);
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const, permalink: r.permalink };
}
