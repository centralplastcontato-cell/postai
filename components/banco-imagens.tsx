"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adicionarImagemMarca, removerImagemMarca } from "@/app/actions/imagens";
import { CATEGORIAS } from "@/lib/categorias-imagem";

export type ImagemView = { id: string; url: string; categoria: string };

const ROTULO: Record<string, string> = {
  espaco: "🏰 Espaço",
  brinquedos: "🎠 Brinquedos",
  festa: "🎉 Festa",
  comida: "🍰 Comida",
  geral: "📷 Geral",
};

// 🏰 Banco de fotos REAIS do negócio. O dono sobe fotos do espaço/brinquedos/festas
// e os posts usam elas no lugar de imagens de IA — nada de espaço "fake".
export function BancoImagens({ marcaId, imagens }: { marcaId: string; imagens: ImagemView[] }) {
  const router = useRouter();
  const [cat, setCat] = useState<string>("espaco");
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  return (
    <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
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
      {erro && <p className="mb-3 text-sm text-red-400">{erro}</p>}

      {imagens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">Nenhuma foto ainda. Suba fotos reais do seu buffet acima. 🎉</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imagens.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-lg border border-linha">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.categoria} className="aspect-square w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{ROTULO[img.categoria] ?? img.categoria}</span>
              <button
                type="button"
                onClick={() => remover(img.id)}
                title="Remover"
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-red-300 transition hover:bg-red-900/70"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
