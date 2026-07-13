// CAÇA-FOTOS por TEMA — o cérebro que acha, no acervo inteiro, as fotos que REALMENTE mostram
// o assunto do post/vídeo ("Brinquedos", "Nosso espaço", "Comidas"...).
//
// Por que não basta a categoria do banco: ela é ruidosa (foto marcada "brinquedos" que na
// verdade é a entrada do aniversariante; foto "espaco" que é mesa de bolo). O que é confiável
// é a DESCRIÇÃO que a IA-visão escreve no upload — rica e fiel ("Brinquedão com escorregador
// amarelo...", "Mesa de doces com brigadeiros..."). Então pontuamos pela descrição.
//
// Sem isso, a IA recebia um cardápio sorteado por rodízio (80 de 811 fotos) e, como 2/3 do
// acervo é foto de festa, um vídeo de "Brinquedos" vinha só com bolo e família posando.
// Módulo PURO (sem prisma) — dá pra testar e reusar no post e no vídeo.

export type FotoParaRanquear = { id: string; categoria: string; descricao: string; usos?: number };

function normaliza(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Grupos de assunto: as CHAVES casam com o tema que o dono escolheu; as PALAVRAS são o que
// procuramos na descrição da foto. `categorias` é só um empurrãozinho (sinal fraco).
type Grupo = { chaves: string[]; palavras: string[]; categorias: string[] };

const GRUPOS: Grupo[] = [
  {
    // Brinquedos, jogos, diversão
    chaves: ["brinquedo", "brinquedao", "recreacao", "diversao", "jogos", "jogo", "game", "arcade", "playground", "pula", "bolinha", "escorregador", "atracoes", "atracao"],
    palavras: [
      "brinquedao", "brinquedo", "escorregador", "piscina de bolinhas", "bolinhas", "arcade", "fliperama", "jogo", "jogos", "simulador",
      "realidade virtual", "tobaga", "tobogan", "pula-pula", "cama elastica", "giratorio", "playground", "area baby", "labamba", "carrossel",
      "basquete", "videogame", "console", "maquina", "balanco", "tirolesa", "arena games", "mercearia", "mini mercado", "pebolim", "boliche",
      "gira", "toca", "rede de protecao", "brincando", "brincam",
    ],
    categorias: ["brinquedos"],
  },
  {
    // O espaço/salão/estrutura do buffet
    chaves: ["espaco", "salao", "ambiente", "estrutura", "lugar", "local", "tour", "instalacoes", "conheca", "casa"],
    palavras: [
      "salao", "mesas redondas", "cadeiras", "ambiente", "entrada", "fachada", "mezanino", "iluminacao", "luzes pendentes", "espaco",
      "area", "estrutura", "tijolo", "piso", "amplo", "vista", "recepcao", "brinquedao", "area baby", "janelas",
    ],
    categorias: ["espaco", "brinquedos"],
  },
  {
    // Comida: salgados, doces, bolo, cozinha
    chaves: ["comida", "comidas", "gastronomia", "cardapio", "doce", "doces", "salgado", "salgados", "bolo", "cozinha", "delicia", "delicias", "lanche", "buffet de comida", "mesa de doces"],
    palavras: [
      "comida", "salgado", "salgadinho", "doce", "docinho", "brigadeiro", "beijinho", "bolo", "pao de queijo", "batata frita", "coxinha",
      "quiche", "tortinha", "bandeja", "prato", "mesa de doces", "cozinha", "chef", "cupcake", "pipoca", "algodao doce", "refrigerante",
      "suco", "guloseimas", "lanche", "servida", "servidos",
    ],
    categorias: ["comida"],
  },
  {
    // Decoração e festas temáticas
    chaves: ["decoracao", "decoracoes", "tematic", "tema", "temas", "painel", "cenario", "mesa decorada", "festas"],
    palavras: [
      "decorada", "decoracao", "painel", "balao", "baloes", "arco de baloes", "tema", "cenario", "personagens", "mesa decorada",
      "topo de bolo", "lembrancinhas", "fantasia", "backdrop", "toalha",
    ],
    categorias: ["festa"],
  },
  {
    // Recreação: monitores, animação, dança
    chaves: ["recreacao", "monitor", "monitores", "animador", "animadores", "animacao", "brincadeira", "danca", "equipe", "apresentacao", "show"],
    palavras: [
      "monitor", "monitores", "animador", "animadores", "recreacao", "danca", "dancando", "brincadeira", "apresentacao", "palco",
      "show", "musica", "aplaudindo", "interacao", "macacao", "equipe",
    ],
    categorias: ["brinquedos", "festa"],
  },
];

const PARAR = new Set(["nosso", "nossa", "nossos", "nossas", "para", "pela", "pelo", "com", "sem", "que", "dos", "das", "uma", "uns", "umas", "aqui", "mais", "seu", "sua"]);

// O que procurar na descrição, pro tema escolhido: as palavras dos grupos que casam + as
// palavras significativas do próprio tema (cobre tema livre, ex: "Nossa área baby").
function alvoDoTema(tema: string): { palavras: string[]; categorias: Set<string> } {
  const t = normaliza(tema);
  const palavras = new Set<string>();
  const categorias = new Set<string>();
  for (const g of GRUPOS) {
    if (g.chaves.some((k) => t.includes(k))) {
      g.palavras.forEach((p) => palavras.add(p));
      g.categorias.forEach((c) => categorias.add(c));
    }
  }
  // Palavras do próprio tema (tema livre, ex: "Aniversário no espaço kids")
  for (const w of t.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PARAR.has(w))) palavras.add(w);
  return { palavras: [...palavras], categorias };
}

