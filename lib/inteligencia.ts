// Inteligência do Postaí — a base que transforma engajamento em ORIENTAÇÃO. Aqui mora a
// régua que mede "isso vende festa?" (não "isso foi popular?") e o classificador que
// etiqueta cada post por categoria de intenção. A análise/agregação visível (o cartão da
// Bia) é construída em cima destas peças. Server-only (usa OpenAI e banco) — NUNCA importar
// num componente de cliente.

import { prisma } from "@/lib/prisma";
import { CATEGORIAS, categoriaDoTemplate, ehCategoria, emojiCategoria, nomeCategoria, type CategoriaId } from "@/lib/categorias";

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

// ───────────────────────────────────────────────────────────────────────────────────
// ANÁLISE — o "raciocínio" que vira a fala da Bia. PURA (sem banco/IA): recebe os posts já
// carregados pela página e devolve os insights prontos pra exibir. Por ser pura, a página
// (servidor) calcula e passa o resultado pronto ao componente (cliente) — sem query extra.
// ───────────────────────────────────────────────────────────────────────────────────

// Prior do NICHO (buffet infantil): o que costuma vender festa quando ainda não há dado
// suficiente da marca. A inteligência começa por aqui e vai corrigindo com os números reais.
const PRIOR_NICHO: CategoriaId[] = ["prova_social", "espaco", "oferta", "sazonal", "institucional", "conteudo"];
const HORAS_NICHO = [12, 20]; // horário de mãe rolando o feed (almoço e depois que a criança dorme)

export type AnaliseInsights = {
  total: number; // posts com categoria + alcance que entraram na conta
  confianca: "aprendendo" | "boa";
  categorias: { id: string; nome: string; emoji: string; taxa: number; pontos: number; n: number }[];
  melhorHora: number | null;
  melhorPost: { titulo: string; emoji: string; nome: string; salvamentos: number; alcance: number } | null;
  prioridade: { id: string; nome: string; emoji: string } | null;
  nicho: { id: string; nome: string; emoji: string }[]; // guia do nicho (modo "aprendendo")
  horasNicho: number[];
  pctAcimaMedia: number | null; // quanto a categoria líder supera a média (modo "boa")
};

type PostAnalise = {
  categoria: string | null;
  curtidas: number | null;
  comentarios: number | null;
  alcance: number | null;
  salvamentos: number | null;
  quando: Date; // postadoEm ?? data
  titulo: string;
};

function horaSP(d: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(d);
  return parseInt(h, 10) || 0;
}

// Cruza categoria × horário × intenção e devolve o que a Bia vai contar. Mistura dado real
// com o prior do nicho: enquanto há poucos posts medidos, fala "tô aprendendo" e usa o nicho;
// quando junta massa, passa a afirmar pelos números da própria marca.
export function analisarEngajamento(posts: PostAnalise[]): AnaliseInsights {
  const nicho = PRIOR_NICHO.slice(0, 3).map((id) => ({ id, nome: nomeCategoria(id), emoji: emojiCategoria(id) }));
  const base: AnaliseInsights = {
    total: 0,
    confianca: "aprendendo",
    categorias: [],
    melhorHora: null,
    melhorPost: null,
    prioridade: nicho[0],
    nicho,
    horasNicho: HORAS_NICHO,
    pctAcimaMedia: null,
  };

  // Só posts com categoria + alcance confiável entram (alcance baixo = ruído demais).
  const validos = posts.filter((p) => p.categoria && typeof p.alcance === "number" && (p.alcance ?? 0) >= 25);
  base.total = validos.length;
  if (validos.length === 0) return base;

  const grupos = new Map<string, { pontos: number; alcance: number; n: number }>();
  const horas = new Map<number, { pontos: number; alcance: number }>();
  let pontosGlobal = 0;
  let alcanceGlobal = 0;
  let melhor: { titulo: string; cat: string; salv: number; alc: number; pts: number } | null = null;

  for (const p of validos) {
    const pts = (p.salvamentos ?? 0) * PESOS.salvamento + (p.comentarios ?? 0) * PESOS.comentario + (p.curtidas ?? 0) * PESOS.curtida;
    const alc = p.alcance ?? 0;
    const cat = p.categoria!;
    const g = grupos.get(cat) ?? { pontos: 0, alcance: 0, n: 0 };
    g.pontos += pts;
    g.alcance += alc;
    g.n += 1;
    grupos.set(cat, g);
    const h = horaSP(p.quando);
    const hb = horas.get(h) ?? { pontos: 0, alcance: 0 };
    hb.pontos += pts;
    hb.alcance += alc;
    horas.set(h, hb);
    pontosGlobal += pts;
    alcanceGlobal += alc;
    if (!melhor || pts > melhor.pts) melhor = { titulo: p.titulo, cat, salv: p.salvamentos ?? 0, alc, pts };
  }

  // Taxa de intenção PONDERADA por categoria (pontos totais / alcance total × 100) — assim
  // posts grandes e pequenos se comparam com justiça.
  base.categorias = [...grupos.entries()]
    .map(([id, g]) => ({ id, nome: nomeCategoria(id), emoji: emojiCategoria(id), taxa: (g.pontos / g.alcance) * 100, pontos: g.pontos, n: g.n }))
    .sort((a, b) => b.taxa - a.taxa);

  // Melhor horário (só baldes com alcance suficiente).
  let melhorHora: number | null = null;
  let melhorTaxaHora = -1;
  for (const [h, v] of horas) {
    if (v.alcance >= 25) {
      const t = v.pontos / v.alcance;
      if (t > melhorTaxaHora) {
        melhorTaxaHora = t;
        melhorHora = h;
      }
    }
  }
  base.melhorHora = melhorHora;

  if (melhor) base.melhorPost = { titulo: melhor.titulo, emoji: emojiCategoria(melhor.cat), nome: nomeCategoria(melhor.cat), salvamentos: melhor.salv, alcance: melhor.alc };

  const taxaMedia = alcanceGlobal > 0 ? (pontosGlobal / alcanceGlobal) * 100 : 0;
  if (base.categorias.length >= 2 && taxaMedia > 0) {
    const pct = Math.round((base.categorias[0].taxa / taxaMedia - 1) * 100);
    base.pctAcimaMedia = pct > 0 ? pct : null;
  }

  // Confiança "boa" só quando há massa pra comparar categorias com firmeza.
  base.confianca = validos.length >= 6 && base.categorias.length >= 2 ? "boa" : "aprendendo";
  // O que priorizar: a líder REAL quando confiável; senão segue o topo do nicho.
  base.prioridade = base.confianca === "boa" ? { id: base.categorias[0].id, nome: base.categorias[0].nome, emoji: base.categorias[0].emoji } : nicho[0];
  return base;
}

