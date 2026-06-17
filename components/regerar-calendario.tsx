"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { limparSemanaTrial, gerarItemSemana } from "@/app/actions/onboarding";
import { ConfirmDialog } from "./confirm-dialog";

const TOTAL = 14;

const FRASES = [
  "Limpando o calendário…",
  "Escrevendo legendas novas… ✍️",
  "Montando os carrosséis… 🎠",
  "Encaixando as suas fotos… 🖼️",
  "Preparando os stories… 🟣",
  "Quase lá… ✨",
];

// Botão (só pro cliente em teste) que apaga a semana atual e gera uma NOVA do zero — com
// outros textos, tons de cor e fotos. Mostra uma telinha de processamento por cima.
export function RegerarCalendario({ marcaId }: { marcaId: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [feito, setFeito] = useState(0);

  async function regerar() {
    setConfirmar(false);
    setProcessando(true);
    setFeito(0);
    await limparSemanaTrial(marcaId).catch(() => {});
    for (let i = 0; i < TOTAL; i++) {
      try {
        await gerarItemSemana(marcaId, i);
      } catch {
        /* best-effort */
      }
      setFeito(i + 1);
    }
    router.refresh();
    setProcessando(false);
  }

  const pct = Math.round((feito / TOTAL) * 100);

  return (
    <>
      <button
        onClick={() => setConfirmar(true)}
        className="rounded-lg border border-[#7c3aed]/50 bg-[#7c3aed]/10 px-4 py-2 text-sm font-semibold text-[#c7b2ff] transition hover:border-[#7c3aed] hover:bg-[#7c3aed]/20"
      >
        🔄 Regerar calendário
      </button>

      <ConfirmDialog
        aberto={confirmar}
        titulo="Regerar o calendário inteiro?"
        descricao="Vou apagar a semana atual e montar uma nova do zero — outros textos, tons de cor e fotos. Os ajustes que você já fez nesses posts serão perdidos."
        textoConfirmar="Regerar tudo"
        onConfirmar={regerar}
        onCancelar={() => setConfirmar(false)}
      />

      {processando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-3xl border border-linha bg-preto-card p-7 text-center">
            <div className="relative mx-auto h-24 w-24">
              <div aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed]/20" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-3xl shadow-lg shadow-[#7c3aed]/40">🔄</div>
            </div>
            <h2 className="display mt-5 text-xl text-white">Montando uma semana nova…</h2>
            <p className="mt-2 text-sm text-muted">{FRASES[Math.min(Math.floor((feito / TOTAL) * FRASES.length), FRASES.length - 1)]}</p>
            <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-preto">
              <div className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{feito} de {TOTAL} · {pct}%</p>
            <p className="mt-3 text-[11px] text-muted">Leva cerca de 1 minuto. Não feche esta tela. 🙏</p>
          </div>
        </div>
      )}
    </>
  );
}
