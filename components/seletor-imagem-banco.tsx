"use client";

// Seletor VISUAL de imagem do banco da marca — reusado em feed, carrossel e story.
// O dono VÊ todas as fotos (com a descrição) e escolhe a que quer, em vez de ficar girando
// no rodízio. Quando recebe `texto` (o conteúdo do post/slide), as fotos que mais COMBINAM
// aparecem primeiro (ordenação por palavras em comum, feita no servidor).

import { useState, useEffect } from "react";
import { imagensDoBanco, type ImagemBanco } from "@/app/actions/imagens";
import { CATEGORIA_LABEL as ROTULO } from "@/lib/categorias-imagem";

export function SeletorImagemBanco({ marcaId, texto, atual, onEscolher, onFechar }: {
  marcaId: string;
  texto?: string;
  atual?: string | null; // url da imagem atual do post (pra marcar "atual" na grade)
  onEscolher: (url: string) => void;
  onFechar: () => void;
}) {
  const [imagens, setImagens] = useState<ImagemBanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      const r = await imagensDoBanco(marcaId, texto).catch(() => null);
      if (!vivo) return;
      if (r?.ok) setImagens(r.imagens);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [marcaId, texto]);

  const cats = Array.from(new Set(imagens.map((i) => i.categoria)));
  const b = busca.trim().toLowerCase();
  const filtradas = imagens.filter((i) => (!cat || i.categoria === cat) && (!b || i.descricao.toLowerCase().includes(b)));
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/92 backdrop-blur-sm" onClick={onFechar}>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
          <p className="text-sm font-bold text-white">🖼️ Escolher imagem do banco</p>
          {texto?.trim() && <span className="hidden text-[11px] text-amber-300/90 sm:inline">✨ as que mais combinam com o post aparecem primeiro</span>}
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 buscar na descrição…" className="input-base ml-auto mt-0 w-44" />
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">✕</button>
        </div>

        {/* chips de categoria */}
        {imagens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-linha px-4 py-2">
            <button type="button" onClick={() => setCat("")} className={chip(cat === "")}>Todas ({imagens.length})</button>
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={chip(cat === c)}>{ROTULO[c as keyof typeof ROTULO] ?? c} ({imagens.filter((i) => i.categoria === c).length})</button>
            ))}
          </div>
        )}

        {/* grade */}
        <div className="flex-1 overflow-y-auto p-4">
          {carregando ? (
            <p className="py-10 text-center text-sm text-muted">Carregando imagens…</p>
          ) : filtradas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{imagens.length === 0 ? "Nenhuma foto no banco. Suba fotos reais na aba 🖼️ Imagens." : "Nada com esse filtro."}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {filtradas.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => { onEscolher(img.url); onFechar(); }}
                  title={img.descricao || "Usar esta imagem"}
                  className={`group relative overflow-hidden rounded-lg border-2 transition ${atual === img.url ? "border-vermelho" : "border-transparent hover:border-white/40"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                  {atual === img.url && <span className="absolute left-1 top-1 rounded-full bg-vermelho px-1.5 py-0.5 text-[9px] font-bold text-white">✓ atual</span>}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">usar esta</span>
                  {img.descricao && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[9px] text-white/90">🔍 {img.descricao}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
