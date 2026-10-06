"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalExcluirMarca } from "@/components/modal-excluir-marca";

// Botão (canto do card) + modal de confirmação FORTE pra excluir uma marca e TUDO dela.
// Fica sobre um <Link> (o card), então cada clique faz preventDefault+stopPropagation pra
// não navegar pra dentro da marca. Só o admin vê (a página decide).
export function ExcluirMarcaBtn({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const trava = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { trava(e); setConfirmar(true); }}
        title="Excluir marca"
        aria-label="Excluir marca"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-linha bg-preto/80 text-xs text-red-400 transition hover:border-red-500 hover:bg-red-900/40"
      >
        🗑
      </button>
      {confirmar && <ModalExcluirMarca id={id} nome={nome} onFechar={() => setConfirmar(false)} onExcluida={() => { setConfirmar(false); router.refresh(); }} />}
    </>
  );
}
