"use client";

// Modal pra ESCOLHER as fotos do vídeo da festa, NA ORDEM, em DUAS grades de fotos GRANDES:
//  1) "Sua sequência" — as escolhidas, numeradas, ARRASTÁVEIS pra reordenar (× pra tirar);
//  2) "Adicionar" — as disponíveis, toque na ordem que quiser e elas sobem pra sequência.
// Arrastar acontece nas próprias fotos grandes (não numa tira pequena). Vazio = automático.

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { salvarFotosVideo, gerarVideoDaFesta } from "@/app/actions/festas";
import { type FotoView } from "@/lib/festa-tipos";

const ORDEM = ["salao", "brinquedos", "aniversariante", "parabens", "momentos"];
const LABEL: Record<string, string> = {
  salao: "🎀 Salão",
  brinquedos: "🎠 Brinquedos",
  aniversariante: "👑 Aniversariante",
  parabens: "🎉 Parabéns",
  momentos: "📸 Momentos",
};

const MOLDURAS_UI = [
  { id: "nenhuma", label: "Sem moldura" },
  { id: "branca", label: "Branca" },
  { id: "grossa", label: "Branca grossa" },
  { id: "marca", label: "Cor da marca" },
];

// Estilo da moldura no PREVIEW (aproxima o que o motor faz: borda colorida ao redor da foto).
// `esc` escala a espessura — 1 no mini-preview, maior no modal ampliado.
function estiloMoldura(m: string, cor: string, esc = 1): CSSProperties {
  if (m === "branca") return { padding: 3 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "grossa") return { padding: 6 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "marca") return { padding: 3 * esc, background: cor, borderRadius: 2 };
  return {};
}

