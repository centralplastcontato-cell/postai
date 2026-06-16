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

  async function rodar() {
    setCarregando(true);
    setMsg(null);
    setErro(false);
    const r = await backfillEngajamento(marcaId);
    setCarregando(false);
    if (r.ok) {
      setErro(false);
      setMsg(
        r.total === 0
          ? "Tudo já está vinculado. ✅"
          : `Vinculei ${r.vinculados} de ${r.total} ${r.total === 1 ? "post antigo" : "posts antigos"}. Os números vão aparecer nos cards. 🎉`
      );
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
    </div>
  );
}
