"use client";

import { useState } from "react";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";

// 🤖 O QUE O PILOTO VAI POSTAR SOZINHO. O piloto roda de hora em hora e publica tudo que
// está "A postar" com o horário JÁ chegado. Este painel deixa isso VISÍVEL pro dono não
// ser pego de surpresa: os "atrasados" (horário já passou) saem na próxima passada; os
// "agendados" saem quando a data/hora chegar. Postar na mão ou excluir tira o item daqui.

type Item = { tipo: string; icone: string; titulo: string; data: string };

function fmt(iso: string): string {
  const d = new Date(iso);
  const dm = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dm} às ${hm}`;
}

export function PilotoResumo({
  posts,
  publicacoes,
  stories,
  reels,
}: {
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  reels: PublicacaoView[];
}) {
  const [aberto, setAberto] = useState(false);
  const agora = Date.now();

  const itens: Item[] = [
    ...posts.filter((p) => p.status === "a_postar").map((p) => ({ tipo: "Carrossel", icone: "🖼️", titulo: p.titulo, data: p.data })),
    ...publicacoes.filter((p) => p.status === "a_postar").map((p) => ({ tipo: "Feed", icone: "📱", titulo: p.titulo, data: p.data })),
    ...stories.filter((p) => p.status === "a_postar").map((p) => ({ tipo: "Story", icone: "🟣", titulo: p.titulo, data: p.data })),
    ...reels.filter((p) => p.status === "a_postar").map((p) => ({ tipo: "Reels", icone: "🎬", titulo: p.titulo, data: p.data })),
  ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  const atrasados = itens.filter((i) => new Date(i.data).getTime() <= agora);

  if (itens.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-linha bg-preto-card px-4 py-3">
        <p className="text-sm text-muted">🤖 <strong className="font-semibold text-white">Piloto automático:</strong> nada agendado — ele não vai postar nada sozinho agora.</p>
      </div>
    );
  }

  return (
    <div className={`mb-4 rounded-xl border bg-preto-card ${atrasados.length ? "border-amber-500/50" : "border-linha"}`}>
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="text-sm text-white">
          🤖 <strong className="font-semibold">Piloto automático</strong> vai postar sozinho <strong className="font-semibold">{itens.length}</strong> {itens.length === 1 ? "item" : "itens"}
          {atrasados.length > 0 && <span className="ml-1 text-amber-300">· {atrasados.length} sai na próxima hora ⚠️</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">{aberto ? "▾ ocultar" : "▸ ver"}</span>
      </button>

      {aberto && (
        <div className="border-t border-linha px-4 py-3">
          <ul className="flex flex-col gap-2">
            {itens.map((it, i) => {
              const atrasado = new Date(it.data).getTime() <= agora;
              return (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-white">
                    <span className="text-muted">{it.icone} {it.tipo}</span> · {it.titulo}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${atrasado ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-linha text-muted"}`}>
                    {atrasado ? "sai na próxima hora" : fmt(it.data)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            O piloto roda de hora em hora e publica o que está <strong className="text-white/80">A postar</strong> quando o horário chega. Pra <strong className="text-white/80">cancelar</strong> um, é só <strong className="text-white/80">Excluir</strong> nas abas abaixo; pra adiar, mude o dia/hora. Cada item é postado <strong className="text-white/80">uma vez só</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
