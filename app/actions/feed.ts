"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";
import { publicar, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, APP_NAME } from "@/lib/config";
import { TEMPLATES, type Template } from "@/lib/feed-templates";
import { paletaDaMarca, escolherFundoFesta } from "@/lib/arte";
import type { Marca } from "@prisma/client";

// Dados que o usuário fixou manualmente (têm prioridade sobre o que a IA gera).
// `inclui`/`regras` são SEMPRE manuais (a IA não inventa o que a festa inclui nem condições).
type Travas = { oferta?: string; validade?: string; inclui?: string[]; regras?: string; diferenciais?: string[] };

// Monta o JSON do campo `extra` conforme o template (dados específicos da arte).
// `travas` são valores digitados pelo usuário — usados exatos e preservados no regerar.
function montarExtra(marca: Marca, template: Template, g: Gerado, seed: number, travas?: Travas): string | null {
  if (template === "promocao") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const oferta = travas?.oferta || g.oferta?.trim() || "";
    const validade = travas?.validade || g.validade?.trim() || "";
    const inclui = (travas?.inclui || []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return JSON.stringify({
      oferta,
      validade,
      inclui,
      regras: travas?.regras || "",
      corFundo: escolherFundoFesta(paleta, seed),
      // Guarda o que foi digitado pra manter fixo quando o usuário regerar o texto.
      ofertaTravada: travas?.oferta || undefined,
      validadeTravada: travas?.validade || undefined,
    });
  }
  if (template === "data-comemorativa") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    return JSON.stringify({
      selo: g.selo?.trim() || "",
      corFundo: escolherFundoFesta(paleta, seed),
    });
  }
  if (template === "divulgacao") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const manuais = (travas?.diferenciais || []).map((s) => s.trim()).filter(Boolean);
    const diferenciais = (manuais.length ? manuais : g.diferenciais || []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
    return JSON.stringify({
      diferenciais,
      corFundo: escolherFundoFesta(paleta, seed),
      // Mantém fixos os diferenciais digitados ao regerar o texto.
      diferenciaisTravados: manuais.length ? manuais : undefined,
    });
  }
  return null;
}

const GUIA: Record<Template, string> = {
  promocao:
    'Crie uma PROMOÇÃO/OFERTA irresistível pro público da marca. O "titulo" é a chamada principal (curta e forte); preencha "oferta" com o benefício em destaque e "validade" com a condição, quando fizer sentido.',
  "data-comemorativa":
    'Crie uma SAUDAÇÃO calorosa para a data comemorativa indicada (ex: Natal, Dia das Crianças, Páscoa). O "titulo" é a saudação principal, curta e festiva (ex: "Feliz Natal!"); preencha "selo" com o nome/data da comemoração e "texto" com uma mensagem afetuosa que conecte a data com a marca. NÃO ofereça promoção aqui — é puro carinho/celebração.',
  divulgacao:
    'Crie uma DIVULGAÇÃO INSTITUCIONAL ("por que escolher a gente"). O "titulo" é uma chamada de valor, curta e convidativa (ex: "A festa dos sonhos começa aqui"); preencha "diferenciais" com 3 ou 4 pontos fortes BEM curtos (2 a 4 palavras cada, ex: "Monitores treinados", "Buffet completo"). Foco em confiança e qualidade — NÃO ofereça desconto/promoção aqui.',
  dica: 'Faça uma DICA prática e útil pro público da marca. O "titulo" é a dica em si, direta.',
};

