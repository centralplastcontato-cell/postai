"use client";

// Player da música/jingle do buffet no Álbum da Festa. Os navegadores BLOQUEIAM autoplay com
// som, então: (1) tentamos tocar ao abrir; (2) se bloquear, começa no PRIMEIRO gesto do pai
// (rolar/tocar a tela) — desde que ele não tenha pausado de propósito; (3) botão flutuante
// pra tocar/pausar a qualquer momento. Toca em loop, volume médio.

import { useEffect, useRef, useState } from "react";

export function PlayerMusica({ url, cor }: { url: string; cor: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const pausouRef = useRef(false); // o pai pausou de propósito? então não auto-religa
  const [tocando, setTocando] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.55;

    // 1) tenta tocar ao abrir (quase sempre bloqueado pelo navegador com som)
    audio.play().then(() => setTocando(true)).catch(() => {
      // 2) bloqueado → começa no 1º gesto do usuário (se ele não pausou de propósito)
      const iniciar = () => {
        if (pausouRef.current || !audioRef.current) return;
        audioRef.current.play().then(() => setTocando(true)).catch(() => {});
      };
      window.addEventListener("pointerdown", iniciar, { once: true });
      window.addEventListener("keydown", iniciar, { once: true });
    });
  }, []);

  function alternar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      pausouRef.current = false;
      audio.play().then(() => setTocando(true)).catch(() => {});
    } else {
      pausouRef.current = true;
      audio.pause();
      setTocando(false);
    }
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url} loop preload="auto" />
      <button
        onClick={alternar}
        aria-label={tocando ? "Pausar música" : "Tocar música"}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-lg ring-2 ring-white/30 transition hover:scale-[1.04]"
        style={{ background: cor }}
      >
        <span className="text-base leading-none">{tocando ? "⏸️" : "🎵"}</span>
        {tocando ? "Tocando" : "Ouvir a música"}
      </button>
    </>
  );
}
