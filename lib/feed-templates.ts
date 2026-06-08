// Templates de feed (imagem única). Módulo normal (NÃO "use server") porque um
// arquivo de Server Actions só pode exportar funções async.
// Templates por finalidade real do negócio (não mais abstratos).

export const TEMPLATES = ["promocao", "dica"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  promocao: "🎉 Promoção / Oferta",
  dica: "💡 Dica / Conteúdo",
};
