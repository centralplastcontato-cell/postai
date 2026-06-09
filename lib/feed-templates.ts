// Templates de feed (imagem única). Módulo normal (NÃO "use server") porque um
// arquivo de Server Actions só pode exportar funções async.
// Templates por finalidade real do negócio (não mais abstratos).

export const TEMPLATES = ["promocao", "data-comemorativa", "divulgacao", "dica", "mosaico"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  promocao: "🎉 Promoção / Oferta",
  "data-comemorativa": "🥳 Data Comemorativa",
  divulgacao: "⭐ Divulgação / Institucional",
  dica: "💡 Dica / Conteúdo",
  mosaico: "🖼️ Mosaico (fotos reais)",
};
