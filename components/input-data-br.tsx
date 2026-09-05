"use client";

// "aaaa-mm-dd" → "dd/mm/aaaa"
function isoParaBR(iso: string): string {
  const p = (iso || "").split("-");
  return p.length === 3 && p[0] && p[1] && p[2] ? `${p[2]}/${p[1]}/${p[0]}` : "";
}

// Campo de data que ABRE O CALENDÁRIO do aparelho ao tocar (no iPhone pt-BR o calendário nativo
// já mostra dd/mm/aaaa). Truque: um <input type="date"> nativo transparente POR CIMA recebe o
// toque e abre o calendário; embaixo, uma camada visível mostra a data no formato dd/mm/aaaa
// (o próprio input nativo mostraria o formato do locale — em inglês vira mm/dd — por isso a
// camada de baixo). Valor de entrada/saída é ISO "aaaa-mm-dd" (o que as actions esperam).
export function InputDataBR({ value, onChange, className = "" }: { value: string; onChange: (iso: string) => void; className?: string }) {
  const txt = isoParaBR(value);
  return (
    <div className={`relative ${className}`}>
      {/* Camada visível: mostra dd/mm/aaaa (ou o placeholder) + ícone de calendário. */}
      <div className="input-base mt-0 flex items-center justify-between pr-3" aria-hidden>
        <span className={txt ? "text-white" : "text-muted/50"}>{txt || "dd/mm/aaaa"}</span>
        <span className="text-muted">📅</span>
      </div>
      {/* Input nativo TRANSPARENTE por cima: tocar em qualquer lugar do campo abre o calendário. */}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Escolher data"
        style={{ colorScheme: "dark" }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
