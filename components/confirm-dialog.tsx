"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Modal de confirmação no padrão da plataforma (substitui o confirm() nativo do navegador).
export function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  onConfirmar,
  onCancelar,
  ocupado = false,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onCancelar]);

  if (!aberto || !montado) return null;

  return createPortal(
    <div
      onClick={onCancelar}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-linha bg-preto-card p-5 shadow-2xl"
      >
        <h3 className="text-base font-semibold text-white">{titulo}</h3>
        {descricao && <p className="mt-1.5 text-sm leading-relaxed text-muted">{descricao}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-muted transition hover:text-white disabled:opacity-50"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={ocupado}
            className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50"
          >
            {ocupado ? "Aguarde…" : textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
