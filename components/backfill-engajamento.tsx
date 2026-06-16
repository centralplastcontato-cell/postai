"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { backfillEngajamento } from "@/app/actions/metricas";

// Botão (admin) que resgata o engajamento dos posts ANTIGOS — casa as publicações que já
// estavam no Instagram com os posts do Postaí. Rodar uma vez por marca já basta.
export function BackfillEngajamento({ marcaId }: { marcaId: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [debug, setDebug] = useState<string | null>(null);

  async function rodar() {
    setCarregando(true);
    setMsg(null);
    setErro(false);
    setDebug(null);
    const r = await backfillEngajamento(marcaId);
    setCarregando(false);
    if (r.ok) {
      setErro(false);
      const novos = r.vinculados > 0 ? `Vinculei ${r.vinculados} ${r.vinculados === 1 ? "post novo" : "posts novos"} e ` : "";
      setMsg(`${novos}atualizei o engajamento de ${r.atualizados} ${r.atualizados === 1 ? "post" : "posts"}. 🎉`);
      setDebug(r.debug ?? null);
      router.refresh();
    } else {
      setErro(true);
      setMsg(r.erro);
    }
  }

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-white">🔗 Engajamento dos posts antigos</p>
      <p className="mt-1 text-xs text-muted">
        Puxa as curtidas/comentários/alcance dos posts que já estavam no Instagram (casa por legenda e horário). É só rodar
        uma vez. <span className="text-white/70">Stories antigos não dá — eles somem em 24h.</span>
      </p>
      <button
        type="button"
        onClick={rodar}
        disabled={carregando}
        className="mt-3 rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50"
      >
        {carregando ? "Vinculando…" : "🔗 Puxar agora"}
      </button>
      {msg && <p className={`mt-2 text-xs ${erro ? "text-red-400" : "text-muted"}`}>{msg}</p>}
      {debug && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted transition hover:text-white">🔬 Resposta da Meta (se o alcance não aparecer, me manda isto)</summary>
          <pre className="scroll-bonito mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-2 text-[11px] text-white/80">{debug}</pre>
        </details>
      )}
    </div>
  );
}
