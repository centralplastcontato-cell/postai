"use client";

// Botão "⚡ Gerar vídeo" na festa: dispara o motor de vídeo. A montagem roda em segundo plano;
// quando termina, o /api/video-pronto salva a URL e o card vira "Vídeo pronto" (no próximo refresh).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarVideoDaFesta } from "@/app/actions/festas";

export function FestaGerarVideo({ festaId }: { festaId: string }) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setGerando(true);
    setErro("");
    const r = await gerarVideoDaFesta(festaId).catch(() => ({ ok: false as const, erro: "Não consegui gerar agora." }));
    if (!r.ok) {
      setErro(r.erro || "Não deu pra gerar.");
      setGerando(false);
      return;
    }
    router.refresh(); // passa a mostrar "Gerando…"
  }

  return (
    <div className="mt-3 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 p-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">🎬</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white">Gerar o vídeo da festa</p>
          <p className="text-[11px] text-muted">Monta um Reels com as fotos escolhidas + jingle. Leva uns minutos.</p>
        </div>
        <button onClick={gerar} disabled={gerando} className="shrink-0 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-60">
          {gerando ? "Enviando…" : "⚡ Gerar vídeo"}
        </button>
      </div>
      {erro && <p className="mt-2 text-[11px] text-vermelho">{erro}</p>}
    </div>
  );
}