// Categoria → template de feed que melhor a representa (pro botão "Usar essa ideia" já
// deixar o gerador no formato certo).
const CATEGORIA_TEMPLATE: Record<CategoriaId, string> = {
  espaco: "mosaico",
  prova_social: "feedback",
  oferta: "promocao",
  institucional: "divulgacao",
  sazonal: "data-comemorativa",
  conteudo: "dica",
};

export type SugestaoBia = { categoria: string; emoji: string; nome: string; motivo: string; template: string };

// A Bia decide O QUE sugerir como próximo post — onde o loop deixa de observar e AGE.
// Combina três sinais: (1) valor da categoria (número real quando confiável, senão o prior
// do nicho), (2) recência (faz tempo que não posta isso?), (3) nunca-postou (variedade).
// Roda no servidor (página) — Date.now() é permitido aqui.
export function sugerirProximoPost(postados: { categoria: string | null; postadoEm: Date }[], analise: AnaliseInsights): SugestaoBia | null {
  const agora = Date.now();
  // Dias desde o último post de cada categoria (ausente = nunca postou).
  const ultimoDias = new Map<string, number>();
  for (const p of postados) {
    if (!p.categoria) continue;
    const dias = (agora - p.postadoEm.getTime()) / 86_400_000;
    const atual = ultimoDias.get(p.categoria);
    if (atual === undefined || dias < atual) ultimoDias.set(p.categoria, dias);
  }

  const maxTaxa = analise.categorias[0]?.taxa || 1;
  const taxaPorId = new Map(analise.categorias.map((c) => [c.id, c.taxa]));
  const valorDe = (id: CategoriaId): number => {
    if (analise.confianca === "boa" && taxaPorId.has(id)) return Math.max(0.2, taxaPorId.get(id)! / maxTaxa);
    const idx = PRIOR_NICHO.indexOf(id);
    return idx < 0 ? 0.3 : (PRIOR_NICHO.length - idx) / PRIOR_NICHO.length;
  };

  let melhor: { id: CategoriaId; score: number; dias: number } | null = null;
  for (const id of PRIOR_NICHO) {
    const dias = ultimoDias.has(id) ? ultimoDias.get(id)! : 60; // nunca postou = bem "atrasado"
    const recencia = 1 + Math.min(dias, 21) / 21; // até dobra o peso após ~3 semanas sem postar
    const score = valorDe(id) * recencia;
    if (!melhor || score > melhor.score) melhor = { id, score, dias };
  }
  if (!melhor) return null;

  const id = melhor.id;
  const ehLiderReal = analise.confianca === "boa" && analise.categorias[0]?.id === id;
  const nuncaPostou = !ultimoDias.has(id);
  const diasInt = Math.round(melhor.dias);

  const partes: string[] = [];
  if (ehLiderReal) partes.push("é o que mais desperta vontade de fechar festa no seu perfil");
  if (nuncaPostou) partes.push("e você ainda não tem nenhum post assim");
  else if (diasInt >= 7) partes.push(`faz ${diasInt} dias que você não posta isso`);
  if (partes.length === 0) partes.push("costuma vender bem pro seu público");
  let motivo = partes.join(" — ");
  motivo = motivo.charAt(0).toUpperCase() + motivo.slice(1);

  return { categoria: id, emoji: emojiCategoria(id), nome: nomeCategoria(id), motivo, template: CATEGORIA_TEMPLATE[id] };
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
