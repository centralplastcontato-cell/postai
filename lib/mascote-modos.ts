// Modos e cenários dos CLIPES do mascote (o "castelinho"). Módulo só de dados — client-safe (sem
// prisma), usado tanto na tela (mascote-estudio) quanto no servidor (gerarClipeMascote), pra os
// dois falarem a MESMA língua (mesmos ids de modo e de cena).

export type ModoClipe = "historia" | "divulgacao" | "abertura" | "fecho" | "livre";

// Cada MODO define: pra que serve o clipe (roteiro/uso), a duração padrão, e sugestões (editáveis)
// de FALA e de AÇÃO do mascote. "usa" explica onde o clipe entra.
export const MODOS_CLIPE: {
  id: ModoClipe; ic: string; label: string; desc: string; seg: number; usa: string;
  falaSugestao: string; acaoSugestao: string;
}[] = [
  {
    id: "historia", ic: "📖", label: "História", seg: 12,
    desc: "O castelinho conta uma historinha", usa: "Vídeo pra postar sozinho",
    falaSugestao: "Oi, amiguinhos! Deixa eu contar uma coisa mágica que acontece aqui no castelo da diversão…",
    acaoSugestao: "contando uma historinha, animado e expressivo, gesticulando com alegria",
  },
  {
    id: "divulgacao", ic: "📣", label: "Divulgação", seg: 8,
    desc: "Ele chama pra agendar a festa", usa: "Vídeo pra postar sozinho",
    falaSugestao: "Que tal comemorar seu aniversário aqui no castelo? Vem fazer a sua festa com a gente!",
    acaoSugestao: "convidando animado, acenando e chamando as crianças pra virem",
  },
  {
    id: "abertura", ic: "🎬", label: "Abertura", seg: 4,
    desc: "Entra no COMEÇO dos Reels das festas", usa: "Início do Reels da festa",
    falaSugestao: "Bem-vindos ao castelo da diversão!",
    acaoSugestao: "dando as boas-vindas animado, acenando com um sorrisão",
  },
  {
    id: "fecho", ic: "🏁", label: "Fecho", seg: 4,
    desc: "Entra no FIM dos Reels das festas", usa: "Fim do Reels da festa",
    falaSugestao: "Agende a sua festa e venha se divertir!",
    acaoSugestao: "se despedindo com carinho, mandando um beijo e um joinha",
  },
  {
    id: "livre", ic: "✏️", label: "Livre", seg: 8,
    desc: "Você inventa do zero", usa: "Vídeo pra postar sozinho",
    falaSugestao: "",
    acaoSugestao: "",
  },
];

export function modoClipe(id: string): (typeof MODOS_CLIPE)[number] {
  return MODOS_CLIPE.find((m) => m.id === id) || MODOS_CLIPE[MODOS_CLIPE.length - 1]; // fallback "livre"
}

// CENÁRIOS curados — sempre "buffet infantil", descritos de forma CONSISTENTE (não é a IA inventando
// um cenário aleatório a cada vez). O melhor cenário continua sendo uma FOTO REAL do buffet (o dono
// escolhe na tela); estes aqui são a alternativa quando ele não quer usar foto. "cor" = fundo liso.
export const CENAS_CLIPE: { id: string; ic: string; label: string; prompt: string }[] = [
  { id: "salao", ic: "🎈", label: "Salão de festa", prompt: "dentro de um salão de festa infantil de buffet, decorado com balões coloridos, bandeirinhas e uma mesa de bolo ao fundo, com iluminação alegre e festiva" },
  { id: "bolo", ic: "🎂", label: "Mesa do bolo", prompt: "ao lado de uma mesa de bolo de aniversário infantil bem decorada, com doces coloridos, velinhas e balões em volta, num clima de festa" },
  { id: "bolinhas", ic: "🔵", label: "Piscina de bolinhas", prompt: "numa piscina de bolinhas coloridas de buffet infantil, cercado de brinquedos fofos, num clima de muita diversão" },
  { id: "parquinho", ic: "🛝", label: "Brinquedão", prompt: "num brinquedão colorido de buffet infantil, com escorregador e tobogã ao fundo, num clima alegre e divertido" },
  { id: "entrada", ic: "🚪", label: "Boas-vindas", prompt: "na entrada de um buffet infantil, embaixo de um arco de balões de boas-vindas, num clima acolhedor e festivo" },
];

