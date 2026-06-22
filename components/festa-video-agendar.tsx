"use client";

// Bloco que aparece na festa QUANDO já existe o vídeo (Festa.videoUrl): deixa VER o Reels.
// O AGENDAMENTO mora na aba Redes Sociais → 🎬 Reels (consistente com as outras abas).

import { useState } from "react";

export function FestaVideoAgendar({ videoUrl }: { videoUrl: string }) {
  const [ver, setVer] = useState(false);

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 p-3">
      <span className="text-lg">🎬</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white">Vídeo pronto!</p>
        <p className="text-[11px] text-muted">Pra agendar, vá em <strong className="text-white/80">📱 Redes Sociais → 🎬 Reels</strong>.</p>
      </div>
      <button onClick={() => setVer(true)} className="shrink-0 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">▶ Ver vídeo</button>

      {ver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setVer(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={videoUrl} controls playsInline className="max-h-[85vh] rounded-xl" />
            <button onClick={() => setVer(false)} aria-label="Fechar" className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