// Formato de JSON esperado por template (a Promoção pede oferta/validade).
const FORMATO_JSON: Record<Template, string> = {
  promocao: `{
  "titulo": "chamada principal forte e curta (3 a 6 palavras) — vai GRANDE na arte",
  "oferta": "o benefício em destaque, CURTÍSSIMO e em CAIXA ALTA (ex: 10 CRIANÇAS GRÁTIS, 30% OFF) — ou vazio",
  "texto": "1 frase de apoio curta (até ~16 palavras)",
  "validade": "condição/validade curta (ex: Válido para os 10 primeiros contratos) — ou vazio",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  "data-comemorativa": `{
  "titulo": "saudação principal curta e festiva (2 a 5 palavras) — vai GRANDE na arte (ex: Feliz Natal!)",
  "selo": "nome/data curta da comemoração (ex: 25 de Dezembro, Dia das Crianças) — ou vazio",
  "texto": "mensagem afetuosa curta (até ~16 palavras) ligando a data à marca",
  "legenda": "legenda do post (3-5 linhas com \\n), tom caloroso, termina com um convite leve",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  divulgacao: `{
  "titulo": "chamada de valor curta e convidativa (3 a 6 palavras) — vai GRANDE na arte",
  "diferenciais": ["3 a 4 pontos fortes, cada um com 2 a 4 palavras (ex: Monitores treinados)"],
  "texto": "1 frase de apoio curta (até ~16 palavras) — usada só se não houver diferenciais",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  dica: `{
  "titulo": "frase principal forte e curta (até ~9 palavras) — texto GRANDE da arte",
  "texto": "texto de apoio curto, 1 frase (até ~18 palavras)",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
};

function sistema(marca: Marca, template: Template): string {
  const tel = marca.telefone ? ` Telefone/WhatsApp: ${marca.telefone}.` : "";
  return `Você cria POSTS DE FEED (imagem única) para o Instagram da marca "${marca.nome}". ${
    marca.descricao || "Negócio local."
  }${tel}

Tom: profissional, próximo e confiável. Sem jargão de guru, sem "prezado cliente", no máximo 1 emoji no texto.

Devolva SEMPRE um JSON válido:
${FORMATO_JSON[template]}
Português do Brasil.`;
}

type Gerado = { titulo: string; texto?: string; oferta?: string; validade?: string; selo?: string; diferenciais?: string[]; legenda: string; hashtags: string };

// Templates que usam foto de IA de fundo (os de fundo colorido não geram foto).
const USA_FOTO: Record<Template, boolean> = { promocao: false, "data-comemorativa": true, divulgacao: false, dica: true };

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

async function gerarTexto(marca: Marca, template: Template, tema?: string, travas?: Travas): Promise<Gerado> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  let pedido = tema?.trim()
    ? `${GUIA[template]} Tema/assunto sugerido: "${tema.trim()}".`
    : `${GUIA[template]} Escolha um ângulo novo e útil.`;
  // A oferta/validade digitadas pelo usuário são FIXAS — a IA não pode inventar outras.
  const fixos: string[] = [];
  if (travas?.oferta) fixos.push(`a oferta/desconto é EXATAMENTE "${travas.oferta}"`);
  if (travas?.validade) fixos.push(`a validade/condição é EXATAMENTE "${travas.validade}"`);
  const itensInclui = (travas?.inclui || []).map((s) => s.trim()).filter(Boolean);
  if (itensInclui.length) fixos.push(`a oferta inclui: ${itensInclui.join(", ")}`);
  if (travas?.regras) fixos.push(`as regras/condições são: "${travas.regras}"`);
  const difs = (travas?.diferenciais || []).map((s) => s.trim()).filter(Boolean);
  if (difs.length) fixos.push(`os diferenciais a destacar são EXATAMENTE: ${difs.join(", ")}`);
  if (fixos.length) {
    pedido += ` IMPORTANTE: ${fixos.join("; ")}. Use esses dados sem alterar e escreva o título e a legenda de forma coerente com eles. NÃO invente outros valores, descontos, itens ou condições.`;
  }
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.85,
      messages: [
        { role: "system", content: sistema(marca, template) },
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
  oferta?: string;
  validade?: string;
  inclui?: string[];
  regras?: string;
  diferenciais?: string[];
}) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const template = (TEMPLATES as readonly string[]).includes(input.template) ? input.template : "dica";

  // Cada template fixa só os campos que fazem sentido pra ele (ignorados nos demais).
  let travas: Travas = {};
  if (template === "promocao") {
    travas = {
      oferta: input.oferta?.trim() || undefined,
      validade: input.validade?.trim() || undefined,
      inclui: (input.inclui || []).map((s) => s.trim()).filter(Boolean),
      regras: input.regras?.trim() || undefined,
    };
  } else if (template === "divulgacao") {
    travas = { diferenciais: (input.diferenciais || []).map((s) => s.trim()).filter(Boolean) };
  }

  let gerado: Gerado;
  try {
    gerado = await gerarTexto(marca, template, input.tema, travas);
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
      extra: montarExtra(marca, template, gerado, Date.now(), travas),
      tema: input.tema?.trim() || null,
      status: "a_postar",
    },
  });
  // Só os templates com foto (ex: dica) geram imagem de IA; promoção usa fundo colorido.
  if (USA_FOTO[template]) await gerarImagemPublicacao({ id: criado.id }).catch(() => {});
  revalidatePath(`/painel/marcas/${marca.id}`);
  return { ok: true as const, id: criado.id };
}

export async function regerarPublicacao(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const template: Template = (TEMPLATES as readonly string[]).includes(p.template) ? (p.template as Template) : "dica";

  // Recupera o que o usuário havia fixado pra manter a oferta/validade no regerar.
  let travas: Travas = {};
  try {
    const ex = JSON.parse(p.extra || "{}");
    travas = {
      oferta: ex.ofertaTravada || undefined,
      validade: ex.validadeTravada || undefined,
      inclui: Array.isArray(ex.inclui) ? ex.inclui : [],
      regras: ex.regras || undefined,
      diferenciais: Array.isArray(ex.diferenciaisTravados) ? ex.diferenciaisTravados : [],
    };
  } catch {}

  let gerado: Gerado;
  try {
    gerado = await gerarTexto(p.marca, template, p.tema ?? undefined, travas);
  } catch (e) {
    console.error("Erro ao regerar publicação:", e);
    return { ok: false as const, erro: "Não consegui regerar agora." };
  }
  const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  await prisma.publicacao.update({
    where: { id },
    data: {
      titulo: gerado.titulo || p.titulo,
      texto: gerado.texto || "",
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      extra: montarExtra(p.marca, template, gerado, seed, travas),
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
