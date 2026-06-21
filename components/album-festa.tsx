"use client";

// "Álbum pros pais" — página pública e festiva que o buffet manda pros pais com as fotos
// da festa do filho. Componente PURO de apresentação: recebe os dados prontos (a página
// server monta a partir da festa real). Visual claro/festivo de propósito (contraste com
// o painel escuro). Ainda é PROTÓTIPO (rota /album-demo) — só visual, não posta nada.

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { type TemaVisual, padraoStyle } from "@/lib/temas-festa";
import { IconeTema } from "@/components/icone-tema";
import { PlayerMusica } from "@/components/player-musica";

export type AlbumMarca = {
  nome: string;
  logoUrl: string | null;
  telefone: string | null;
  site: string | null;
  instagram: string | null; // @ do Instagram, sem o arroba
};
export type AlbumFoto = { url: string; desc: string };
export type AlbumMomento = { emoji: string; titulo: string; sub: string; fotos: AlbumFoto[] };
export type AlbumData = {
  marca: AlbumMarca;
  visual: TemaVisual; // paleta/emojis/padrão do tema da festa (ou cor da marca no fallback)
  titulo: string; // "Enrico fez 4!" (sem emoji — o ícone do tema é colado na hora)
  tema: string; // texto cru que o gerente digitou (fallback da pílula)
  idade: number | null;
  dataLabel: string; // "Sábado, 20 de junho de 2026"
  horario: string; // "" ou "15:00"
  capaUrl: string | null; // foto de capa do hero (null = só o gradiente do tema)
  mensagem: string | null; // palavrinha do buffet pros pais (null = esconde o card)
  momentos: AlbumMomento[];
  googleReviewUrl: string | null; // link pra avaliar o buffet no Google (null = esconde o card)
  musicaUrl: string | null; // música/jingle do buffet que toca no álbum (null = sem player)
  // Campanha (banner de oferta) que o buffet injeta na página pela aba Campanhas. null = sem banner.
  campanha: {
    selo: string; // badge de urgência ("Condição especial · 15 dias")
    titulo: string;
    texto: string;
    ctaTexto: string;
    ctaUrl: string | null;
  } | null;
  preview: boolean;
};

