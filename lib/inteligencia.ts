// Inteligência do Postaí — a base que transforma engajamento em ORIENTAÇÃO. Aqui mora a
// régua que mede "isso vende festa?" (não "isso foi popular?") e o classificador que
// etiqueta cada post por categoria de intenção. A análise/agregação visível (o cartão da
// Bia) é construída em cima destas peças. Server-only (usa OpenAI e banco) — NUNCA importar
// num componente de cliente.

import { prisma } from "@/lib/prisma";
import { CATEGORIAS, categoriaDoTemplate, ehCategoria, type CategoriaId } from "@/lib/categorias";

// PESOS DE INTENÇÃO DE COMPRA — a régua que mira em FESTA, não em vaidade.
// Salvar ("vou guardar pra decidir/fechar") é o sinal mais forte; comentar (muitas vezes
// "quanto custa?", "tem data X?") vem logo atrás; curtir é só simpatia. Alcance NÃO entra
// como mérito — é só quantas pessoas viram (o denominador da taxa, abaixo).
export const PESOS = { salvamento: 4, comentario: 3, curtida: 1 } as const;

type EngajaPost = {
  curtidas: number | null;
  comentarios: number | null;
  alcance: number | null;
  salvamentos: number | null;
};

// Pontos de intenção (ABSOLUTO): soma ponderada das ações que sinalizam compra.
export function pontosIntencao(p: EngajaPost): number {
  return (
    (p.salvamentos ?? 0) * PESOS.salvamento +
    (p.comentarios ?? 0) * PESOS.comentario +
    (p.curtidas ?? 0) * PESOS.curtida
  );
}

// Taxa de intenção: pontos por 100 pessoas ALCANÇADAS. Normaliza posts de tamanhos
// diferentes (um post que chegou a 1000 e outro a 100 ficam comparáveis) — é assim que a
// inteligência compara categorias com justiça. Devolve null quando o alcance é pequeno
// demais pra ser confiável (poucas pessoas = muito ruído pra tirar conclusão).
export function taxaIntencao(p: EngajaPost, alcanceMin = 25): number | null {
  const alc = p.alcance ?? 0;
  if (alc < alcanceMin) return null;
  return (pontosIntencao(p) / alc) * 100;
}

// Classifica textos de post numa das CATEGORIAS de intenção, via IA, em LOTE (uma única
// chamada pra vários itens — barato). Best-effort: o que não der, simplesmente não volta
// no mapa (fica sem categoria e o próximo backfill tenta de novo). Determinístico
// (temperature 0) pra a mesma legenda cair sempre na mesma categoria.
export async function classificarCategoriasIA(
  itens: { ref: string; texto: string }[],
): Promise<Record<string, CategoriaId>> {
  const out: Record<string, CategoriaId> = {};
  const key = process.env.OPENAI_API_KEY;
  if (!key || itens.length === 0) return out;

  const catalogo = CATEGORIAS.map((c) => `- ${c.id}: ${c.rotulo} — ${c.desc}`).join("\n");
  const linhas = itens
    .map((it, i) => `${i + 1}. ${it.texto.replace(/\s+/g, " ").trim().slice(0, 280)}`)
    .join("\n");
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Você classifica posts do Instagram de um BUFFET INFANTIL na CATEGORIA de intenção de marketing mais adequada. Categorias possíveis (use exatamente o id):\n${catalogo}\nResponda só com JSON no formato {"itens":[{"n":1,"categoria":"espaco"},{"n":2,"categoria":"oferta"}]} — um item por post, na mesma ordem.`,
          },
          { role: "user", content: linhas },
        ],
      }),
    });
    if (!resp.ok) return out;
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      itens?: { n?: number; categoria?: string }[];
    };
    for (const r of j.itens ?? []) {
      const idx = (r.n ?? 0) - 1;
      if (idx >= 0 && idx < itens.length && ehCategoria(r.categoria)) out[itens[idx].ref] = r.categoria;
    }
  } catch {
    /* best-effort */
  }
  return out;
}

// Preenche a categoria dos posts da marca que ainda estão SEM ela. Feed (Publicacao): direto
// do template, sem IA. Carrossel (Conteudo): pela IA, lendo tema/título/legenda, em lotes.
// Idempotente — só toca no que está null, então pode rodar quantas vezes quiser. Devolve
// quantos posts foram classificados nesta passada.
export async function classificarCategoriasFaltantes(marcaId: string): Promise<number> {
  let n = 0;

  // FEED — determinístico pelo template (instantâneo).
  const pubs = await prisma.publicacao.findMany({
    where: { marcaId, categoria: null },
    select: { id: true, template: true },
  });
  for (const p of pubs) {
    await prisma.publicacao.update({ where: { id: p.id }, data: { categoria: categoriaDoTemplate(p.template) } });
    n++;
  }

  // CARROSSEL — via IA, em lotes de 20 (uma chamada por lote).
  const cars = await prisma.conteudo.findMany({
    where: { marcaId, categoria: null },
    select: { id: true, tema: true, titulo: true, legenda: true },
  });
  for (let i = 0; i < cars.length; i += 20) {
    const lote = cars.slice(i, i + 20);
    const mapa = await classificarCategoriasIA(
      lote.map((c) => ({ ref: c.id, texto: `${c.tema || c.titulo}. ${c.legenda}` })),
    );
    for (const c of lote) {
      const cat = mapa[c.id];
      if (cat) {
        await prisma.conteudo.update({ where: { id: c.id }, data: { categoria: cat } });
        n++;
      }
    }
  }
  return n;
}
