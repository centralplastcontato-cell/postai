// Contexto por SEGMENTO do perfil — usado pra a IA (Bia) escrever no tom certo (legendas, roteiros,
// falas do mascote) conforme o ramo. Padrão = "buffet" (mantém tudo como sempre foi). Módulo puro
// (client-safe), sem prisma.

export type ContextoSegmento = {
  negocio: string; // o que é o negócio (ex: "um buffet infantil")
  publico: string; // pra quem fala (ex: "pais e famílias")
  tom: string;     // o jeitão da comunicação
  cta: string;     // a chamada pra ação típica
  clima: string;   // clima/cenário pros vídeos do mascote
};

export function contextoSegmento(seg?: string): ContextoSegmento {
  if (seg === "jogo") {
    return {
      negocio: "um jogo/aplicativo",
      publico: "jogadores e futuros jogadores",
      tom: "empolgante, divertido e descontraído (clima de comunidade gamer), destacando diversão, desafios, personagens e novidades do jogo — sem infantilizar",
      cta: "convidar a jogar, baixar ou seguir o perfil pra acompanhar as novidades",
      clima: "um clima vibrante e divertido de jogo/desenho animado, colorido e cheio de energia",
    };
  }
  // Padrão: BUFFET (comportamento de sempre).
  return {
    negocio: "um buffet infantil (festas de aniversário)",
    publico: "pais e famílias",
    tom: "caloroso, festivo e encantador (clima de festa infantil)",
    cta: "convidar a agendar/fazer a festa no buffet",
    clima: "um clima alegre e festivo de buffet infantil",
  };
}
