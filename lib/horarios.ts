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

// Opções de hora de 10 em 10 minutos (HH:MM) pros seletores de agendamento — das 6h às 23h50.
// A ⭐ fica na hora cheia recomendada. Valor = "HH:MM" (string).
export function opcoesHora10(prefixo = ""): { v: string; label: string }[] {
  const out: { v: string; label: string }[] = [];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += 10) {
      const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const estrela = HORAS_RECOMENDADAS.has(h) && m === 0 ? " ⭐" : "";
      out.push({ v, label: `${prefixo}${v}${estrela}` });
    }
  }
  return out;
}

// Converte a hora escolhida (número de hora cheia OU "HH:MM") em "HH:MM". Fora do intervalo → padrão.
export function horaSelParaHHMM(hora: number | string | undefined, padraoHora: number): string {
  if (typeof hora === "string") {
    const m = hora.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { const h = +m[1], mi = +m[2]; if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`; }
  }
  if (typeof hora === "number" && hora >= 0 && hora <= 23) return `${String(hora).padStart(2, "0")}:00`;
  return `${String(padraoHora).padStart(2, "0")}:00`;
}
