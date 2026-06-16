// Catálogo de CATEGORIAS DE INTENÇÃO — o eixo que a inteligência do Postaí usa pra
// descobrir "que TIPO de post vende festa". É a INTENÇÃO de marketing do post, que fica
// ACIMA do template/visual: o mesmo "mostrar o espaço" pode sair como mosaico, faixa ou
// moldura, mas a intenção é a mesma.
//
// Módulo PURO (sem segredo, sem IA, sem acesso a banco) — pode ser importado tanto no
// servidor quanto em componentes de cliente (pra mostrar rótulo/emoji da etiqueta).

export type CategoriaId =
  | "espaco"
  | "prova_social"
  | "oferta"
  | "institucional"
  | "sazonal"
  | "conteudo";

// Ordem e textos pensados pro nicho de BUFFET INFANTIL. O `rotulo` (o que a Bia fala e a
// etiqueta mostra) usa LINGUAGEM SIMPLES que bate com os botões do gerador — nada de jargão
// ("prova social" virou "Depoimentos"), pra o dono não se perder. `desc` ajuda a IA a classificar.
export const CATEGORIAS: { id: CategoriaId; rotulo: string; emoji: string; desc: string }[] = [
  { id: "espaco", rotulo: "Mostrar o espaço", emoji: "🏰", desc: "decoração, brinquedos, área kids, estrutura — o lugar onde a festa acontece" },
  { id: "prova_social", rotulo: "Depoimentos", emoji: "⭐", desc: "depoimento de cliente, festa que já rolou, 'olha como ficou linda'" },
  { id: "oferta", rotulo: "Promoção", emoji: "🏷️", desc: "desconto, brinde, pacote, condição especial, valores em destaque" },
  { id: "institucional", rotulo: "Divulgação", emoji: "💎", desc: "diferenciais, confiança, qualidade, motivos pra fechar com a marca" },
  { id: "sazonal", rotulo: "Data comemorativa", emoji: "🎂", desc: "datas comemorativas (Natal, Dia das Crianças), aniversariantes da semana" },
  { id: "conteudo", rotulo: "Dica", emoji: "💡", desc: "dica útil, ideia de festa, conteúdo de valor sem oferta" },
];

const POR_ID: Record<string, (typeof CATEGORIAS)[number]> = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

export function ehCategoria(v: string | null | undefined): v is CategoriaId {
  return !!v && v in POR_ID;
}

// "🏰 Mostrar o espaço" — usado nas etiquetas e no texto da Bia. Sem categoria → "—".
export function rotuloCategoria(id: string | null | undefined): string {
  const c = id ? POR_ID[id] : undefined;
  return c ? `${c.emoji} ${c.rotulo}` : "—";
}
export function emojiCategoria(id: string | null | undefined): string {
  return (id && POR_ID[id]?.emoji) || "🏷️";
}
export function nomeCategoria(id: string | null | undefined): string {
  return (id && POR_ID[id]?.rotulo) || "Sem categoria";
}

// Categoria de um post de FEED a partir do template — DETERMINÍSTICO, sem IA. O template
// já carrega a intenção (promoção→oferta, feedback→prova social, mosaico→espaço…).
const TEMPLATE_CATEGORIA: Record<string, CategoriaId> = {
  promocao: "oferta",
  preco: "oferta",
  "data-comemorativa": "sazonal",
  divulgacao: "institucional",
  dica: "conteudo",
  mosaico: "espaco",
  moldura: "espaco",
  faixa: "espaco",
  feedback: "prova_social",
};
export function categoriaDoTemplate(template: string): CategoriaId {
  return TEMPLATE_CATEGORIA[template] ?? "conteudo";
}
