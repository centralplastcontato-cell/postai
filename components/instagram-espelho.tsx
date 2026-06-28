"use client";

// Aba 📷 Instagram — espelho (só leitura) do feed da conta da marca, puxado da API do Instagram.
// Busca SOB DEMANDA (ao abrir a aba) pra não pesar o painel. Stories só os ativos (24h).

import { useState, useEffect } from "react";
import { buscarInstagramDaMarca } from "@/app/actions/instagram";
import type { PostIG, StoryIG } from "@/lib/instagram";

// número grande fica curtinho: 1500 → "1,5k"
const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "").replace(".", ",") + "k" : String(n));

export function InstagramEspelho({ marcaId }: { marcaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feed, setFeed] = useState<PostIG[]>([]);
  const [stories, setStories] = useState<StoryIG[]>([]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    buscarInstagramDaMarca(marcaId)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) setErro(r.erro);
        else { setFeed(r.feed); setStories(r.stories); setErro(null); }
      })
      .catch(() => { if (vivo) setErro("Não consegui carregar o Instagram agora. Tente de novo."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [marcaId]);

  if (carregando) {
    return <div className="py-16 text-center text-sm text-muted"><span className="animate-pulse">📷 Carregando seu Instagram…</span></div>;
  }
  if (erro) {
    return <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">{erro}</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">📷 Meu Instagram</p>
        <p className="mt-1 text-xs text-muted">Um espelho do feed da sua conta. Toque num post pra abrir no Instagram. 💜</p>
      </div>

      {/* Stories ativos (somem em 24h) */}
      {stories.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold text-muted">🟣 Stories no ar agora</p>
          <div className="flex flex-wrap gap-3 py-1">
            {stories.map((s) => (
              <a key={s.id} href={s.permalink || undefined} target="_blank" rel="noreferrer" className="shrink-0">
                <span className="block rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.imagem} alt="" className="h-16 w-16 rounded-full border-2 border-preto-card object-cover" />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Feed em grade */}
      {feed.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum post publicado ainda nessa conta do Instagram.</div>
      ) : (
        // Mosaico (CSS columns): cada foto na proporção ORIGINAL, sem cortar em cima/embaixo.
        <div className="columns-2 gap-1 sm:columns-3 sm:gap-2">
          {feed.map((p) => (
            <a key={p.id} href={p.permalink || undefined} target="_blank" rel="noreferrer" title={p.legenda?.slice(0, 120)} className="group relative mb-1 block break-inside-avoid overflow-hidden rounded-md bg-preto sm:mb-2 sm:rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imagem} alt="" loading="lazy" className="w-full" />
              {p.tipo === "VIDEO" && <span className="absolute right-1.5 top-1.5 text-sm drop-shadow-lg">🎬</span>}
              {p.tipo === "CAROUSEL_ALBUM" && <span className="absolute right-1.5 top-1.5 text-sm drop-shadow-lg">🗂️</span>}
              {/* engajamento no rodapé (sempre visível) */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-5 text-[10px] font-bold text-white">
                {p.views !== null && <span>👁️ {fmt(p.views)}</span>}
                <span>❤️ {fmt(p.curtidas)}</span>
                <span>💬 {fmt(p.comentarios)}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-muted/70">Os {feed.length} posts mais recentes · atualiza ao abrir a aba</p>
    </div>
  );
}
