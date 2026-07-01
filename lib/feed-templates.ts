// Templates de feed (imagem única). Módulo normal (NÃO "use server") porque um
// arquivo de Server Actions só pode exportar funções async.
// Templates por finalidade real do negócio (não mais abstratos).

export const TEMPLATES = ["promocao", "data-comemorativa", "divulgacao", "dica", "mosaico", "moldura", "faixa", "feedback", "preco", "enquete", "vitrine"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  promocao: "🎉 Promoção / Oferta",
  "data-comemorativa": "🥳 Data Comemorativa",
  divulgacao: "⭐ Divulgação / Institucional",
  dica: "💡 Dica / Conteúdo",
  mosaico: "🖼️ Mosaico (fotos reais)",
  moldura: "🪟 Moldura (título em destaque)",
  faixa: "📐 Faixa (foto + faixa diagonal)",
  feedback: "⭐ Feedback / Depoimento",
  preco: "💰 Preço / Pacote",
  enquete: "⚔️ Enquete / VS (engajamento)",
  vitrine: "🍱 Vitrine (6 fotos + título)",
};

// Templates de DESIGN FECHADO: a arte é só cor + texto (ou usa fotos próprias via rodízio,
// como mosaico/vitrine). Eles NÃO usam a `imagemUrl` (foto de fundo única) — então os botões
// "🎲 Banco / 🤖 IA / 📤 Foto" não têm efeito neles e devem ficar escondidos. Lista negativa
// (mais segura p/ templates legados): todo o resto usa foto de fundo. Espelha o render em
// app/api/feed/[id]/route.tsx (só esses não passam imagemUrl/fotoUrl pro layout).
// promocao/divulgacao/preco AGORA aceitam foto de fundo opcional (véu da cor por cima p/ ler);
// moldura é design fechado; mosaico/vitrine usam fotos PRÓPRIAS (várias) — esses seguem sem foto única.
const TEMPLATES_SEM_FOTO_FUNDO: string[] = ["moldura", "mosaico", "vitrine"];

// O template usa foto de fundo única (controlada pelos botões Banco/IA/Foto)?
export function templateUsaFotoFundo(template: string): boolean {
  return !TEMPLATES_SEM_FOTO_FUNDO.includes(template);
}
