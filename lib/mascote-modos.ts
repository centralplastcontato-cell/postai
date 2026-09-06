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
