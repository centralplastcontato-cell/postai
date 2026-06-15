"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { responderChamado, mudarStatusChamado } from "@/app/actions/chamados";

// Ações dentro de um chamado: responder (cliente e admin) e, só pro admin, resolver/reabrir.
// Depois de cada ação dá router.refresh() pra a conversa (server component) recarregar.
export function ChamadoAcoes({ id, status, souAdmin }: { id: string; status: string; souAdmin: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro("");
    const fd = new FormData();
    fd.set("id", id);
    fd.set("texto", texto.trim());
    const r = await responderChamado(fd);
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      router.refresh();
    } else {
      setErro(r.erro);
    }
  }

  async function mudar(novo: string) {
    setErro("");
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", novo);
    const r = await mudarStatusChamado(fd);
    if (r.ok) router.refresh();
    else setErro(r.erro);
  }

  const resolvido = status === "resolvido";

  return (
    <div className="space-y-3">
      {souAdmin && (
        <div className="flex gap-2">
          {resolvido ? (
            <button
              type="button"
              onClick={() => mudar("aberto")}
              className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-white"
            >
              ↻ Reabrir chamado
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mudar("resolvido")}
              className="rounded-lg border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-xs font-semibold text-green-400 transition hover:bg-green-600/20"
            >
              ✓ Marcar como resolvido
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-linha bg-preto-card p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={souAdmin ? "Responder ao cliente…" : "Escreva sua mensagem…"}
          className="w-full resize-y rounded-lg border border-linha bg-preto px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:border-vermelho"
        />
        {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