export function cenaClipe(id: string): (typeof CENAS_CLIPE)[number] | null {
  return CENAS_CLIPE.find((c) => c.id === id) || null;
}

// MODELOS DE HISTÓRIA prontos (só pra o modo "História") — agrupados por TIPO. Cada opção é um
// briefing já escrito que o dono toca pra usar de base (e edita/ajusta antes de mandar pra Bia).
// `cenas` sugere quantas cenas combinam com aquela ideia. É só ponto de partida — a Bia escreve.
export const MODELOS_HISTORIA: {
  id: string; ic: string; tipo: string;
  opcoes: { titulo: string; briefing: string; cenas: number }[];
}[] = [
  {
    id: "aventura", ic: "🗺️", tipo: "Aventura (série)",
    opcoes: [
      { titulo: "1º episódio da série", cenas: 4, briefing: "Primeiro episódio da série de aventuras do castelinho: ele se apresenta com muita energia e chama os amiguinhos pra embarcar em aventuras dentro do castelo. As cenas se interligam como um episódio, começando com uma introdução e terminando com um gancho pro próximo episódio. Não force convite pra festa." },
      { titulo: "A caça ao tesouro", cenas: 4, briefing: "O castelinho encontra um mapa do tesouro escondido e sai numa caça ao tesouro pelos cantinhos do castelo, seguindo pistas divertidas. Cenas interligadas, clima de aventura, final com um gancho gostoso." },
      { titulo: "A porta mágica", cenas: 3, briefing: "O castelinho descobre uma porta mágica no castelo que leva a um mundo cheio de diversão; ele entra, explora e se encanta com o que vê. Cenas interligadas, tom mágico e fofo." },
    ],
  },
  {
    id: "boas", ic: "👋", tipo: "Boas-vindas",
    opcoes: [
      { titulo: "Oi, eu sou o castelinho", cenas: 3, briefing: "O castelinho se apresenta pras crianças: quem ele é, do que ele gosta e o clima mágico do castelo. Tom caloroso e acolhedor, cenas interligadas, final simpático." },
      { titulo: "Tour de boas-vindas", cenas: 3, briefing: "O castelinho dá as boas-vindas e faz um tourzinho animado apresentando o castelo, como um anfitrião fofo. Cenas interligadas, final acolhedor." },
    ],
  },
  {
    id: "convite", ic: "🎉", tipo: "Convite pra festa",
    opcoes: [
      { titulo: "Como é uma festa aqui", cenas: 4, briefing: "O castelinho conta, do começo ao fim, como é uma festa no castelo — a chegada, a diversão, o bolo — e só no fim convida a família a marcar a festa dela. Cenas interligadas e animadas." },
      { titulo: "Vem fazer sua festa", cenas: 3, briefing: "O castelinho, super empolgado, convida as famílias a comemorarem o aniversário no castelo, mostrando por que é inesquecível. Fecho com um convite caloroso pra agendar." },
    ],
  },
  {
    id: "datas", ic: "📅", tipo: "Datas especiais",
    opcoes: [
      { titulo: "Dia das Crianças", cenas: 3, briefing: "Especial de Dia das Crianças: o castelinho comemora o dia mais divertido do ano no castelo, cheio de surpresas e alegria. Cenas interligadas, bem festivo." },
      { titulo: "Especial de Natal", cenas: 3, briefing: "Especial de Natal: o castelinho decora o castelo, espalha magia natalina e deseja boas festas às famílias. Tom natalino, fofo e emocionante." },
      { titulo: "Chegaram as férias", cenas: 3, briefing: "O castelinho comemora a chegada das férias com um monte de brincadeiras no castelo e chama a criançada pra aproveitar cada dia. Animado e alegre." },
    ],
  },
  {
    id: "espaco", ic: "🧸", tipo: "Nosso espaço",
    opcoes: [
      { titulo: "Tour pelos brinquedos", cenas: 4, briefing: "O castelinho faz um tour mostrando os brinquedos e cantinhos mais divertidos do castelo, reagindo com alegria a cada um. Cenas interligadas, uma por atração." },
      { titulo: "Os cantinhos secretos", cenas: 3, briefing: "O castelinho revela os cantinhos mais legais e 'secretos' do castelo, um por cena, com curiosidade e muita diversão. Final com um gancho." },
    ],
  },
];