export function SeletorVideoFotos({ festaId, nome, fotos, inicial, capaInicial = "", molduraInicial = "branca", corMarca = "#E11D2A", jaTemVideo = false, onFechar }: {
  festaId: string;
  nome: string;
  fotos: FotoView[];
  inicial: string[];
  capaInicial?: string;
  molduraInicial?: string;
  corMarca?: string;
  jaTemVideo?: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  // galeria ordenada por momento (narrativa) — base pra parte "disponíveis"
  const galeria = ORDEM.flatMap((m) => fotos.filter((f) => f.momento === m)).concat(fotos.filter((f) => !ORDEM.includes(f.momento)));
  const [sel, setSel] = useState<string[]>(inicial.filter((id) => fotos.some((f) => f.id === id)));
  const [salvando, setSalvando] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [ampliada, setAmpliada] = useState<FotoView | null>(null); // foto aberta em tela cheia
  const [erroGerar, setErroGerar] = useState("");
  // foto escolhida pra CAPA (fotoId). "" = a 1ª foto vira capa automaticamente.
  const [capa, setCapa] = useState<string>(fotos.some((f) => f.id === capaInicial) ? capaInicial : "");
  const [moldura, setMoldura] = useState<string>(molduraInicial || "branca"); // moldura das fotos no vídeo

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function definirCapa(id: string) {
    setCapa((c) => (c === id ? "" : id)); // clicar de novo na capa atual tira (volta pra automático)
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
    try { await salvarFotosVideo(festaId, sel, capa, moldura); } catch {}
    setSalvando(false);
    router.refresh();
    onFechar();
  }
  // Salva a seleção E dispara o motor de vídeo (o "Gerar" agora passa por aqui, depois de escolher).
  async function salvarEGerar() {
    setSalvando(true);
    setErroGerar("");
    try {
      await salvarFotosVideo(festaId, sel, capa, moldura);
      const r = await gerarVideoDaFesta(festaId).catch(() => ({ ok: false as const, erro: "Não consegui gerar agora." }));
      if (!r.ok) { setErroGerar(r.erro || "Não deu pra gerar."); setSalvando(false); return; }
      router.refresh();
      onFechar();
    } catch {
      setErroGerar("Não consegui gerar agora.");
      setSalvando(false);
    }
  }

  const segs = sel.length ? Math.round(sel.length * 2.3 + 6) : 0;
  const escolhidas = sel.map((id) => fotos.find((f) => f.id === id)).filter((f): f is FotoView => !!f);
  const disponiveis = galeria.filter((f) => !sel.includes(f.id));
  // foto de exemplo pro mini-preview da moldura (uma do slideshow, não a capa)
  const fotoPrevFV = escolhidas.find((f) => f.id !== capa) || escolhidas[0] || galeria[0];
  const fotoPrev = fotoPrevFV?.url;

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
            <button onClick={salvar} disabled={salvando} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho disabled:opacity-60">{salvando ? "…" : "Salvar"}</button>
            <button onClick={salvarEGerar} disabled={salvando || sel.length === 0} title={sel.length === 0 ? "Escolha as fotos primeiro" : "Salvar a seleção e gerar o vídeo"} className="rounded-lg bg-[#7c3aed] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-50">{jaTemVideo ? "🔄 Refazer vídeo" : "⚡ Gerar vídeo"}</button>
            <button onClick={onFechar} aria-label="Fechar" className="rounded-lg border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">✕</button>
          </div>
        </div>

        {erroGerar && <p className="border-b border-linha bg-vermelho/10 px-4 py-1.5 text-center text-xs text-vermelho">{erroGerar}</p>}

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <p className="pt-3 text-[11px] leading-relaxed text-amber-300/90">⭐ Toque na <strong className="text-amber-200">estrela</strong> de uma foto pra ela virar a <strong className="text-amber-200">capa</strong> do vídeo (entra nítida, com o título por cima). Sem escolher, a 1ª foto vira a capa.{capa && (<button type="button" onClick={() => setCapa("")} className="ml-1.5 rounded bg-white/10 px-2 py-0.5 font-semibold text-white transition hover:bg-vermelho">✕ tirar capa</button>)}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <span className="text-[11px] font-semibold text-muted">🖼️ Moldura das fotos:</span>
            {MOLDURAS_UI.map((m) => (
              <button key={m.id} type="button" onClick={() => setMoldura(m.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${moldura === m.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                {m.id === "marca" && <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: corMarca }} />}
                {m.label}
              </button>
            ))}
            {/* preview AO VIVO: como a foto fica com a moldura escolhida (atualiza no clique) — clica pra ampliar */}
            {fotoPrevFV && (
              <button type="button" onClick={() => setAmpliada(fotoPrevFV)} title="Clique pra ampliar a prévia" className="group/p ml-auto flex items-center gap-2">
                <span className="text-right text-[10px] leading-tight text-muted">como fica<br /><span className="text-[#c7b2ff] group-hover/p:underline">🔍 ampliar</span></span>
                <span className="flex items-center justify-center rounded-md bg-zinc-700/50 p-2 transition group-hover/p:bg-zinc-600/70">
                  <span className="block" style={estiloMoldura(moldura, corMarca)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoPrev} alt="" className="block h-20 w-20 object-cover" style={{ borderRadius: moldura === "nenhuma" ? 2 : 0 }} />
                  </span>
                </span>
              </button>
            )}
          </div>
          {/* 1) SUA SEQUÊNCIA — fotos grandes, arraste pra reordenar, × pra tirar */}
          {escolhidas.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 text-[11px] text-muted">
                🎞️ <strong className="text-white/80">Sua sequência</strong> — arraste as fotos pra mudar a ordem, <strong className="text-white/80">×</strong> pra tirar.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {escolhidas.map((f, i) => {
                  const ehCapa = capa === f.id;
                  return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={() => setDrag(i)}
                    onDragEnter={() => { if (drag !== null && drag !== i) { reordenar(drag, i); setDrag(i); } }}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => e.preventDefault()}
                    className={`relative cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing ${drag === i ? "border-[#c7b2ff] opacity-50" : ehCapa ? "border-amber-400" : "border-vermelho"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" draggable={false} className="aspect-square w-full select-none object-cover" />
                    <span className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-vermelho text-xs font-bold text-white shadow">{i + 1}</span>
                    <button type="button" onClick={() => toggle(f.id)} aria-label="Tirar" className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/75 text-sm leading-none text-white transition hover:bg-vermelho">×</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); definirCapa(f.id); }} aria-label={ehCapa ? "Tirar capa" : "Definir como capa"} title={ehCapa ? "Tirar como capa (clique pra remover)" : "Usar esta foto como capa do vídeo"} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${ehCapa ? "bg-black/80 text-amber-300 ring-2 ring-amber-300 hover:bg-vermelho hover:text-white hover:ring-vermelho" : "bg-black/70 text-white hover:bg-black"}`}>⭐</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAmpliada(f); }} aria-label="Ampliar" className="absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition hover:bg-black">🔍</button>
                    <span className={`absolute bottom-0 left-0 right-0 px-8 py-0.5 text-center text-[9px] font-bold ${ehCapa ? "bg-amber-400/90 text-black" : "bg-black/65 font-semibold text-white/90"}`}>{ehCapa ? "⭐ CAPA" : (LABEL[f.momento] || f.momento)}</span>
                  </div>
                  );
                })}
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
                {disponiveis.map((f) => {
                  const ehCapa = capa === f.id;
                  return (
                  <div key={f.id} onClick={() => toggle(f.id)} title="Tocar pra adicionar" className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition ${ehCapa ? "border-amber-400" : "border-transparent hover:border-white/30"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className={`aspect-square w-full object-cover transition ${ehCapa ? "" : "opacity-60 group-hover:opacity-100"}`} />
                    <button type="button" onClick={(e) => { e.stopPropagation(); definirCapa(f.id); }} aria-label={ehCapa ? "Tirar capa" : "Definir como capa"} title={ehCapa ? "Tirar como capa (clique pra remover)" : "Usar esta foto como capa do vídeo"} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${ehCapa ? "bg-black/80 text-amber-300 ring-2 ring-amber-300 hover:bg-vermelho hover:text-white hover:ring-vermelho" : "bg-black/70 text-white hover:bg-black"}`}>⭐</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAmpliada(f); }} aria-label="Ampliar" className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition hover:bg-black">🔍</button>
                    <span className={`absolute bottom-0 left-0 right-0 px-8 py-0.5 text-center text-[9px] font-bold ${ehCapa ? "bg-amber-400/90 text-black" : "bg-black/65 font-semibold text-white/90"}`}>{ehCapa ? "⭐ CAPA" : (LABEL[f.momento] || f.momento)}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* foto ampliada — mostra COM a moldura escolhida (fundo borrado), igual vai ficar no vídeo.
            Abre pelo 🔍 de qualquer foto OU pelo mini-preview "como fica". */}
        {ampliada && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={() => setAmpliada(null)}>
            <p className="text-center text-xs font-semibold text-white/80">👇 Assim essa foto vai aparecer no vídeo{moldura !== "nenhuma" ? " (com a moldura)" : ""}</p>
            <div onClick={(e) => e.stopPropagation()} className="relative aspect-[9/16] h-[76vh] max-w-full overflow-hidden rounded-2xl border-[6px] border-zinc-800 bg-black shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ampliada.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50" />
              <div className="absolute inset-0 flex items-center justify-center p-5">
                <span className="block" style={estiloMoldura(moldura, corMarca, 4)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ampliada.url} alt="" className="block max-h-[58vh] w-auto max-w-full object-contain" style={{ borderRadius: moldura === "nenhuma" ? 4 : 0 }} />
                </span>
              </div>
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">{LABEL[ampliada.momento] || ampliada.momento}</span>
            </div>
            <button onClick={() => setAmpliada(null)} className="rounded-lg border border-white/20 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}
