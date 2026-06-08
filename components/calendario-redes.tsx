"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { excluirConteudo, excluirPublicacao } from "@/app/actions/excluir";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pad = (n: number) => String(n).padStart(2, "0");

function chaveData(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export type SelecaoRede = { tipo: "carrossel" | "feed"; id: string };

export function CalendarioRedes({
  posts,
  publicacoes,
  selecao,
  onSelecionar,
  dataAlvo,
  onSelecionarDia,
}: {
  posts: Post[];
  publicacoes: PublicacaoView[];
  selecao: SelecaoRede | null;
  onSelecionar: (s: SelecaoRede) => void;
  dataAlvo: string | null;
  onSelecionarDia: (iso: string) => void;
}) {
  const hoje = new Date();
  const [view, setView] = useState(() => ({ ano: hoje.getFullYear(), mes: hoje.getMonth() }));

  const carrosselPorDia = new Map<string, Post>();
  for (const p of posts) carrosselPorDia.set(chaveData(p.data), p);
  const feedPorDia = new Map<string, PublicacaoView>();
  for (const p of publicacoes) feedPorDia.set(chaveData(p.data), p);

  function mudarMes(delta: number) {
    setView((v) => {
      const d = new Date(v.ano, v.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  const primeiroDia = new Date(view.ano, view.mes, 1).getDay();
  const totalDias = new Date(view.ano, view.mes + 1, 0).getDate();
  const celulas: (number | null)[] = [];
  for (let i = 0; i < primeiroDia; i++) celulas.push(null);
  for (let d = 1; d <= totalDias; d++) celulas.push(d);
  const hojeChave = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">◀</button>
        <h2 className="display text-center text-xl text-white sm:text-2xl">{MESES[view.mes]} <span className="text-muted">{view.ano}</span></h2>
        <button onClick={() => mudarMes(1)} aria-label="Próximo mês" className="rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">▶</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted">
        <span>🖼️ <span className="text-vermelho">Carrossel</span></span>
        <span>📱 <span className="text-sky-400">Feed</span></span>
        <span><span className="text-green-400">Verde</span> = postado</span>
        <span><span className="text-amber-300">Amarelo</span> = hoje</span>
        <span>dia cheio = ver · dia vazio = gerar nele</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted sm:text-xs">{d}</span>
        ))}
        {celulas.map((diaCel, i) => {
          if (diaCel === null) return <span key={`v${i}`} />;
          const chave = `${view.ano}-${pad(view.mes + 1)}-${pad(diaCel)}`;
          const carrossel = carrosselPorDia.get(chave);
          const feed = feedPorDia.get(chave);
          const ehHoje = chave === hojeChave;

          if (!carrossel && !feed) {
            const escolhido = dataAlvo === chave;
            return (
              <button
                key={i}
                onClick={() => onSelecionarDia(chave)}
                title="Gerar conteúdo neste dia"
                className={`flex h-11 items-center justify-center rounded-md text-sm transition sm:h-12 sm:text-base ${
                  escolhido
                    ? "border-2 border-white font-bold text-white"
                    : ehHoje
                      ? "border-2 border-amber-400 font-bold text-amber-300 hover:bg-preto"
                      : "text-muted/70 hover:bg-preto hover:text-white"
                }`}
              >
                {diaCel}
              </button>
            );
          }

          const tipo: "carrossel" | "feed" = carrossel ? "carrossel" : "feed";
          const item = carrossel ?? feed!;
          const postado = item.status === "postado";
          const selecionado = selecao?.tipo === tipo && selecao?.id === item.id;
          const icone = tipo === "carrossel" ? "🖼️" : "📱";
          const cor = postado
            ? "bg-green-600 hover:bg-green-500"
            : tipo === "carrossel"
              ? "bg-vermelho hover:bg-vermelho-hover"
              : "bg-sky-600 hover:bg-sky-500";

          return (
            <button
              key={i}
              onClick={() => onSelecionar({ tipo, id: item.id })}
              title={`${icone} ${item.titulo}`}
              className={`relative flex h-11 items-center justify-center rounded-md text-sm font-bold text-white transition sm:h-12 sm:text-base ${cor} ${
                selecionado ? "ring-2 ring-white" : ehHoje ? "ring-2 ring-amber-400" : ""
              }`}
            >
              <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">{icone}</span>
              {diaCel}
              {/* Delete button */}
              <DeleteButton tipo={tipo} id={item.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeleteButton({ tipo, id }: { tipo: "carrossel" | "feed"; id: string }) {
  // Render a server-action form so deletion runs on the server (no cookie/fetch issues)
  if (tipo === "carrossel") {
    return (
      <form action={excluirConteudo} onSubmit={(e) => e.stopPropagation()} className="absolute right-1 top-1 z-10">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          onClick={(ev) => {
            ev.stopPropagation();
            if (!confirm("Excluir este carrossel? A ação não pode ser desfeita.")) ev.preventDefault();
          }}
          title="Excluir"
          className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-red-400 opacity-90 hover:bg-red-900/30"
        >
          🗑
        </button>
      </form>
    );
  }
  return (
    <form action={excluirPublicacao} onSubmit={(e) => e.stopPropagation()} className="absolute right-1 top-1 z-10">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        onClick={(ev) => {
          ev.stopPropagation();
          if (!confirm("Excluir esta publicação? A ação não pode ser desfeita.")) ev.preventDefault();
        }}
        title="Excluir"
        className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-red-400 opacity-90 hover:bg-red-900/30"
      >
        🗑
      </button>
    </form>
  );
}
