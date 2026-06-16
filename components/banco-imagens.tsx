"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adicionarImagemMarca, removerImagemMarca, descreverImagensDaMarca, atualizarImagemMarca } from "@/app/actions/imagens";
import { CATEGORIAS, CATEGORIA_LABEL as ROTULO } from "@/lib/categorias-imagem";

export type ImagemView = { id: string; url: string; categoria: string; descricao?: string };

// 🏰 Banco de fotos REAIS do negócio. O dono sobe fotos do espaço/brinquedos/festas
// e os posts usam elas no lugar de imagens de IA — nada de espaço "fake".
export function BancoImagens({ marcaId, imagens }: { marcaId: string; imagens: ImagemView[] }) {
  const router = useRouter();
  const [cat, setCat] = useState<string>("espaco");
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [descrevendo, setDescrevendo] = useState(false);
  const [msgDesc, setMsgDesc] = useState<string | null>(null);
  const [aberta, setAberta] = useState<ImagemView | null>(null); // foto aberta no modal
  const [descEdit, setDescEdit] = useState("");
  const [catEdit, setCatEdit] = useState("");
  const [salvandoImg, setSalvandoImg] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErro(null);
    setSubindo(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
        const data = await resp.json();
        if (!data.ok) {
          setErro(data.erro || "Falha no upload de uma das fotos.");
          continue;
        }
        const r = await adicionarImagemMarca({ marcaId, url: data.url, categoria: cat });
        if (!r.ok) setErro(r.erro);
      }
      router.refresh();
    } catch {
      setErro("Não consegui subir as fotos. (O Blob Store está configurado?)");
    } finally {
      setSubindo(false);
    }
  }
  function remover(id: string) {
    startTransition(async () => {
      await removerImagemMarca(id);
      router.refresh();
    });
  }
  // A IA "olha" cada foto sem descrição e descreve (1x) — pra casar a foto certa com o texto
  // do post. Fotos novas já nascem descritas; este botão é pras antigas.
  async function descrever() {
    setMsgDesc(null);
    setDescrevendo(true);
    try {
      const n = await descreverImagensDaMarca(marcaId);
      setMsgDesc(n > 0 ? `✓ A IA descreveu ${n} ${n === 1 ? "foto" : "fotos"}. 📷` : "Todas as fotos já estavam descritas. ✅");
      router.refresh();
    } catch {
      setMsgDesc("Não consegui descrever agora. Tente de novo.");
    } finally {
      setDescrevendo(false);
    }
  }

  function abrirImagem(img: ImagemView) {
    setAberta(img);
    setDescEdit(img.descricao || "");
    setCatEdit(img.categoria);
  }
  async function salvarImagem() {
    if (!aberta) return;
    setSalvandoImg(true);
    try {
      const r = await atualizarImagemMarca({ id: aberta.id, descricao: descEdit, categoria: catEdit });
      if (r.ok) { setAberta(null); router.refresh(); }
      else setErro(r.erro);
    } finally {
      setSalvandoImg(false);
    }
  }

  const descritas = imagens.filter((i) => i.descricao && i.descricao.trim()).length;

  return (
    <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      {/* Modal: ver a foto grande + ler/editar a descrição e a categoria */}
      {aberta && (
        <div onClick={() => setAberta(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl border border-linha bg-preto-card p-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aberta.url} alt="foto" className="max-h-[50vh] w-full rounded-lg object-contain sm:max-h-[70vh] sm:w-1/2" />
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-semibold text-white">✏️ Editar foto</p>
              <label className="mt-3 block text-xs text-muted">Categoria
                <select value={catEdit} onChange={(e) => setCatEdit(e.target.value)} className="input-base">
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO[c] ?? c}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-xs text-muted">Descrição <span className="text-muted/70">(a IA usa pra escolher esta foto quando combinar com o post)</span>
                <textarea value={descEdit} onChange={(e) => setDescEdit(e.target.value)} rows={3} placeholder="Ex: Mesa de doces colorida" className="input-base resize-none" />
              </label>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={salvarImagem} disabled={salvandoImg} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{salvandoImg ? "Salvando…" : "Salvar"}</button>
                <button type="button" onClick={() => setAberta(null)} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <h3 className="mb-1 text-sm font-semibold text-white">🏰 Banco de imagens reais</h3>
      <p className="mb-3 text-xs text-muted">Suba fotos <strong className="text-white/80">de verdade</strong> do seu espaço, brinquedos, festas e comida. Os posts usam essas fotos no lugar de imagens de IA — pra nunca mostrar um lugar que não existe.</p>

      {/* Subir: escolhe a categoria e manda (aceita várias de uma vez) */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-linha bg-preto p-3">
        <label className="text-xs text-muted">
          Categoria
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input-base">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{ROTULO[c] ?? c}</option>
            ))}
          </select>
        </label>
        <label className="cursor-pointer rounded-md border border-linha px-3 py-2 text-xs font-semibold text-white transition hover:border-vermelho">
          {subindo ? "Subindo…" : "📤 Subir fotos"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        </label>
        <span className="text-[11px] text-muted">Dá pra subir várias de uma vez.</span>
      </div>

      {/* Descrever com IA — pra a foto certa casar com o texto do post (a "visão" roda 1x por foto) */}
      {imagens.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
          <button type="button" onClick={descrever} disabled={descrevendo} className="shrink-0 rounded-md border border-purple-400/50 bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-100 transition hover:bg-purple-500/25 disabled:opacity-50">
            {descrevendo ? "🔍 Descrevendo…" : "🔍 Descrever fotos com IA"}
          </button>
          <span className="text-[11px] text-muted">A IA olha cada foto e escreve uma descrição, pra escolher a foto certa pra cada post. <strong className="text-white/80">{descritas} de {imagens.length}</strong> descritas. <span className="text-white/60">As novas já nascem descritas.</span></span>
        </div>
      )}
      {msgDesc && <p className="mb-3 text-sm text-purple-200">{msgDesc}</p>}
      {erro && <p className="mb-3 text-sm text-red-400">{erro}</p>}

      {imagens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">Nenhuma foto ainda. Suba fotos reais do seu buffet acima. 🎉</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imagens.map((img) => (
            <div key={img.id} onClick={() => abrirImagem(img)} title="Abrir pra ver/editar" className="group relative cursor-pointer overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.categoria} className="aspect-square w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{ROTULO[img.categoria as keyof typeof ROTULO] ?? img.categoria}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remover(img.id); }}
                title="Remover"
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-red-300 transition hover:bg-red-900/70"
              >
                ✕
              </button>
              {img.descricao ? (
                <span title={img.descricao} className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-[9px] leading-tight text-white/90">🔍 {img.descricao}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
