"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { excluirMarca } from "@/app/actions/marcas";

// Botão (canto do card) + modal de confirmação FORTE pra excluir uma marca e TUDO dela.
// Fica sobre um <Link> (o card), então cada clique faz preventDefault+stopPropagation pra
// não navegar pra dentro da marca. Só o admin vê (a página decide).
export function ExcluirMarcaBtn({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const trava = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  async function confirmarExcluir(e: React.MouseEvent) {
    trava(e);
    setExcluindo(true);
    setErro(null);
    try {
      const r = await excluirMarca(id);
      if (!r.ok) { setErro(r.erro); setExcluindo(false); return; }
      setConfirmar(false);
      router.refresh();
    } catch {
      setErro("Não consegui excluir agora. Tente de novo.");
      setExcluindo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { trava(e); setErro(null); setConfirmar(true); }}
        title="Excluir marca"
        aria-label="Excluir marca"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-linha bg-preto/80 text-xs text-red-400 transition hover:border-red-500 hover:bg-red-900/40"
      >
        🗑
      </button>

      {confirmar && (
        <div onClick={(e) => { trava(e); if (!excluindo) setConfirmar(false); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={trava} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-semibold text-white">Excluir a marca “{nome}”?</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Isso apaga <strong className="text-red-300">TUDO</strong> dela — fotos, festas, carrosséis, publicações, stories e métricas. <strong className="text-white/80">Não dá pra desfazer.</strong>
            </p>
            {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={(e) => { trava(e); setConfirmar(false); }} disabled={excluindo} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={confirmarExcluir} disabled={excluindo} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">{excluindo ? "Excluindo…" : "Excluir tudo"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
