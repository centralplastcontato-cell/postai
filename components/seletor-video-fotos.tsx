"use client";

// Modal pra ESCOLHER as fotos do vídeo da festa, NA ORDEM, em DUAS grades de fotos GRANDES:
//  1) "Sua sequência" — as escolhidas, numeradas, ARRASTÁVEIS pra reordenar (× pra tirar);
//  2) "Adicionar" — as disponíveis, toque na ordem que quiser e elas sobem pra sequência.
// Arrastar acontece nas próprias fotos grandes (não numa tira pequena). Vazio = automático.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarFotosVideo } from "@/app/actions/festas";
import { type FotoView } from "@/lib/festa-tipos";

const ORDEM = ["salao", "brinquedos", "aniversariante", "parabens", "momentos"];
const LABEL: Record<string, string> = {
  salao: "🎀 Salão",
  brinquedos: "🎠 Brinquedos",
  aniversariante: "👑 Aniversariante",
  parabens: "🎉 Parabéns",
  momentos: "📸 Momentos",
};

export function SeletorVideoFotos({ festaId, nome, fotos, inicial, onFechar }: {
  festaId: string;
  nome: string;
  fotos: FotoView[];
  inicial: string[];
  onFechar: () => void;
}) {
  const router = useRouter();
  // galeria ordenada por momento (narrativa) — base pra parte "disponíveis"
  const galeria = ORDEM.flatMap((m) => fotos.filter((f) => f.momento === m)).concat(fotos.filter((f) => !ORDEM.includes(f.momento)));
  const [sel, setSel] = useState<string[]>(inicial.filter((id) => fotos.some((f) => f.id === id)));
  const [salvando, setSalvando] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function reordenar(from: number, to: number) {
    if (from === to) return;
    setSel((s) => {
      const arr = [...s];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }
  function sugerir() {
    const sug: string[] = [];
    for (const m of ORDEM) sug.push(...fotos.filter((f) => f.momento === m).slice(0, 5).map((f) => f.id));
    setSel(sug.slice(0, 24));
  }
  async function salvar() {
    setSalvando(true);
    try { await salvarFotosVideo(festaId, sel); } catch {}
    setSalvando(false);
    router.refresh();
    onFechar();
  }

  const segs = sel.length ? Math.round(sel.length * 2.3 + 6) : 0;
  const escolhidas = sel.map((id) => fotos.find((f) => f.id === id)).filter((f): f is FotoView => !!f);
  const disponiveis = galeria.filter((f) => !sel.includes(f.id));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm" onClick={onFechar}>
      <div className="flex flex-1 flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
          <p className="text-sm font-bold text-white">🎬 Fotos do vídeo — {nome}</p>
          <span className="text-xs text-muted">
            {sel.length} {sel.length === 1 ? "foto" : "fotos"}{segs > 0 ? ` · ≈ ${segs}s` : ""}
            {segs > 90 && <span className="ml-1 font-semibold text-vermelho">(passa de 90s!)</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={sugerir} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">✨ Sugerir</button>
            {sel.length > 0 && <button onClick={() => setSel([])} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-white">Limpar</button>}
            <button onClick={salvar} disabled={salvando} className="rounded-lg bg-vermelho px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">{salvando ? "Salvando…" : "Salvar"}</button>
            <button onClick={onFechar} aria-label="Fechar" className="rounded-lg border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* 1) SUA SEQUÊNCIA — fotos grandes, arraste pra reordenar, × pra tirar */}
          {escolhidas.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 text-[11px] text-muted">
                🎞️ <strong className="text-white/80">Sua sequência</strong> — arraste as fotos pra mudar a ordem, <strong className="text-white/80">×</strong> pra tirar.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {escolhidas.map((f, i) => (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={() => setDrag(i)}
                    onDragEnter={() => { if (drag !== null && drag !== i) { reordenar(drag, i); setDrag(i); } }}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => e.preventDefault()}
                    className={`relative cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing ${drag === i ? "border-[#c7b2ff] opacity-50" : "border-vermelho"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" draggable={false} className="aspect-square w-full select-none object-cover" />
                    <span className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-vermelho text-xs font-bold text-white shadow">{i + 1}</span>
                    <button type="button" onClick={() => toggle(f.id)} aria-label="Tirar" className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/75 text-sm leading-none text-white transition hover:bg-vermelho">×</button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/65 px-1 py-0.5 text-[9px] font-semibold text-white/90">{LABEL[f.momento] || f.momento}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2) ADICIONAR — toque na ordem que quiser e a foto sobe pra sequência */}
          {disponiveis.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-[11px] text-muted">
                {escolhidas.length > 0 ? "➕ Mais fotos" : "👆 Toque nas fotos na ordem que você quer"} — cada toque adiciona ao fim da sequência. Pra ~65s, escolha umas <strong className="text-white/80">25-28</strong>.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {disponiveis.map((f) => (
                  <button key={f.id} type="button" onClick={() => toggle(f.id)} className="relative overflow-hidden rounded-lg border-2 border-transparent transition hover:border-white/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="aspect-square w-full object-cover opacity-60 transition hover:opacity-100" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/65 px-1 py-0.5 text-[9px] font-semibold text-white/90">{LABEL[f.momento] || f.momento}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
