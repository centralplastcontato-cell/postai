// Templates de feed (imagem única). Módulo normal (NÃO "use server") porque um
// arquivo de Server Actions só pode exportar funções async.

export const TEMPLATES = ["dica", "produto", "vinte_anos", "frase"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  dica: "💡 Dica rápida",
  produto: "📦 Produto / serviço",
  vinte_anos: "🏅 Prova social / autoridade",
  frase: "❝ Frase / citação",
};
