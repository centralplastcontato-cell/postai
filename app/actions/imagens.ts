"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca, guardaImagem } from "@/lib/acesso";
import { CATEGORIAS } from "@/lib/categorias-imagem";

// Descreve uma foto em 1 frase curta via IA (VISÃO) — roda UMA vez, no upload. Best-effort
// (se falhar, fica vazia e cai no rodízio normal). A descrição depois casa a foto com o
// texto do post sem precisar pagar "visão" de novo.
async function descreverImagem(url: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !url) return "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 60,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Descreva em 1 frase CURTA (até 8 palavras) o que aparece nesta foto de um buffet infantil, focando no que ajuda a escolher a foto certa pra um post (ex: 'Mesa de doces colorida', 'Crianças no pula-pula', 'Salgados na bandeja', 'Salão decorado com balões'). Só a descrição, sem aspas." },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return ((data.choices?.[0]?.message?.content as string) ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 120);
  } catch {
    return "";
  }
}

export async function adicionarImagemMarca(input: { marcaId: string; url: string; categoria?: string }) {
  const g = await guardaMarca(input.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const url = (input.url || "").trim();
  if (!url) return { ok: false as const, erro: "Foto sem URL." };
  const categoria = (CATEGORIAS as readonly string[]).includes(input.categoria || "") ? input.categoria! : "geral";
  const img = await prisma.imagemMarca.create({ data: { marcaId: input.marcaId, url, categoria } });
  // A IA "olha" a foto UMA vez e descreve (pra casar com o texto na geração). Best-effort.
  const descricao = await descreverImagem(url);
  if (descricao) await prisma.imagemMarca.update({ where: { id: img.id }, data: { descricao } }).catch(() => {});
  revalidatePath(`/painel/marcas/${input.marcaId}`);
  return { ok: true as const, id: img.id, url: img.url, categoria: img.categoria };
}

export async function removerImagemMarca(id: string) {
  const g = await guardaImagem(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const img = await prisma.imagemMarca.findUnique({ where: { id } });
  if (!img) return { ok: false as const, erro: "Imagem não encontrada." };
  await prisma.imagemMarca.delete({ where: { id } });
  revalidatePath(`/painel/marcas/${img.marcaId}`);
  return { ok: true as const };
}

// Escolhe uma foto REAL do banco da marca em RODÍZIO: pega sempre a MENOS usada
// (desempate pela mais antiga), e incrementa o contador. Assim percorre todas as
// fotos uma vez antes de repetir qualquer uma — nada de cair sempre na mesma.
// Tenta a categoria pedida; se ela não tiver fotos, cai pro banco inteiro.
export async function sortearImagemBanco(marcaId: string, categoria?: string): Promise<string | null> {
  // Só sorteia foto de marca que a sessão pode acessar (anti-IDOR — é exportada como
  // server action). Os chamadores internos rodam em sessão já autorizada → passa.
  const g = await guardaMarca(marcaId);
  if (!g.ok) return null;
  const where = categoria && categoria !== "geral" ? { marcaId, categoria } : { marcaId };
  let img = await prisma.imagemMarca.findFirst({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    select: { id: true, url: true },
  });
  if (!img && categoria) {
    img = await prisma.imagemMarca.findFirst({
      where: { marcaId },
      orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
      select: { id: true, url: true },
    });
  }
  if (!img) return null;
  await prisma.imagemMarca.update({ where: { id: img.id }, data: { usos: { increment: 1 } } });
  return img.url;
}

// Pega N fotos DISTINTAS do banco em rodízio (as N menos usadas, desempate pela
// mais antiga) e incrementa o uso de todas de uma vez. Pro Mosaico, que mostra
// várias fotos juntas. Se a categoria pedida não tiver fotos suficientes, completa
// com o banco inteiro. Retorna de 0 a N urls (menos que N se o banco for pequeno).
export async function sortearImagensBanco(marcaId: string, n: number, categoria?: string): Promise<string[]> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return [];
  const where = categoria && categoria !== "geral" ? { marcaId, categoria } : { marcaId };
  let imgs = await prisma.imagemMarca.findMany({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    take: n,
    select: { id: true, url: true },
  });
  if (imgs.length < n) {
    imgs = await prisma.imagemMarca.findMany({
      where: { marcaId },
      orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
      take: n,
      select: { id: true, url: true },
    });
  }
  if (!imgs.length) return [];
  await prisma.imagemMarca.updateMany({ where: { id: { in: imgs.map((i) => i.id) } }, data: { usos: { increment: 1 } } });
  return imgs.map((i) => i.url);
}

// Escolhe a foto do banco que MAIS COMBINA com o texto do post, usando as descrições
// geradas no upload. É uma chamada de TEXTO barata (sem visão). Cai no rodízio normal
// (`sortearImagemBanco`) se não houver texto, descrições suficientes ou chave. Incrementa
// o uso da escolhida (mantém algum rodízio: os candidatos vêm ordenados por menos usado).
export async function escolherImagemPorTexto(marcaId: string, categoria: string | undefined, texto: string): Promise<string | null> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return null;
  const t = (texto || "").trim();
  const where = categoria && categoria !== "geral" ? { marcaId, categoria } : { marcaId };
  const cands = await prisma.imagemMarca.findMany({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    take: 12,
    select: { id: true, url: true, descricao: true },
  });
  const comDesc = cands.filter((c) => c.descricao && c.descricao.trim());
  const key = process.env.OPENAI_API_KEY;
  if (!t || comDesc.length < 2 || !key) return sortearImagemBanco(marcaId, categoria);
  try {
    const lista = comDesc.map((c, i) => `${i + 1}. ${c.descricao}`).join("\n");
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 5,
        temperature: 0,
        messages: [
          { role: "system", content: "Você escolhe a FOTO que melhor ilustra um post. Responda APENAS com o número da opção." },
          { role: "user", content: `Tema do post: "${t}".\nFotos disponíveis:\n${lista}\n\nQual número combina mais? Responda só o número.` },
        ],
      }),
    });
    if (!resp.ok) return sortearImagemBanco(marcaId, categoria);
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content as string) ?? "";
    const n = parseInt((raw.match(/\d+/) || ["0"])[0], 10);
    const escolhida = n >= 1 && n <= comDesc.length ? comDesc[n - 1] : comDesc[0];
    await prisma.imagemMarca.update({ where: { id: escolhida.id }, data: { usos: { increment: 1 } } }).catch(() => {});
    return escolhida.url;
  } catch {
    return sortearImagemBanco(marcaId, categoria);
  }
}

// Descreve as fotos da marca que ainda NÃO têm descrição (as antigas, de antes do recurso).
// Best-effort, limitado por chamada. Devolve quantas descreveu. Disparado pelo backfill.
export async function descreverImagensDaMarca(marcaId: string): Promise<number> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return 0;
  const semDesc = await prisma.imagemMarca.findMany({ where: { marcaId, descricao: "" }, select: { id: true, url: true }, take: 40 });
  let n = 0;
  for (const img of semDesc) {
    const d = await descreverImagem(img.url);
    if (d) {
      await prisma.imagemMarca.update({ where: { id: img.id }, data: { descricao: d } }).catch(() => {});
      n++;
    }
  }
  return n;
}

// Versão server-action da anterior (pra o botão "🎲 Foto do banco" no painel).
export async function sortearImagemBancoAction(marcaId: string, categoria?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const url = await sortearImagemBanco(marcaId, categoria);
  if (!url) return { ok: false as const, erro: "Banco de imagens vazio. Suba fotos reais na aba Configurações." };
  return { ok: true as const, url };
}