// Nota de uma foto pro tema: quanto a DESCRIÇÃO fala do assunto (sinal forte) + categoria
// (sinal fraco). 0 = a foto não tem nada a ver com o tema.
export function pontuarFoto(foto: FotoParaRanquear, alvo: { palavras: string[]; categorias: Set<string> }): number {
  const d = normaliza(foto.descricao);
  if (!d) return 0;
  let n = 0;
  for (const p of alvo.palavras) if (d.includes(p)) n += 3;
  if (alvo.categorias.has(foto.categoria)) n += 1;
  return n;
}

// Candidatas do tema, prontas pra IA escolher. Duas ideias separadas, e é isso que faz
// funcionar:
//   1. RELEVÂNCIA é FILTRO — entram só as fotos que falam do assunto, com uma nota de corte
//      (2+ palavras do tema; se sobrar pouca coisa, o corte afrouxa pra 1 palavra, e no
//      último caso entra o acervo geral pra nunca faltar foto).
//   2. RODÍZIO é a ORDEM — entre as que passaram, as MENOS USADAS vêm primeiro (empate:
//      a mais relevante). Sem isso o resultado seria fixo e dois vídeos do mesmo tema sairiam
//      com exatamente as mesmas fotos, na mesma ordem.
//
// `minimo` = quantas candidatas o chamador precisa pra IA ter escolha de verdade.
const CORTES = [9, 6, 3]; // 3+ palavras do tema, 2+, 1+
export function ranquearPorTema<T extends FotoParaRanquear>(fotos: T[], tema: string, minimo = 0): { fotos: T[]; comTema: number } {
  const alvo = alvoDoTema(tema);
  const nota = new Map<string, number>();
  for (const f of fotos) nota.set(f.id, pontuarFoto(f, alvo));
  const comTema = fotos.filter((f) => (nota.get(f.id) ?? 0) > 0).length;

  // Corte mais exigente que ainda entrega candidatas suficientes.
  let pool: T[] = [];
  for (const corte of CORTES) {
    pool = fotos.filter((f) => (nota.get(f.id) ?? 0) >= corte);
    if (pool.length >= Math.max(minimo, 1)) break;
  }
  // Tema que o acervo não cobre (ex: "Piscina" sem foto de piscina): usa o acervo geral.
  if (!pool.length) pool = [...fotos];

  // Rodízio manda na ordem; relevância desempata.
  const ordenadas = pool.sort((a, b) => (a.usos ?? 0) - (b.usos ?? 0) || (nota.get(b.id) ?? 0) - (nota.get(a.id) ?? 0));

  // Faltou candidata (tema raro)? Completa com o resto do acervo (menos usadas primeiro).
  if (ordenadas.length < minimo) {
    const dentro = new Set(ordenadas.map((f) => f.id));
    const resto = fotos.filter((f) => !dentro.has(f.id)).sort((a, b) => (a.usos ?? 0) - (b.usos ?? 0));
    ordenadas.push(...resto.slice(0, minimo - ordenadas.length));
  }
  return { fotos: ordenadas, comTema };
}
