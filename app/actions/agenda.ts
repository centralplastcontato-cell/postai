"use server";

import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { paletaDaMarca } from "@/lib/arte";
import { corFundoDoItem } from "@/lib/tons";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { analisarEngajamento, sugerirProximoPost, type AnaliseInsights } from "@/lib/inteligencia";
import { gerarCarrossel } from "@/app/actions/marketing";
import { gerarPublicacao } from "@/app/actions/feed";
import type { Template } from "@/lib/feed-templates";

// PREENCHER AGENDA: o dono seleciona dias no calendário e a BIA monta um plano editorial
// coeso. A regra de ouro é FOTO-PRIMEIRO: a Bia lê as DESCRIÇÕES das fotos reais da marca,
// ESCOLHE as fotos de cada item e escreve o tema SOBRE o que elas mostram — nunca o
// contrário (texto no escuro + foto sorteada = post sem pé nem cabeça). A inteligência:
//   1. O QUE criar: as categorias de marketing seguem o que MAIS VENDE FESTA nos números
//      reais da marca (o mesmo cérebro do cartão da Bia) + a sugestão de próximo post.
//   2. FOTO → TEXTO: cada item já sai do plano com as fotos definidas (número a número), e
//      o gerador escreve título/texto/slides casando com o que cada foto mostra.
//   3. Campanha, não posts soltos: UMA chamada de IA planeja o lote inteiro — temas que se
//      complementam, sem repetir ângulo, categoria em dias vizinhos nem foto no lote.
// Duas etapas (mesmo padrão da semana do teste, pra nenhuma chamada estourar o tempo):
//   planejarPreenchimento(dias) → valida os dias e devolve o PLANO da Bia;
//   gerarItemAgenda(item) → o navegador chama UMA vez por item, com barra de progresso.

// Teto de artes por rodada — segura o tempo e o custo de IA (dá pra rodar de novo se quiser mais).
const MAX_ITENS = 14;
// Quantas fotos entram no "olhar" da Bia por lote (as menos usadas primeiro — rodízio).
const MAX_FOTOS_PLANO = 80;
// Fotos por carrossel: 1 de capa + até 4 de conteúdo (cada slide fala da sua foto).
const FOTOS_POR_CARROSSEL = 5;

export type FotoPlanejada = { id: string; url: string; descricao: string };

export type ItemAgenda = {
  dia: string; // YYYY-MM-DD
  tipo: "carrossel" | "feed";
  tema: string;
  categoria: string; // categoria de MARKETING escolhida pela Bia (espaco|conteudo|...)
  categoriaFoto: string; // categoria de FOTO de apoio (fallback do rodízio quando faltar foto planejada)
  fotos: FotoPlanejada[]; // as fotos REAIS escolhidas pela Bia pra ESTE item (texto nasce delas)
  template?: Template; // só feed (derivado da categoria — não confiamos no texto da IA)
  estiloCapa?: string; // só carrossel, usado quando NÃO há fotos planejadas
  indice: number; // posição no lote (variação do tom de cor)
  rotulo: string; // ex: "qua. 09/07 · 🖼️ Carrossel"
  recriar?: boolean; // substituir: apaga a versão A POSTAR desse dia antes de gerar a nova
};

// Categorias de marketing SEGURAS pra geração automática — nunca inventa oferta, preço nem
// depoimento (o piloto posta sem revisão humana; esses o dono cria à mão).
const CATEGORIAS_AUTO = ["espaco", "institucional", "conteudo", "interacao", "sazonal"] as const;
type CategoriaAuto = (typeof CATEGORIAS_AUTO)[number];

// Categoria de marketing → template de feed (o mesmo mapa do cartão da Bia, versão segura:
// espaco usa mosaico SÓ com fotos suficientes — o planejar checa e rebaixa pra divulgacao).
const TEMPLATE_POR_CATEGORIA: Record<CategoriaAuto, Template> = {
  espaco: "mosaico",
  institucional: "divulgacao",
  conteudo: "dica",
  interacao: "enquete",
  sazonal: "data-comemorativa",
};

// Quantas fotos o plano escolhe pra cada template de feed: mosaico e divulgação têm arte
// própria (fotos por rodízio de categoria / cor sólida); os demais levam 1 foto de fundo.
function fotosDoFeed(template: Template): number {
  return template === "mosaico" || template === "divulgacao" ? 0 : 1;
}

