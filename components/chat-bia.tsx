"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { perguntarBia } from "@/app/actions/bia";
import { type MsgBia } from "@/lib/bia-tipos";

// Chat flutuante de SUPORTE: a Bia responde dúvidas da plataforma (via IA). Quando ela
// não dá conta, o botão do WhatsApp leva pro suporte humano. Não persiste nada no banco —
// a conversa vive só enquanto a aba está aberta (suporte rápido, sem peso).

const WHATS = "https://wa.me/5515981121710?text=" + encodeURIComponent("Oi! Preciso de ajuda com o Postaí.");

const SUGESTOES = [
  "Como o piloto automático funciona?",
  "Por que um post não foi publicado?",
  "Como troco os dias e horários?",
  "O que é o banco de imagens?",
];

export function ChatBia({ nome }: { nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<MsgBia[]>([
    { de: "bia", texto: `Oi, ${nome.split(" ")[0]}! Sou a Bia 💜 Posso te ajudar com qualquer dúvida do Postaí. O que você quer saber?` },
  ]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, aberto, carregando]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || carregando) return;
    const novas: MsgBia[] = [...msgs, { de: "user", texto: q }];
    setMsgs(novas);
    setTexto("");
    setCarregando(true);
    const r = await perguntarBia(novas);
    setCarregando(false);
    setMsgs((m) => [...m, { de: "bia", texto: r.ok ? r.resposta : r.erro }]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-vermelho text-2xl shadow-lg transition hover:bg-vermelho-hover"
        aria-label={aberto ? "Fechar conversa com a Bia" : "Falar com a Bia"}
      >
        {aberto ? "✕" : "💬"}
      </button>

      {aberto && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[30rem] max-h-[75vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-linha bg-preto-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-linha bg-preto p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7c3aed]/25 text-base font-bold text-[#c7b2ff]">B</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Bia</p>
              <p className="text-[11px] text-muted">sua assistente do Postaí</p>
            </div>
          </div>

          {/* Mensagens */}
          <div className="scroll-bonito flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.de === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${m.de === "user" ? "bg-vermelho text-white" : "bg-preto text-white/90"}`}>
                  {m.texto}
                </div>
              </div>
            ))}
            {carregando && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-preto px-3 py-2 text-[13px] text-muted">Bia está digitando…</div>
              </div>
            )}
            {msgs.length === 1 && !carregando && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {SUGESTOES.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => enviar(sug)}
                    className="rounded-full border border-linha px-2.5 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
            <div ref={fimRef} />
          </div>

          {/* Input + saída pro WhatsApp */}
          <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="border-t border-linha p-2">
            <div className="flex items-center gap-2">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreve sua dúvida…"
                className="flex-1 rounded-lg border border-linha bg-preto px-3 py-2 text-[13px] text-white outline-none placeholder:text-muted focus:border-vermelho"
              />
              <button
                type="submit"
                disabled={carregando || !texto.trim()}
                className="rounded-lg bg-vermelho px-3 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-40"
                aria-label="Enviar"
              >
                ➤
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              Não resolveu?{" "}
              <Link href="/painel/chamados" onClick={() => setAberto(false)} className="font-semibold text-white/80 underline-offset-2 transition hover:text-white hover:underline">
                🎫 Abrir um chamado
              </Link>{" "}
              ou{" "}
              <a href={WHATS} target="_blank" rel="noopener noreferrer" className="underline-offset-2 transition hover:text-white hover:underline">
                📲 WhatsApp
              </a>
            </p>
          </form>
        </div>
      )}
    </>
  );
}
