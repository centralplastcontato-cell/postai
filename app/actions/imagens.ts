"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca, guardaImagem } from "@/lib/acesso";
import { CATEGORIAS } from "@/lib/categorias-imagem";
import { descreverImagem } from "@/lib/imagem-ia";
import { fotosDivulgaveis } from "@/lib/fotos-divulgaveis";
import { ranquearPorTema } from "@/lib/selecao-fotos";

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

// Edita uma foto do banco: a DESCRIÇÃO (que a IA usa pra casar com o texto) e/ou a CATEGORIA.
// Útil pra corrigir uma descrição que a IA errou ou recategorizar uma foto.
export async function atualizarImagemMarca(input: { id: string; descricao?: string; categoria?: string }) {
  const g = await guardaImagem(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const data: { descricao?: string; categoria?: string } = {};
  if (typeof input.descricao === "string") data.descricao = input.descricao.trim().slice(0, 300);
  if (input.categoria && (CATEGORIAS as readonly string[]).includes(input.categoria)) data.categoria = input.categoria;
  if (!Object.keys(data).length) return { ok: true as const };
  const img = await prisma.imagemMarca.update({ where: { id: input.id }, data, select: { marcaId: true } });
  revalidatePath(`/painel/marcas/${img.marcaId}`);
  return { ok: true as const };
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

// Filtro de DIVULGAÇÃO (LGPD): só entram nos posts as fotos LIBERADAS — as soltas (sem festa)
// OU de festa com uso de imagem AUTORIZADO. Festa pendente/negada nunca vira post público.
const PODE_DIVULGAR = { OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] };

// Escolhe uma foto REAL do banco da marca em RODÍZIO: pega sempre a MENOS usada
// (desempate pela mais antiga), e incrementa o contador. Assim percorre todas as
// fotos uma vez antes de repetir qualquer uma — nada de cair sempre na mesma.
// Tenta a categoria pedida; se ela não tiver fotos, cai pro banco inteiro.
export async function sortearImagemBanco(marcaId: string, categoria?: string): Promise<string | null> {
  // Só sorteia foto de marca que a sessão pode acessar (anti-IDOR — é exportada como
  // server action). Os chamadores internos rodam em sessão já autorizada → passa.
  const g = await guardaMarca(marcaId);
  if (!g.ok) return null;
  const where = categoria && categoria !== "geral" ? { marcaId, categoria, ...PODE_DIVULGAR } : { marcaId, ...PODE_DIVULGAR };
  let img = await prisma.imagemMarca.findFirst({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    select: { id: true, url: true },
  });
  if (!img && categoria) {
    img = await prisma.imagemMarca.findFirst({
      where: { marcaId, ...PODE_DIVULGAR },
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
  const where = categoria && categoria !== "geral" ? { marcaId, categoria, ...PODE_DIVULGAR } : { marcaId, ...PODE_DIVULGAR };
  let imgs = await prisma.imagemMarca.findMany({
    where,
    orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
    take: n,
    select: { id: true, url: true },
  });
  if (imgs.length < n) {
    imgs = await prisma.imagemMarca.findMany({
      where: { marcaId, ...PODE_DIVULGAR },
      orderBy: [{ usos: "asc" }, { criadoEm: "asc" }],
      take: n,
      select: { id: true, url: true },
    });
  }
  if (!imgs.length) return [];
  await prisma.imagemMarca.updateMany({ where: { id: { in: imgs.map((i) => i.id) } }, data: { usos: { increment: 1 } } });
  return imgs.map((i) => i.url);
}

// Escolhe a foto do banco que MAIS COMBINA com o texto do post: primeiro CAÇA no acervo
// inteiro as que falam do assunto (ranquearPorTema, pelas descrições da IA-visão — a
// categoria do banco é ruidosa), depois a IA escolhe entre as melhores. Chamada de TEXTO
// barata (sem visão). Cai no rodízio (`sortearImagemBanco`) sem texto/descrições/chave.
export async function escolherImagemPorTexto(marcaId: string, categoria: string | undefined, texto: string): Promise<string | null> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return null;
  const t = (texto || "").trim();
  const acervo = await fotosDivulgaveis(marcaId, { comDescricao: true, limite: 1000 });
  const alvo = categoria && categoria !== "geral" ? `${t} ${categoria}` : t;
  const comDesc = t ? ranquearPorTema(acervo, alvo, 12).fotos.slice(0, 20) : acervo.slice(0, 12);
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
          { role: "system", content: "Você escolhe a FOTO que melhor VENDE um post de buffet de festas infantis. Responda APENAS com o número da opção." },
          { role: "user", content: `Tema do post: "${t}".\nFotos disponíveis:\n${lista}\n\nQual número combina mais com o tema E vende melhor? Prefira cena de ambiente, decoração, mesa/comida ou brinquedos; evite retrato/close de rosto e foto posada, a menos que o tema peça pessoas. Responda só o número.` },
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

// Escolhe as N fotos do banco que MELHOR ilustram um tema. Duas etapas:
//  1) CAÇA no acervo INTEIRO as fotos cuja DESCRIÇÃO fala do assunto (ranquearPorTema) — a
//     categoria do banco é ruidosa (tem foto de mesa de bolo marcada como "espaco"), então o
//     que manda é a descrição que a IA-visão escreveu no upload;
//  2) a IA escolhe e ordena entre as candidatas do tema.
// É o FOTO-PRIMEIRO do carrossel/mosaico: as escolhidas viram o guia dos slides e o texto de
// cada um é escrito SOBRE a foto dele. Devolve [] sem descrições/chave (o chamador cai no
// fluxo antigo). Incrementa o uso das escolhidas (mantém o rodízio honesto).
export async function escolherImagensPorTema(
  marcaId: string,
  categoria: string | undefined,
  tema: string,
  n: number,
): Promise<{ url: string; descricao: string }[]> {
  const g = await guardaMarca(marcaId);
  if (!g.ok || n < 1) return [];
  // Acervo divulgável inteiro (rodízio na ordem), ranqueado pelo tema. A `categoria` pedida
  // pelo chamador entra como empurrãozinho no ranking — não como filtro rígido (ela erra).
  const acervo = await fotosDivulgaveis(marcaId, { comDescricao: true, limite: 1000 });
  if (!acervo.length) return [];
  const alvo = categoria && categoria !== "geral" ? `${tema} ${categoria}` : tema;
  const { fotos: doTema } = ranquearPorTema(acervo, alvo, Math.max(n * 3, 18));
  const comDesc = doTema.slice(0, 40);
  const key = process.env.OPENAI_API_KEY;
  if (!comDesc.length || !key) return [];
  // Preferência: a ordem da IA (mais ligada ao tema primeiro); sem IA, a fila do rodízio.
  let prefs = comDesc;
  if (comDesc.length > n && (tema || "").trim()) {
    try {
      const lista = comDesc.map((c, i) => `${i + 1}. ${c.descricao}`).join("\n");
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0,
          messages: [
            { role: "system", content: "Você escolhe as fotos de um POST DE VENDA de um buffet de festas infantis no Instagram. Responda APENAS com JSON." },
            {
              role: "user",
              content: `Tema do post: "${tema.trim()}".\nFotos disponíveis:\n${lista}\n\nEscolha as ${n} fotos que melhor VENDEM esse tema, da mais ligada à menos ligada:\n- a foto tem que MOSTRAR o assunto do tema (se o tema fala de brinquedos, a foto tem brinquedo aparecendo — não basta ter criança feliz);\n- o que vende é o PRODUTO aparecer: prefira cenas de ambiente, decoração, mesa/comida e brinquedos a retrato/close de rosto e foto posada de família;\n- cada foto de uma CENA bem diferente (nunca duas parecidas).\nSem repetir. Responda só com JSON: {"fotos":[números]}`,
            },
          ],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { fotos?: number[] };
        const vistos = new Set<number>();
        const porIA = (j.fotos ?? [])
          .filter((x) => Number.isInteger(x) && x >= 1 && x <= comDesc.length && !vistos.has(x) && (vistos.add(x) || true))
          .map((x) => comDesc[x - 1]);
        // Completa com as restantes do rodízio — vêm com descrição, então o texto do
        // slide delas também nasce da foto (nunca fica órfão).
        if (porIA.length) prefs = [...porIA, ...comDesc.filter((c) => !porIA.includes(c))];
      }
    } catch (e) {
      console.error("Erro ao escolher fotos por tema:", e);
    }
  }
  // Espalha entre FESTAS: 1º uma foto por festa, depois admite 2, e só libera o teto se o
  // banco for pequeno — post com todas as fotos da mesma festa parece álbum de família.
  const escolhidas: typeof comDesc = [];
  const porFesta = new Map<string, number>();
  for (const teto of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const c of prefs) {
      if (escolhidas.length >= n) break;
      if (escolhidas.includes(c)) continue;
      if (c.festaId && (porFesta.get(c.festaId) ?? 0) >= teto) continue;
      escolhidas.push(c);
      if (c.festaId) porFesta.set(c.festaId, (porFesta.get(c.festaId) ?? 0) + 1);
    }
    if (escolhidas.length >= n) break;
  }
  await prisma.imagemMarca
    .updateMany({ where: { id: { in: escolhidas.map((e) => e.id) } }, data: { usos: { increment: 1 } } })
    .catch(() => {});
  return escolhidas.map((e) => ({ url: e.url, descricao: e.descricao }));
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

export type ImagemBanco = { id: string; url: string; categoria: string; descricao: string };

// Lista as fotos LIBERADAS (LGPD) do banco da marca pro SELETOR VISUAL — o dono vê TODAS e
// escolhe na mão (não fica girando até achar). Se vier `texto` (o conteúdo do post/slide),
// as fotos que MAIS COMBINAM com ele aparecem primeiro: pontua por palavras em comum entre o
// texto e a descrição da foto (a descrição é gerada pela IA no upload). Sem custo de IA aqui —
// a ordenação é instantânea; o usuário decide.
export async function imagensDoBanco(
  marcaId: string,
  texto?: string,
): Promise<{ ok: false; erro: string } | { ok: true; imagens: ImagemBanco[] }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  // NÃO usar o join PODE_DIVULGAR aqui: com muitas fotos ele ficava LENTÍSSIMO (10-55s no
  // Supabase). Busca as imagens e as festas autorizadas em PARALELO (queries simples, rápidas)
  // e filtra a divulgação no código (foto solta OU de festa autorizada).
  const [imgs, festasOk] = await Promise.all([
    prisma.imagemMarca.findMany({
      where: { marcaId },
      orderBy: [{ usos: "asc" }, { criadoEm: "desc" }],
      select: { id: true, url: true, categoria: true, descricao: true, festaId: true },
      take: 400,
    }),
    prisma.festa.findMany({ where: { marcaId, autorizacao: "autorizada" }, select: { id: true } }),
  ]);
  const okFesta = new Set(festasOk.map((f) => f.id));
  const imagens: ImagemBanco[] = imgs
    .filter((i) => !i.festaId || okFesta.has(i.festaId))
    .map((i) => ({ id: i.id, url: i.url, categoria: i.categoria, descricao: i.descricao || "" }));
  const t = (texto || "").toLowerCase();
  if (t.trim()) {
    const palavras = Array.from(new Set(t.split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 4)));
    const score = (desc: string) => { const d = desc.toLowerCase(); return palavras.reduce((s, w) => (d.includes(w) ? s + 1 : s), 0); };
    imagens.sort((a, b) => score(b.descricao) - score(a.descricao)); // estável: empate mantém ordem (menos usadas/recentes)
  }
  return { ok: true as const, imagens };
}
