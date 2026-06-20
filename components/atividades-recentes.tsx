"use client";

import { useState } from "react";
import { usePainelColapsavel } from "./use-painel-colapsavel";

// Mostra o que o piloto automático fez (ou TENTOU fazer) — postagens e, principalmente,
// os erros. Antes isso era gravado no banco e nunca exibido: quando uma postagem falhava,
// o dono ficava no escuro. Aqui o motivo aparece em vermelho, na hora.

export type Ativ = { id: string; agente: string; texto: string; criadoEm: string };

const INICIAIS = 6; // quantas aparecem antes do "Ver todas"

function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

const ehErro = (t: string) => /n[ãa]o consegui|falhou|erro/i.test(t);

export function AtividadesRecentes({ atividades }: { atividades: Ativ[] }) {
  const painel = usePainelColapsavel("atividades");
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? atividades : atividades.slice(0, INICIAIS);

  return (
    <div className="mt-5 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <button type="button" onClick={painel.alternar} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-white">🛰️ Atividades da Bia <span className="font-normal text-muted">— o que a sua assistente postou ou tentou postar</span></span>
        <span className="shrink-0 rounded-md border border-linha px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">{painel.aberto ? "▾ recolher" : "▸ expandir"}</span>
      </button>

      {painel.aberto &&
        (atividades.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nada por aqui ainda. Quando o piloto postar (ou tentar), aparece aqui.</p>
        ) : (
          <>
            <ul className={`mt-3 space-y-1.5 ${todas ? "scroll-bonito max-h-96 overflow-y-auto pr-1" : ""}`}>
              {visiveis.map((a) => {
                const erro = ehErro(a.texto);
                return (
                  <li key={a.id} className={`flex gap-2 rounded-md border px-3 py-2 text-xs ${erro ? "border-red-900/60 bg-red-950/30 text-red-200" : "border-linha bg-preto text-white/90"}`}>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${erro ? "bg-red-500/20 text-red-200" : "bg-[#7c3aed]/25 text-[#c7b2ff]"}`}
                      title={a.agente}
                    >
                      {erro ? "⚠️" : "B"}
                    </span>
                    <span className="min-w-0 break-words">
                      <strong className="font-semibold">{a.agente}</strong>
                      <span className="text-muted"> · {quando(a.criadoEm)}</span>
                      <br />
                      {a.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
            {atividades.length > INICIAIS && (
              <button type="button" onClick={() => setTodas((t) => !t)} className="mt-2 text-xs font-semibold text-muted transition hover:text-white">
                {todas ? "▴ Ver menos" : `▾ Ver todas (${atividades.length})`}
              </button>
            )}
          </>
        ))}
    </div>
  );
}