function linkWhats(tel: string): string {
  const d = tel.replace(/\D/g, "");
  const num = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${num}`;
}
function linkSite(s: string): string {
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function siteLabel(s: string): string {
  return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

// Posições fixas do confete no hero (até 5 emojis do tema).
const CONFETE = [
  { left: "8%", top: "18%" },
  { left: "82%", top: "12%" },
  { left: "68%", top: "60%" },
  { left: "20%", top: "70%" },
  { left: "45%", top: "20%" },
];

export function AlbumFesta({ dados }: { dados: AlbumData }) {
  const { marca, momentos, visual } = dados;
  const [cor, cor2, cor3] = visual.cores;
  const acento = visual.acento;

  const todas = momentos.flatMap((m) =>
    m.fotos.map((f) => ({ ...f, momentoEmoji: m.emoji, momentoTitulo: m.titulo }))
  );

  const [aberta, setAberta] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mostrarToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const fechar = useCallback(() => setAberta(null), []);
  const proxima = useCallback(() => setAberta((i) => (i === null ? i : (i + 1) % todas.length)), [todas.length]);
  const anterior = useCallback(() => setAberta((i) => (i === null ? i : (i - 1 + todas.length) % todas.length)), [todas.length]);

  useEffect(() => {
    if (aberta === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") proxima();
      if (e.key === "ArrowLeft") anterior();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta, fechar, proxima, anterior]);

  async function compartilhar() {
    const d = { title: dados.titulo, text: "Olha como ficou a festa! 💜", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(d);
      else {
        await navigator.clipboard.writeText(window.location.href);
        mostrarToast("🔗 Link copiado! É só colar pra compartilhar.");
      }
    } catch {
      /* cancelou — tudo bem */
    }
  }

  return (
    <div className="min-h-screen w-full text-zinc-800" style={{ background: `linear-gradient(${acento}14, ${acento}14), #FBF7F2` }}>
      {dados.preview && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800">
          ✨ Prévia — é assim que ficaria o álbum que o buffet manda pros pais (fotos reais da festa).
        </div>
      )}

      {/* HERO */}
      <header className="relative overflow-hidden px-5 pb-10 pt-9 text-white sm:pb-14 sm:pt-12">
        {dados.capaUrl && (
          <>
            {/* foto borrada de fundo (clima/cores reais da festa) — assim o corte das laterais
                não incomoda; scale-110 evita as bordas claras que o blur cria */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dados.capaUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
            {/* leve escurecimento de base pra dar contraste ao texto sem apagar a foto */}
            <div className="absolute inset-0 bg-black/30" />
          </>
        )}
        {/* tom do tema por cima da capa: pinta a cor da festa deixando a foto aparecer */}
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${cor} 0%, ${cor2} 60%, ${cor3} 100%)`, opacity: dados.capaUrl ? 0.45 : 1 }}
        />

        <div className="pointer-events-none absolute inset-0 select-none text-2xl opacity-30">
          {visual.emojis.slice(0, 5).map((e, i) => (
            <span key={i} className="absolute" style={CONFETE[i]}>{e}</span>
          ))}
        </div>

        <div className={`relative mx-auto max-w-3xl text-center${dados.capaUrl ? " [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]" : ""}`}>
          {marca.logoUrl ? (
            <div className="mx-auto inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 shadow-lg shadow-black/15 ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.logoUrl} alt={marca.nome} className="h-12 w-auto max-w-[200px] object-contain sm:h-14" />
            </div>
          ) : (
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-lg shadow-black/15">
              🏰
            </div>
          )}
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-white/90">{marca.nome}</p>

          <h1 className="font-titulo mt-2 text-3xl font-extrabold leading-tight drop-shadow-sm sm:text-5xl">
            {dados.titulo} <IconeTema nome={visual.nome} emoji={visual.icone} className="ml-0.5 h-[0.78em] w-[0.78em] [vertical-align:-0.04em]" />
          </h1>

          <p className="mt-2 text-sm font-medium text-white/90 sm:text-base">📅 {dados.dataLabel}</p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
            {dados.idade != null && (
              <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur">🎂 {dados.idade} aninhos</span>
            )}
            {dados.tema && (
              <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur">
                <IconeTema nome={visual.nome} emoji={visual.icone} className="mr-1 h-[1.05em] w-[1.05em] [vertical-align:-0.15em]" /> Tema {visual.reconhecido ? visual.nome : dados.tema}
              </span>
            )}
            {dados.horario && (
              <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur">🕐 {dados.horario}</span>
            )}
          </div>

          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/90 sm:text-base">
            Guardamos com carinho cada momento desse dia tão especial. 💜<br />
            Aproveitem, baixem as fotos e compartilhem à vontade!
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => mostrarToast("⬇️ No álbum real, isso baixa todas as fotos de uma vez.")}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-sm transition hover:scale-[1.03] [text-shadow:none]"
              style={{ color: acento }}
            >
              ⬇️ Baixar todas
            </button>
            <button
              onClick={compartilhar}
              className="rounded-full border border-white/60 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              💜 Compartilhar
            </button>
          </div>
        </div>

        {visual.padrao && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4" style={padraoStyle(visual.padrao)} />
        )}
      </header>

      {/* CORPO */}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {dados.mensagem && (
          <section className="mb-8 rounded-2xl border bg-white px-5 py-5 text-center shadow-sm" style={{ borderColor: `${acento}40` }}>
            <p className="text-[15px] italic leading-relaxed text-zinc-600">“{dados.mensagem}”</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">— Equipe {marca.nome}</p>
          </section>
        )}

        {momentos.map((m, i) => (
          <section key={m.titulo} className="mb-10">
            {i > 0 &&
              (visual.padrao ? (
                <div className="mx-auto mb-9 h-2 w-44 overflow-hidden rounded-full opacity-80" style={padraoStyle(visual.padrao)} />
              ) : (
                <div className="mx-auto mb-9 h-1 w-24 rounded-full" style={{ background: `${acento}55` }} />
              ))}
            <div className="mb-3 flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: `${acento}1f` }}>
                {m.emoji}
              </span>
              <h2 className="font-titulo min-w-0 text-xl font-extrabold text-zinc-800 sm:text-2xl">{m.titulo}</h2>
              <span className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${acento}14`, color: acento }}>
                {m.fotos.length} fotos
              </span>
            </div>
            <p className="mb-4 text-sm text-zinc-500">{m.sub}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {m.fotos.map((f) => {
                const idx = todas.findIndex((t) => t.url === f.url);
                return (
                  <button
                    key={f.url}
                    onClick={() => setAberta(idx)}
                    className="group relative aspect-square overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div
                      className="absolute inset-0 grid place-items-center text-3xl"
                      style={{ background: `linear-gradient(135deg, ${cor}1a, ${cor}33)` }}
                    >
                      {m.emoji}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={f.desc}
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.opacity = "0")}
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    {marca.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={marca.logoUrl}
                        alt=""
                        aria-hidden
                        className="pointer-events-none absolute bottom-1.5 right-1.5 h-4 w-auto max-w-[45%] object-contain opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:h-5"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Banner de CAMPANHA — oferta da próxima festa no pico do encantamento (recompra) */}
        {dados.campanha && (
          <section
            className="album-banner-pulse relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 px-6 py-9 text-center text-white shadow-lg"
            style={{ "--campanha-glow": `${acento}cc` } as CSSProperties}
          >
            {/* brilho da cor do tema, pra não ser preto chapado */}
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% -10%, ${acento}55, transparent 62%)` }} />
            <div className="relative">
              <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide" style={{ background: acento }}>
                {dados.campanha.selo}
              </span>
              <h3 className="font-titulo mx-auto mt-4 max-w-md text-2xl font-extrabold leading-tight">{dados.campanha.titulo}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/80">{dados.campanha.texto}</p>
              {dados.campanha.ctaUrl && (
                <a
                  href={dados.campanha.ctaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="album-cta mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition hover:scale-[1.03]"
                  style={{ background: acento, "--cta-glow": `${acento}aa` } as CSSProperties}
                >
                  {dados.campanha.ctaTexto} →
                </a>
              )}
              {dados.preview && (
                <p className="mt-5 text-[11px] text-white/40">
                  Exemplo de campanha — no painel, o buffet cria e ativa as ofertas que aparecem aqui.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Avalie no Google — pedido no pico do encantamento (acabaram de ver as fotos) */}
        {dados.googleReviewUrl && (
          <section className="mt-4 rounded-3xl border-2 bg-white px-6 py-8 text-center shadow-sm" style={{ borderColor: `${acento}55` }}>
            <div className="text-2xl tracking-[0.2em]">⭐️⭐️⭐️⭐️⭐️</div>
            <h3 className="font-titulo mt-3 text-2xl font-extrabold text-zinc-800">Conta pra todo mundo como foi! 💛</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
              Se você curtiu a festa, deixar uma avaliação no Google ajuda demais a{" "}
              <strong className="text-zinc-700">{marca.nome}</strong> — e leva só 1 minutinho. 🙏
            </p>
            <a
              href={dados.googleReviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:scale-[1.03]"
              style={{ background: acento }}
            >
              ⭐ Avaliar no Google
            </a>
          </section>
        )}

        {/* Gostou? marque a gente */}
        <section
          className="mt-4 rounded-3xl px-6 py-8 text-center text-white"
          style={{ background: `linear-gradient(135deg, ${cor} 0%, ${cor2} 100%)` }}
        >
          <p className="text-2xl">💜</p>
          <h3 className="font-titulo mt-1 text-2xl font-extrabold">Gostou das fotos?</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/90">
            Marque a <strong>{marca.nome}</strong> nas suas fotos! Foi uma alegria fazer parte desse dia. 🎉
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {marca.telefone && (
              <a
                href={linkWhats(marca.telefone)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.03]"
                style={{ color: acento }}
              >
                💬 WhatsApp
              </a>
            )}
            {marca.instagram && (
              <a
                href={`https://instagram.com/${marca.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.03]"
                style={{ color: acento }}
              >
                📷 @{marca.instagram}
              </a>
            )}
            {marca.site && (
              <a
                href={linkSite(marca.site)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.03]"
                style={{ color: acento }}
              >
                🌐 {siteLabel(marca.site)}
              </a>
            )}
          </div>
        </section>
      </main>

      {/* faixa temática de "encerramento" (no Hot Wheels vira linha de chegada 🏁) */}
      {visual.padrao ? (
        <div className="h-3 w-full" style={padraoStyle(visual.padrao)} />
      ) : (
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${acento}, transparent)` }} />
      )}
      <footer className="px-4 pb-10 pt-8 text-center">
        <p className="text-xs text-zinc-400">
          Álbum feito com carinho por <span className="font-semibold" style={{ color: acento }}>{marca.nome}</span>
        </p>
        <p className="mt-1 text-[11px] text-zinc-300">criado no Postaí</p>
      </footer>

      {/* LIGHTBOX */}
      {aberta !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={fechar}>
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="min-w-0 truncate text-sm font-medium">
              {todas[aberta].momentoEmoji} {todas[aberta].momentoTitulo} · {aberta + 1}/{todas.length}
            </span>
            <button onClick={fechar} aria-label="Fechar" className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
              ✕
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={anterior} aria-label="Anterior" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-xl text-white hover:bg-white/20 sm:left-6">
              ‹
            </button>
            <div className="relative inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={todas[aberta].url} alt={todas[aberta].desc} className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl" />
              {marca.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={marca.logoUrl}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute bottom-3 right-3 h-8 w-auto max-w-[40%] object-contain opacity-90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] sm:h-10"
                />
              )}
            </div>
            <button onClick={proxima} aria-label="Próxima" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-xl text-white hover:bg-white/20 sm:right-6">
              ›
            </button>
          </div>

          <div className="px-6 pb-6 pt-3 text-center" onClick={(e) => e.stopPropagation()}>
            {todas[aberta].desc && <p className="mx-auto max-w-lg text-sm text-white/80">{todas[aberta].desc}</p>}
            <button
              onClick={() => mostrarToast("⬇️ No álbum real, isso baixa essa foto.")}
              className="mt-3 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              ⬇️ Baixar esta foto
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {dados.musicaUrl && <PlayerMusica url={dados.musicaUrl} cor={acento} />}
    </div>
  );
}
