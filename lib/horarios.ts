// Horários "recomendados" pra postar — público de pais/mães de buffet infantil é mais
// ativo no Instagram de manhã, no almoço e à NOITE (quando relaxam e pesquisam festa).
// Marcados com ⭐ nos seletores de hora pra guiar a escolha. (No futuro, a Camada 2 de
// métricas vai recomendar com base nos dados REAIS da conta — ver [[postai-metricas]].)
export const HORAS_RECOMENDADAS = new Set([9, 12, 19, 20]);

// Texto da opção num <select> de hora (ex: "12:00 ⭐"). `prefixo` opcional (ex: "🕐 ").
export function rotuloHora(h: number, prefixo = ""): string {
  const base = `${prefixo}${String(h).padStart(2, "0")}:00`;
  return HORAS_RECOMENDADAS.has(h) ? `${base} ⭐` : base;
}
