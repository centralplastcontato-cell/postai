"use client";

import { useState, useEffect, useRef } from "react";

// "aaaa-mm-dd" → "dd/mm/aaaa"
function isoParaBR(iso: string): string {
  const p = (iso || "").split("-");
  return p.length === 3 && p[0] && p[1] && p[2] ? `${p[2]}/${p[1]}/${p[0]}` : "";
}
// "dd/mm/aaaa" (texto digitado) → "aaaa-mm-dd" (ou "" se incompleto)
function brParaIso(br: string): string {
  const d = (br || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : "";
}

// Campo de data SEMPRE em dd/mm/aaaa — o <input type="date"> nativo mostra o formato do
// locale do navegador (em inglês vira mm/dd/aaaa), e isso NÃO é controlável. Aqui usamos
// uma máscara de texto dd/mm/aaaa + um botão 📅 que abre o calendário nativo. O valor que
// entra/sai é ISO "aaaa-mm-dd" (o que as actions esperam). Vazio enquanto incompleto.
export function InputDataBR({ value, onChange, className = "" }: { value: string; onChange: (iso: string) => void; className?: string }) {
  const [txt, setTxt] = useState(isoParaBR(value));
  const dateRef = useRef<HTMLInputElement>(null);

  // Sincroniza o texto com `value` SÓ quando ele muda DE FORA (≠ do que o texto já representa).
  // Sem essa checagem, ao digitar uma data incompleta (onChange("")) o efeito apagaria o campo.
  useEffect(() => {
    if (value !== brParaIso(txt)) setTxt(isoParaBR(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value.replace(/\D/g, "").slice(0, 8); // ddmmaaaa
    let f = d;
    if (d.length > 4) f = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    else if (d.length > 2) f = `${d.slice(0, 2)}/${d.slice(2)}`;
    setTxt(f);
    onChange(brParaIso(f));
  }

  function abrirCalendario() {
    const el = dateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    try { if (el.showPicker) el.showPicker(); else el.focus(); } catch { el.focus(); }
  }

  return (
    <div className={`relative ${className}`}>
      <input type="text" inputMode="numeric" value={txt} onChange={onInput} placeholder="dd/mm/aaaa" maxLength={10} className="input-base mt-0 pr-10" />
      <button type="button" onClick={abrirCalendario} aria-label="Abrir calendário" tabIndex={-1} className="absolute right-1 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:text-white">📅</button>
      {/* Input nativo escondido — só serve pra o calendário do botão 📅 */}
      <input ref={dateRef} type="date" value={value} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden style={{ colorScheme: "dark" }} className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0" />
    </div>
  );
}
