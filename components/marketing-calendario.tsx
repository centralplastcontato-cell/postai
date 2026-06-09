"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { sortearImagemBancoAction } from "@/app/actions/imagens";
import {
  gerarCarrossel,
  regerarCarrossel,
  regerarSlide,
  gerarImagemSlide,
  definirImagemSlide,
  removerImagemSlide,
  postarInstagram,
  sugerirTemas,
  marcarConteudo,
} from "@/app/actions/marketing";
import { ConfirmDialog } from "./confirm-dialog";

export type Post = {
  id: string;
  slug: string;
  data: string;
  titulo: string;
  legenda: string;
  hashtags: string;
  slides: string[];
  status: string;
  tema?: string | null;
  imagensSlides?: (string | null)[];
};

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function MarketingCalendario({
  marcaId,
  posts,
  selId,
  onSelId,
  dataAlvo,
  onGerado,
}: {
  marcaId: string;
  posts: Post[];
  selId: string | null;
  onSelId: (id: string | null) => void;
  dataAlvo: string | null;
  onGerado: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tema, setTema] = useState("");
  const [nSlides, setNSlides] = useState(7);
  const [erro, setErro] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [legendaAberta, setLegendaAberta] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [slideProcessando, setSlideProcessando] = useState<number | null>(null);
  const [postando, setPostando] = useState(false);
  const [erroPost, setErroPost] = useState<string | null>(null);
  const [temasIA, setTemasIA] = useState<string[]>([]);
  const [sugerindo, setSugerindo] = useState(false);
  const [postarAlvo, setPostarAlvo] = useState<Post | null>(null);

  const selecionado = posts.find((p) => p.id === selId) ?? null;

  // Ao escolher um dia comemorativo, já sugere o tema do carrossel com a data
  // (ex: "Dia dos Namorados"). O dono ajusta ou gera direto.
  useEffect(() => {
    if (!dataAlvo) return;
    const dc = dataComemorativaDe(dataAlvo);
    if (dc?.sugestao) setTema(dc.sugestao);
  }, [dataAlvo]);

  function handleGerar() {
    setErro(null);
    if (!dataAlvo) {
      setErro("Clique num dia livre no calendário pra escolher a data do post.");
      return;
    }
    startTransition(async () => {
      const r = await gerarCarrossel({ marcaId, tema, data: dataAlvo, nSlides });
      if (r.ok) {
        setTema("");
        onSelId(r.id);
        onGerado();
        router.refresh();
      } else setErro(r.erro);
    });
  }
  function handleRegerar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await regerarCarrossel(id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });
  }
  function handleSugerirTemas() {
    setErro(null);
    setSugerindo(true);
    startTransition(async () => {
      const r = await sugerirTemas(marcaId);
      if (r.ok) setTemasIA(r.temas);
      else setErro(r.erro);
      setSugerindo(false);
    });
  }
  function handlePostar(p: Post) {
    setPostarAlvo(p);
  }
  async function confirmarPostar(p: Post) {
    setErroPost(null);
    setPostando(true);
    try {
      const r = await postarInstagram(p.id);
      if (!r.ok) setErroPost(r.erro);
      router.refresh();
    } finally {
      setPostando(false);
    }
  }
  function handleGerarImagem(id: string, indice: number) {
    setErro(null);
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await gerarImagemSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleBancoSlide(id: string, indice: number) {
    setErro(null);
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await sortearImagemBancoAction(marcaId);
      if (!r.ok) {
        setErro(r.erro);
        setSlideProcessando(null);
        return;
      }
      const d = await definirImagemSlide({ id, indice, url: r.url });
      if (!d.ok) setErro(d.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  async function handleUploadImagem(id: string, indice: number, file: File | undefined) {
    if (!file) return;
    setSlideProcessando(indice);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Falha no upload.");
        return;
      }
      const r = await definirImagemSlide({ id, indice, url: data.url });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
    } finally {
      setSlideProcessando(null);
    }
  }
  function handleRemoverImagem(id: string, indice: number) {
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await removerImagemSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleRegerarSlide(id: string, indice: number) {
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await regerarSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  async function baixarTodas(p: Post) {
    setBaixando(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await Promise.all(
        p.slides.map(async (src, i) => {
          const resp = await fetch(src);
          zip.file(`slide-${i + 1}.png`, await resp.blob());
        })
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `carrossel-${p.slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não consegui baixar agora.");
    } finally {
      setBaixando(false);
    }
  }
  function copiar(p: Post) {
    navigator.clipboard.writeText(`${p.legenda}\n\n${p.hashtags}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div>
      {imgExpandida && (
        <div onClick={() => setImgExpandida(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgExpandida} alt="Slide" className="h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-lg border border-linha" />
          <button onClick={() => setImgExpandida(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      {/* Gerar carrossel */}
      <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-white">Gerar carrossel com IA</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs text-muted">
            Tema
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: novidades da semana" className="input-base" />
          </label>
          <div className="text-xs text-muted">
            Dia do post
            <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
              {dataAlvo ? <span className="font-semibold text-white">📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)}</span> : <span className="text-muted">Clique num dia livre ↑</span>}
            </div>
          </div>
          <div className="text-xs text-muted">
            Nº de artes
            <select value={nSlides} onChange={(e) => setNSlides(Number(e.target.value))} className="input-base">
              {[4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} slides</option>)}
            </select>
          </div>
          <button onClick={handleGerar} disabled={isPending || !tema.trim()} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar"}
          </button>
        </div>
        <div className="mt-3">
          <button type="button" onClick={handleSugerirTemas} disabled={sugerindo} className="flex items-center gap-1 text-xs uppercase tracking-wider text-amber-300 transition hover:text-amber-200 disabled:opacity-50">
            {sugerindo ? "💡 Pensando…" : "💡 Sugerir temas com IA"}
          </button>
          {temasIA.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {temasIA.map((t) => (
                <button key={t} type="button" onClick={() => setTema(t)} className="rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1 text-xs text-amber-200 transition hover:border-amber-400 hover:text-white">{t}</button>
              ))}
            </div>
          )}
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      </div>

      {/* Detalhe do post selecionado */}
      {selecionado && (
        <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{dataBR(selecionado.data)}</p>
              <h3 className="display text-lg text-white sm:text-xl">{selecionado.titulo}</h3>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${selecionado.status === "postado" ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{selecionado.status === "postado" ? "Postado" : "A postar"}</span>
          </div>

          <div className="scroll-bonito mt-4 flex gap-3 overflow-x-auto pb-3">
            {selecionado.slides.map((src, i) => (
              <div key={src} className="shrink-0">
                <button type="button" onClick={() => setImgExpandida(src)} title="Ampliar" className="block overflow-hidden rounded-md border border-linha transition hover:border-vermelho">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Slide ${i + 1}`} className="h-auto w-[100px] sm:w-[120px]" />
                </button>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                  <button type="button" onClick={() => handleRegerarSlide(selecionado.id, i)} disabled={slideProcessando !== null} title="Regerar texto" className="rounded border border-linha px-1.5 py-0.5 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🔄</button>
                  <button type="button" onClick={() => handleBancoSlide(selecionado.id, i)} disabled={slideProcessando !== null} title="Sortear foto real do banco" className="rounded border border-linha px-1.5 py-0.5 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🎲</button>
                  <button type="button" onClick={() => handleGerarImagem(selecionado.id, i)} disabled={slideProcessando !== null} title="Fundo abstrato com IA (não mostra ambiente real)" className="rounded border border-linha px-1.5 py-0.5 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🖼️</button>
                  <label title="Enviar foto" className="cursor-pointer rounded border border-linha px-1.5 py-0.5 text-[11px] text-muted transition hover:border-vermelho hover:text-white">📤<input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImagem(selecionado.id, i, e.target.files?.[0])} /></label>
                  {selecionado.imagensSlides?.[i] && (
                    <button type="button" onClick={() => handleRemoverImagem(selecionado.id, i)} disabled={slideProcessando !== null} title="Remover imagem" className="rounded border border-linha px-1.5 py-0.5 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">✕</button>
                  )}
                </div>
                {slideProcessando === i && <p className="mt-1 text-center text-[10px] text-muted">Processando…</p>}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button type="button" onClick={() => setLegendaAberta((v) => !v)} className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wider text-muted transition hover:text-white"><span>{legendaAberta ? "▾" : "▸"}</span> Legenda + hashtags</button>
            {legendaAberta && (
              <pre className="scroll-bonito max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-3 text-sm text-white">{selecionado.legenda}{"\n\n"}{selecionado.hashtags}</pre>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => baixarTodas(selecionado)} disabled={baixando} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{baixando ? "Baixando…" : "⬇ Baixar (.zip)"}</button>
            <button onClick={() => copiar(selecionado)} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho">{copiado ? "✓ Copiado!" : "Copiar texto"}</button>
            {selecionado.tema && (
              <button onClick={() => handleRegerar(selecionado.id)} disabled={isPending} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">↻ Regerar</button>
            )}
            {selecionado.status !== "postado" && (
              <button onClick={() => handlePostar(selecionado)} disabled={postando} className="rounded-lg bg-[#C13584] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">{postando ? "Postando…" : "📷 Postar no Instagram"}</button>
            )}
            <form action={marcarConteudo}>
              <input type="hidden" name="id" value={selecionado.id} />
              <input type="hidden" name="status" value={selecionado.status === "postado" ? "a_postar" : "postado"} />
              <button className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho">{selecionado.status === "postado" ? "Desmarcar postado" : "✓ Marcar postado"}</button>
            </form>
          </div>
          {erroPost && <p className="mt-3 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{erroPost}</p>}
        </div>
      )}

      <ConfirmDialog
        aberto={!!postarAlvo}
        titulo="Postar no Instagram agora?"
        descricao={postarAlvo ? `"${postarAlvo.titulo}" vai ao ar de verdade no perfil da marca.` : undefined}
        textoConfirmar="Postar agora"
        onConfirmar={() => {
          if (postarAlvo) confirmarPostar(postarAlvo);
          setPostarAlvo(null);
        }}
        onCancelar={() => setPostarAlvo(null)}
      />
    </div>
  );
}
