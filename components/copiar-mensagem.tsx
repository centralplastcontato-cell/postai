"use client";

import { useState } from "react";

// Caixa com um texto pronto + botão "Copiar" — usada no Guia pra o admin mandar a
// mensagem de onboarding pro cliente no WhatsApp sem digitar nada.
export function CopiarMensagem({ texto, etiqueta = "📋 Copiar mensagem" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard pode falhar (permissão/navegador) — o usuário ainda consegue selecionar o texto à mão */
    }
  }

  return (
    <div className="rounded-lg border border-linha bg-preto p-3">
      <pre className="scroll-bonito max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-white/90">{texto}</pre>
      <button
        type="button"
        onClick={copiar}
        className="mt-3 rounded-lg bg-vermelho px-4 py-2 text-xs font-semibold text-white transition hover:bg-vermelho-hover"
      >
        {copiado ? "✓ Copiado!" : etiqueta}
      </button>
    </div>
  );
}
