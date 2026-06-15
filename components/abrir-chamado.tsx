"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { abrirChamado } from "@/app/actions/chamados";

// Botão "Abrir um chamado" que expande num formulário (assunto + mensagem). Ao enviar,
// cria o chamado e leva direto pra conversa dele.
export function AbrirChamado() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const fd = new FormData();
    fd.set("assunto", assunto);
    fd.set("texto", texto);
    const r = await abrirChamado(fd);
    if (r.ok) {
      router.push(`/painel/chamados/${r.id}`);
      return;
    }
    setEnviando(false);
    setErro(r.erro);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover"
      >
        ✏️ Abrir um chamado
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-xl border border-linha bg-preto-card p-4">
      <input
        value={assunto}
        onChange={(e) => setAssunto(e.target.value)}
        required
        maxLength={120}
        placeholder="Assunto (ex: um post não foi publicado)"
        className="input-base"
      />
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        required
        maxLength={4000}
        rows={4}
        placeholder="Conte com detalhes a sua dúvida ou problema…"
        className="input-base resize-y"
      />
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      <div className="flex gap-2">
        <button
          disabled={enviando}
          className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar chamado"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