// Estilo de CAPA do carrossel quando NÃO há fotos planejadas (fallback).
const CAPA_POR_CATEGORIA: Record<CategoriaAuto, string> = {
  espaco: "mosaico",
  institucional: "foto",
  conteudo: "moldura",
  interacao: "festiva",
  sazonal: "festiva",
};

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

// Dia da semana (0=dom…6=sáb) de um YYYY-MM-DD — sem fuso, o calendário já manda a chave BRT.
function diaDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function rotuloDoDia(ymd: string, tipo: "carrossel" | "feed"): string {
  const label = new Date(`${ymd}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  return `${label} · ${tipo === "carrossel" ? "🖼️ Carrossel" : "📱 Post de feed"}`;
}

// Chave BRT (YYYY-MM-DD) de um Date — pra comparar com os dias do calendário.
function chaveBRT(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Filtro de DIVULGAÇÃO (LGPD) — igual ao do banco de imagens: foto solta OU festa autorizada.
const PODE_DIVULGAR = { OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] };

// --- Fotos "quase iguais" (a mesma cena fotografada várias vezes no álbum) -----------------
// O banco tem rajadas de fotos da mesma cena; num carrossel elas parecem FOTO REPETIDA.
// Comparamos as DESCRIÇÕES: palavras significativas (4+ letras, sem acento)...
function palavrasDesc(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
  );
}
// ...e 70%+ de palavras em comum = mesma cena → só UMA entra no cardápio do plano.
function mesmaCena(a: string, b: string): boolean {
  const A = palavrasDesc(a);
  const B = palavrasDesc(b);
  if (!A.size || !B.size) return false;
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  return comum / Math.min(A.size, B.size) >= 0.7;
}

type Slot = { dia: string; tipo: "carrossel" | "feed"; comemorativa?: string; recriar?: boolean };
type FotoPool = { id: string; url: string; categoria: string; descricao: string };
type PlanoItem = { categoria: CategoriaAuto; tema: string; fotos: FotoPool[] };

// O CÉREBRO da Bia pro plano: mesma conta do cartão dela (números reais quando há massa;
// senão o guia do nicho) + a sugestão de próximo post. Tudo lido do banco aqui no servidor.
async function cerebroDaBia(marcaId: string, intelHistorico: unknown) {
  const [conteudos, pubs] = await Promise.all([
    prisma.conteudo.findMany({
      where: { marcaId },
      select: { categoria: true, curtidas: true, comentarios: true, alcance: true, salvamentos: true, postadoEm: true, data: true, titulo: true },
      orderBy: { data: "desc" },
      take: 150,
    }),
    prisma.publicacao.findMany({
      where: { marcaId, formato: { not: "story" } },
      select: { categoria: true, curtidas: true, comentarios: true, alcance: true, salvamentos: true, postadoEm: true, data: true, titulo: true },
      orderBy: { data: "desc" },
      take: 150,
    }),
  ]);
  const todos = [...conteudos, ...pubs];
  const analiseLocal = analisarEngajamento(todos.map((p) => ({ categoria: p.categoria, curtidas: p.curtidas, comentarios: p.comentarios, alcance: p.alcance, salvamentos: p.salvamentos, quando: p.postadoEm ?? p.data, titulo: p.titulo })));
  // Quando a Bia já estudou o feed (histórico cacheado na marca) e ele mede mais posts, vale ele.
  const intel = intelHistorico as AnaliseInsights | null;
  const analise = intel && typeof intel.total === "number" && intel.total >= analiseLocal.total ? intel : analiseLocal;
  const sugestao = sugerirProximoPost(
    todos.filter((p) => p.postadoEm).map((p) => ({ categoria: p.categoria, postadoEm: p.postadoEm as Date })),
    analise,
  );
  return { analise, sugestao };
}

// Quantas fotos cada slot pede (pra instruir e validar o plano).
function fotosDoSlot(s: Slot, categoria: CategoriaAuto): number {
  if (s.tipo === "carrossel") return FOTOS_POR_CARROSSEL;
  return fotosDoFeed(categoria === "espaco" ? "mosaico" : TEMPLATE_POR_CATEGORIA[categoria]);
}

// Plano da Bia (FOTO-PRIMEIRO): UMA chamada de IA pro lote inteiro. A Bia recebe as fotos
// reais NUMERADAS (com o que cada uma mostra), escolhe as fotos de cada item e escreve o
// tema sobre ELAS. Se a IA falhar, cai num plano reserva (fotos em sequência de rodízio +
// temas por categoria) — o lote nunca trava, e os slides ainda casam com as fotos (o
// gerador escreve sobre a foto de cada slide).
async function planoDaBia(
  marca: { nome: string; descricao: string },
  slots: Slot[],
  cerebro: Awaited<ReturnType<typeof cerebroDaBia>>,
  pool: FotoPool[],
  evitar: string,
): Promise<PlanoItem[]> {
  // Distribui fotos SEM repetir no lote: cada índice do pool só sai uma vez.
  const usadas = new Set<number>();
  const pegaPorIndices = (idxs: number[], max: number): FotoPool[] => {
    const out: FotoPool[] = [];
    for (const n of idxs) {
      const i = n - 1; // a Bia numera de 1
      if (i >= 0 && i < pool.length && !usadas.has(i) && out.length < max) {
        usadas.add(i);
        out.push(pool[i]);
      }
    }
    return out;
  };
  const pegaProximas = (max: number, categoriaPreferida?: string): FotoPool[] => {
    const out: FotoPool[] = [];
    // Primeiro tenta a categoria preferida; depois completa com qualquer uma.
    for (const passa of [true, false]) {
      for (let i = 0; i < pool.length && out.length < max; i++) {
        if (usadas.has(i)) continue;
        if (passa && categoriaPreferida && pool[i].categoria !== categoriaPreferida) continue;
        usadas.add(i);
        out.push(pool[i]);
      }
      if (out.length >= max || !categoriaPreferida) break;
    }
    return out;
  };

  // Plano RESERVA (sem IA): categorias no ranking da Bia + fotos na fila do rodízio.
  const FALLBACK_TEMA: Record<CategoriaAuto, string> = {
    espaco: "Tour pelo nosso espaço por dentro",
    institucional: "O que faz a nossa festa ser diferente",
    conteudo: "Dica prática pra quem está planejando a festa",
    interacao: "Enquete divertida pra festa perfeita",
    sazonal: "Clima de comemoração no nosso espaço",
  };
  const FALLBACK_FOTO: Record<CategoriaAuto, string> = { espaco: "espaco", institucional: "geral", conteudo: "geral", interacao: "brinquedos", sazonal: "festa" };
  const ranque = [
    ...(cerebro.sugestao && (CATEGORIAS_AUTO as readonly string[]).includes(cerebro.sugestao.categoria) ? [cerebro.sugestao.categoria as CategoriaAuto] : []),
    ...cerebro.analise.categorias.map((c) => c.id as CategoriaAuto).filter((id) => (CATEGORIAS_AUTO as readonly string[]).includes(id)),
    ...CATEGORIAS_AUTO,
  ];
  const ordem = [...new Set(ranque)];
  const reserva = (): PlanoItem[] =>
    slots.map((s, i) => {
      const cat = s.comemorativa ? "sazonal" : ordem[i % ordem.length];
      return { categoria: cat, tema: s.comemorativa || FALLBACK_TEMA[cat], fotos: pegaProximas(fotosDoSlot(s, cat), FALLBACK_FOTO[cat]) };
    });

  const key = process.env.OPENAI_API_KEY;
  if (!key || !pool.length) return reserva();

  // O que a Bia sabe, em texto pro planner.
  const numeros = cerebro.analise.categorias.length
    ? cerebro.analise.categorias.slice(0, 5).map((c, i) => `${i + 1}º ${c.nome} (taxa de intenção ${c.taxa.toFixed(1)}, ${c.n} posts)`).join("; ")
    : "ainda sem números próprios — siga o guia do nicho: " + cerebro.analise.nicho.map((n) => n.nome).join(", ");
  const sugestaoTxt = cerebro.sugestao ? `${cerebro.sugestao.nome} — ${cerebro.sugestao.motivo}` : "sem sugestão no momento";
  const fotosTxt = pool.map((f, i) => `${i + 1}. [${f.categoria}] ${f.descricao}`).join("\n");
  const slotsTxt = slots
    .map((s, i) => {
      const qtd = s.tipo === "carrossel" ? `escolha ${FOTOS_POR_CARROSSEL} fotos (1ª = capa)` : `escolha 1 foto (ou 0 se a categoria for espaco/institucional)`;
      return `${i + 1}. ${rotuloDoDia(s.dia, s.tipo)} — ${qtd}${s.comemorativa ? ` — é ${s.comemorativa}: o tema DEVE ser sobre essa data (categoria "sazonal")` : ""}`;
    })
    .join("\n");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: `Você é a Bia, estrategista de conteúdo da marca "${marca.nome}". ${marca.descricao || "Negócio local."} Você monta um PLANO EDITORIAL coeso pra agenda do Instagram. REGRA DE OURO — FOTO-PRIMEIRO: você só pode usar as fotos listadas; primeiro escolha as fotos de cada item, depois escreva o tema SOBRE o que elas mostram. É PROIBIDO propor tema que as fotos escolhidas não mostram (ex: nunca proponha "festa de dinossauros" se nenhuma foto mostra dinossauros). Português do Brasil.`,
          },
          {
            role: "user",
            content: `O QUE MAIS DESPERTA INTENÇÃO DE FECHAR FESTA nesta marca (dados reais): ${numeros}.
PRÓXIMO POST SUGERIDO: ${sugestaoTxt}.

FOTOS REAIS DISPONÍVEIS (número. [categoria] o que a foto mostra):
${fotosTxt}

AGENDA A PREENCHER (${slots.length} itens, em ordem):
${slotsTxt}

Para CADA item, devolva:
- "fotos": os NÚMEROS das fotos escolhidas (da lista acima) — as fotos de um MESMO item combinam no ASSUNTO, mas cada uma mostra uma CENA DIFERENTE (nunca duas fotos parecidas/da mesma cena — num carrossel isso parece foto repetida). NENHUMA foto se repete no lote inteiro. No carrossel, a 1ª é a capa e cada uma vira um slide.
- "tema": nasce das fotos — específico e concreto sobre o que ELAS mostram, conectado com a estratégia (dados acima). Os temas do lote se complementam como campanha, sem repetir ângulo. Evite os já usados: ${evitar || "nenhum"}.
- "categoria": uma de ${CATEGORIAS_AUTO.join("|")} — priorize as que mais despertam intenção e a sugestão do próximo post, MAS nunca a mesma categoria em dois itens seguidos.

Responda só com JSON: {"itens":[{"categoria":"...","tema":"...","fotos":[12,3,45]}, ...]} — exatamente ${slots.length} itens, na ordem da agenda.`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { itens?: { categoria?: string; tema?: string; fotos?: number[] }[] };
    const itens = j.itens ?? [];
    // Valida item a item: categoria segura, fotos existentes e sem repetição; buraco é
    // completado pela fila do rodízio (nunca fica sem foto por causa de resposta torta).
    return slots.map((s, i) => {
      const it = itens[i];
      const cat = s.comemorativa
        ? "sazonal"
        : it && (CATEGORIAS_AUTO as readonly string[]).includes(it.categoria || "")
          ? (it.categoria as CategoriaAuto)
          : ordem[i % ordem.length];
      const alvo = fotosDoSlot(s, cat);
      const escolhidas = pegaPorIndices(Array.isArray(it?.fotos) ? it!.fotos! : [], alvo);
      if (escolhidas.length < alvo) escolhidas.push(...pegaProximas(alvo - escolhidas.length, escolhidas[0]?.categoria || FALLBACK_FOTO[cat]));
      return { categoria: cat, tema: it?.tema?.trim() || s.comemorativa || FALLBACK_TEMA[cat], fotos: escolhidas };
    });
  } catch (e) {
    console.error("Erro no plano da Bia:", e);
    return reserva();
  }
}

// Etapa 1: monta o PLANO — o que criar em cada dia selecionado. Pula dia passado, dia fora
// da programação da marca e tipo que já existe naquele dia (não duplica). Com `recriar`,
// os itens que ainda estão A POSTAR são SUBSTITUÍDOS (a versão antiga sai na hora de gerar);
// o que JÁ FOI POSTADO no Instagram nunca é tocado — o dia só é pulado.
export async function planejarPreenchimento(marcaId: string, dias: string[], recriar = false): Promise<
  { ok: true; itens: ItemAgenda[]; pulados: string[]; aviso?: string } | { ok: false; erro: string }
> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId } });
  if (!marca) return { ok: false, erro: "Marca não encontrada." };

  const hoje = chaveBRT(new Date());
  const unicos = [...new Set(dias)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= hoje).sort();
  if (!unicos.length) return { ok: false, erro: "Selecione ao menos um dia de hoje em diante." };

  const planoCar = parseDias(marca.diasCarrossel);
  const planoFeed = parseDias(marca.diasFeed);

  // O que JÁ existe nos dias pedidos, separado por status: "a_postar" pode ser recriado;
  // "postado" trava o dia (não se apaga nem duplica o que já está no Instagram).
  const ini = new Date(`${unicos[0]}T00:00:00-03:00`);
  const fim = new Date(`${unicos[unicos.length - 1]}T23:59:59-03:00`);
  const [conteudos, publicacoes] = await Promise.all([
    prisma.conteudo.findMany({ where: { marcaId, data: { gte: ini, lte: fim } }, select: { data: true, status: true } }),
    prisma.publicacao.findMany({ where: { marcaId, formato: "feed", data: { gte: ini, lte: fim } }, select: { data: true, status: true } }),
  ]);
  const temCarrossel = new Set(conteudos.map((c) => chaveBRT(c.data)));
  const temFeed = new Set(publicacoes.map((p) => chaveBRT(p.data)));
  const carPostado = new Set(conteudos.filter((c) => c.status === "postado").map((c) => chaveBRT(c.data)));
  const feedPostado = new Set(publicacoes.filter((p) => p.status === "postado").map((p) => chaveBRT(p.data)));

  const slots: Slot[] = [];
  const pulados: string[] = [];
  for (const dia of unicos) {
    const dow = diaDaSemana(dia);
    // Sem recriar: só dia vazio do tipo. Com recriar: também dia com item A POSTAR (substitui);
    // dia com item JÁ POSTADO nunca entra (nem apaga, nem posta em dobro no perfil).
    const querCar = planoCar.includes(dow) && (recriar ? !carPostado.has(dia) : !temCarrossel.has(dia));
    const querFeed = planoFeed.includes(dow) && (recriar ? !feedPostado.has(dia) : !temFeed.has(dia));
    if (!querCar && !querFeed) {
      pulados.push(dia);
      continue;
    }
    const comemorativa = dataComemorativaDe(dia)?.nome;
    if (querCar) slots.push({ dia, tipo: "carrossel", comemorativa, recriar: recriar && temCarrossel.has(dia) });
    if (querFeed) slots.push({ dia, tipo: "feed", comemorativa, recriar: recriar && temFeed.has(dia) });
  }
  if (!slots.length) {
    return {
      ok: false,
      erro: recriar
        ? "Nada pra fazer nesses dias: o que existe neles já foi postado no Instagram (não mexo no que já saiu)."
        : "Esses dias já estão preenchidos. Liga a opção 🔄 Recriar pra eu substituir o que ainda não foi postado.",
    };
  }

  const cortou = slots.length > MAX_ITENS;
  const lote = slots.slice(0, MAX_ITENS);

  // Insumos da Bia: números de engajamento + sugestão + as fotos DIVULGÁVEIS com descrição
  // (as menos usadas primeiro — rodízio natural), numeradas pro plano escolher uma a uma.
  const [cerebro, fotosRaw, usados] = await Promise.all([
    cerebroDaBia(marcaId, marca.intelHistorico),
    prisma.imagemMarca.findMany({
      where: { marcaId, ...PODE_DIVULGAR, NOT: { descricao: "" } },
      select: { id: true, url: true, categoria: true, descricao: true },
      orderBy: [{ usos: "asc" }, { criadoEm: "desc" }],
      take: MAX_FOTOS_PLANO * 3,
    }),
    prisma.conteudo.findMany({ where: { marcaId }, select: { tema: true, titulo: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  // Tira as "quase iguais" do cardápio: de cada cena entra só UMA foto — assim nem a Bia
  // nem a fila de reserva conseguem pôr duas fotos repetidas no mesmo carrossel/lote.
  const fotosPool: typeof fotosRaw = [];
  for (const f of fotosRaw) {
    if (fotosPool.length >= MAX_FOTOS_PLANO) break;
    if (!fotosPool.some((k) => mesmaCena(k.descricao, f.descricao))) fotosPool.push(f);
  }
  const evitar = usados.map((c) => c.tema || c.titulo).filter(Boolean).join("; ");

  const plano = await planoDaBia({ nome: marca.nome, descricao: marca.descricao }, lote, cerebro, fotosPool, evitar);

  const itens: ItemAgenda[] = lote.map((s, i) => {
    const p = plano[i];
    // Feed: espaco vira mosaico SÓ com 4+ fotos no pool (senão a arte sai capenga).
    const template = s.tipo === "feed" ? (p.categoria === "espaco" && fotosPool.length < 4 ? "divulgacao" : TEMPLATE_POR_CATEGORIA[p.categoria]) : undefined;
    const estiloCapa = s.tipo === "carrossel" ? CAPA_POR_CATEGORIA[p.categoria] : undefined;
    return {
      dia: s.dia,
      tipo: s.tipo,
      tema: p.tema,
      categoria: p.categoria,
      categoriaFoto: p.fotos[0]?.categoria || "geral",
      fotos: p.fotos.map((f) => ({ id: f.id, url: f.url, descricao: f.descricao })),
      template,
      estiloCapa,
      indice: i,
      rotulo: rotuloDoDia(s.dia, s.tipo),
      recriar: s.recriar,
    };
  });

  return {
    ok: true,
    itens,
    pulados,
    aviso: cortou ? `Pra não demorar demais, vou criar ${MAX_ITENS} artes agora — rode de novo pros dias que sobraram.` : undefined,
  };
}

// Etapa 2: gera UM item do plano (o navegador chama em sequência, com barra de progresso).
export async function gerarItemAgenda(marcaId: string, item: ItemAgenda): Promise<{ ok: boolean; rotulo: string; erro?: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, rotulo: item.rotulo, erro: g.erro };

  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { paleta: true, corPrimaria: true } });
  const paleta = paletaDaMarca(marca?.paleta ?? null, marca?.corPrimaria ?? "#7c3aed");
  const corFundo = corFundoDoItem(paleta, item.indice);

  // RECRIAR: tira a versão antiga do dia AQUI (item a item, junto da geração da nova) — se o
  // lote parar no meio, os dias que não chegaram a rodar ficam intactos. Só apaga o que está
  // "a_postar"; o que já foi postado no Instagram é intocável.
  if (item.recriar) {
    const ini = new Date(`${item.dia}T00:00:00-03:00`);
    const fim = new Date(`${item.dia}T23:59:59-03:00`);
    if (item.tipo === "carrossel") {
      await prisma.conteudo.deleteMany({ where: { marcaId, status: "a_postar", data: { gte: ini, lte: fim } } }).catch(() => {});
    } else {
      await prisma.publicacao.deleteMany({ where: { marcaId, formato: "feed", status: "a_postar", data: { gte: ini, lte: fim } } }).catch(() => {});
    }
  }

  const fotos = item.fotos ?? [];
  try {
    let r: { ok: boolean; erro?: string };
    if (item.tipo === "carrossel") {
      // As fotos do plano viram o GUIA do carrossel: capa = 1ª foto, e cada slide de
      // conteúdo é ESCRITO sobre a foto dele (a coerência nasce na origem do texto).
      r = await gerarCarrossel({
        marcaId,
        tema: item.tema,
        data: item.dia,
        estiloCapa: item.estiloCapa || "aleatorio",
        corFundo,
        categoriaFoto: item.categoriaFoto,
        fotosGuia: fotos.map((f) => ({ url: f.url, descricao: f.descricao })),
      });
    } else {
      // Feed: a foto escolhida no plano vai DIRETO pro post (nada de sorteio). O tema já
      // nasceu dessa foto no plano da Bia, então o texto casa com a imagem por origem.
      r = await gerarPublicacao({
        marcaId,
        template: item.template ?? "dica",
        tema: item.tema,
        data: item.dia,
        corFundo,
        categoria: item.categoriaFoto,
        imagemUrl: fotos[0]?.url,
      });
    }
    // Contabiliza o uso das fotos escolhidas (mantém o rodízio do banco honesto).
    if (r.ok && fotos.length) {
      await prisma.imagemMarca.updateMany({ where: { id: { in: fotos.map((f) => f.id) } }, data: { usos: { increment: 1 } } }).catch(() => {});
    }
    return { ok: r.ok, rotulo: item.rotulo, erro: r.ok ? undefined : r.erro };
  } catch {
    return { ok: false, rotulo: item.rotulo, erro: "Falha ao gerar este item." };
  }
}
