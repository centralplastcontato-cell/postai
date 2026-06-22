"use client";

import { useState } from "react";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";

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

// Mantido (redes-sociais usa pra destacar/abrir o item nas abas de edição).
export type SelecaoRede = { tipo: "carrossel" | "feed"; id: string };

type Tipo = "carrossel" | "feed" | "story" | "reels";
type ResTipo = { total: number; postados: number; aprovados: number };
type ResumoDia = Record<Tipo, ResTipo>;
const zero = (): ResumoDia => ({
  carrossel: { total: 0, postados: 0, aprovados: 0 },
  feed: { total: 0, postados: 0, aprovados: 0 },
  story: { total: 0, postados: 0, aprovados: 0 },
  reels: { total: 0, postados: 0, aprovados: 0 },
});

const CHIP: Record<Tipo, { icone: string; cor: string; nome: string }> = {
  carrossel: { icone: "🖼️", cor: "bg-orange-500", nome: "Carrossel" },
  feed: { icone: "📱", cor: "bg-sky-600", nome: "Feed" },
  story: { icone: "🟣", cor: "bg-[#7c3aed]", nome: "Story" },
  reels: { icone: "🎬", cor: "bg-fuchsia-600", nome: "Reels" },
};

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

// Chip de um tipo num dia: ícone + (nº se houver mais de um). Verde = todos postados;
// cor do tipo = nada postado ainda; anel verde = parte postada (parcial).
function Chip({ tipo, res }: { tipo: Tipo; res: ResTipo }) {
  const c = CHIP[tipo];
  const todos = res.postados === res.total;
  const parcial = res.postados > 0 && !todos;
  const bg = todos ? "bg-green-600" : c.cor;
  const titulo = `${c.icone} ${res.total} ${c.nome}${res.total > 1 ? "s" : ""} · ${res.postados} postado${res.postados === 1 ? "" : "s"}`;
  return (
    <span
      title={titulo}
      className={`flex h-[18px] items-center justify-center gap-0.5 rounded px-1 text-[10px] font-bold leading-none text-white ${bg} ${parcial ? "ring-1 ring-green-400" : ""}`}
    >
      <span style={{ fontSize: 9 }}>{c.icone}</span>
      {res.total > 1 && <span>{res.total}</span>}
      {todos && <span className="text-[8px]">✓</span>}
    </span>
  );
}

export function CalendarioRedes({
  posts,
  publicacoes,
  stories,
  reels,
  dataAlvo,
  onSelecionarDia,
  diasCarrossel,
  diasFeed,
}: {
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  reels: PublicacaoView[];
  dataAlvo: string | null;
  onSelecionarDia: (iso: string) => void;
  diasCarrossel: string;
  diasFeed: string;
}) {
  const hoje = new Date();
  const [view, setView] = useState(() => ({ ano: hoje.getFullYear(), mes: hoje.getMonth() }));
  const planoCar = parseDias(diasCarrossel);
  const planoFeed = parseDias(diasFeed);

  // Agrega TODAS as publicações por dia e por tipo (carrossel/feed/story), contando
  // quantas e quantas já foram postadas — o calendário mostra um chip por tipo, então
  // dá pra ver o que tem no dia E o status de cada (não some o feed atrás do carrossel,
  // e o verde não vira "uma cor pro dia inteiro").
  const porDia = new Map<string, ResumoDia>();
  function add(iso: string, tipo: Tipo, postado: boolean, aprovado: boolean) {
    const k = chaveData(iso);
    const r = porDia.get(k) ?? zero();
    r[tipo].total++;
    if (postado) r[tipo].postados++;
    if (aprovado) r[tipo].aprovados++;
    porDia.set(k, r);
  }
  for (const p of posts) add(p.data, "carrossel", p.status === "postado", p.aprovado);
  for (const p of publicacoes) add(p.data, "feed", p.status === "postado", p.aprovado);
  for (const p of stories) add(p.data, "story", p.status === "postado", p.aprovado);
  for (const p of reels) add(p.data, "reels", p.status === "postado", p.aprovado);

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

      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-muted">
        <span>🖼️ <span className="text-orange-400">Carrossel</span></span>
        <span>📱 <span className="text-sky-400">Feed</span></span>
        <span>🟣 <span className="text-purple-300">Story</span></span>
        <span>🎬 <span className="text-fuchsia-300">Reels</span></span>
        <span><span className="rounded bg-green-600 px-1 text-white">✓</span> = já postado</span>
        <span><span className="text-amber-300">Amarelo</span> = hoje</span>
        <span>🎉 <span className="text-yellow-300">data comemorativa</span></span>
        <span><span className="text-muted/70">tracejado</span> = agenda</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted sm:text-xs">{d}</span>
        ))}
        {celulas.map((diaCel, i) => {
          if (diaCel === null) return <span key={`v${i}`} />;
          const chave = `${view.ano}-${pad(view.mes + 1)}-${pad(diaCel)}`;
          const res = porDia.get(chave);
          const ehHoje = chave === hojeChave;
          const escolhido = dataAlvo === chave;
          const comemorativa = dataComemorativaDe(chave);

          // Dia VAZIO: mantém o lembrete da agenda (tracejado) pra indicar o que criar ali.
          if (!res) {
            const futuro = chave >= hojeChave;
            const diaSemana = new Date(view.ano, view.mes, diaCel).getDay();
            const planCar = futuro && planoCar.includes(diaSemana);
            const planFeed = futuro && planoFeed.includes(diaSemana);
            const temPlano = planCar || planFeed;
            const planoTxt = [planCar ? "🖼️ carrossel" : "", planFeed ? "📱 feed" : ""].filter(Boolean).join(" · ");
            const borda = escolhido
              ? "border-2 border-white font-bold text-white"
              : ehHoje
                ? "border-2 border-amber-400 font-bold text-amber-300 hover:bg-preto"
                : comemorativa
                  ? "border border-yellow-400/50 font-semibold text-yellow-200/90 hover:bg-preto hover:text-white"
                  : planCar
                    ? "border border-dashed border-orange-400/60 text-white/80 hover:bg-preto hover:text-white"
                    : planFeed
                      ? "border border-dashed border-sky-500/50 text-white/80 hover:bg-preto hover:text-white"
                      : "text-muted/70 hover:bg-preto hover:text-white";
            return (
              <button
                key={i}
                onClick={() => onSelecionarDia(chave)}
                title={comemorativa || temPlano ? undefined : "Gerar conteúdo neste dia"}
                className={`group relative flex min-h-14 items-center justify-center rounded-md text-sm transition sm:min-h-16 sm:text-base ${borda}`}
              >
                {comemorativa && <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">🎉</span>}
                {temPlano && <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none opacity-60">{planCar && "🖼️"}{planFeed && "📱"}</span>}
                {diaCel}
                {(comemorativa || temPlano) && (
                  <TooltipData
                    emoji={comemorativa ? comemorativa.emoji : "🗓️"}
                    nome={comemorativa ? comemorativa.nome : `Agenda: ${planoTxt}`}
                    rodape={comemorativa && temPlano ? `Agenda: ${planoTxt} · clique pra gerar` : "clique pra gerar"}
                  />
                )}
              </button>
            );
          }

          // Dia COM conteúdo: número + um chip por tipo presente (com status).
          const borda = escolhido
            ? "border-2 border-white"
            : ehHoje
              ? "border-2 border-amber-400"
              : comemorativa
                ? "border border-yellow-400/60"
                : "border border-linha";
          return (
            <button
              key={i}
              onClick={() => onSelecionarDia(chave)}
              title={comemorativa ? undefined : "Ver tudo desse dia"}
              className={`group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md bg-preto px-0.5 py-1 text-sm font-semibold text-white transition hover:bg-preto-card sm:min-h-16 sm:text-base ${borda}`}
            >
              {comemorativa && <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">🎉</span>}
              <span className={ehHoje ? "text-amber-300" : ""}>{diaCel}</span>
              <span className="flex flex-wrap items-center justify-center gap-0.5">
                {res.carrossel.total > 0 && <Chip tipo="carrossel" res={res.carrossel} />}
                {res.feed.total > 0 && <Chip tipo="feed" res={res.feed} />}
                {res.story.total > 0 && <Chip tipo="story" res={res.story} />}
                {res.reels.total > 0 && <Chip tipo="reels" res={res.reels} />}
              </span>
              {comemorativa && <TooltipData emoji={comemorativa.emoji} nome={comemorativa.nome} rodape="clique pra ver o dia" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tooltip no padrão escuro da plataforma (substitui o title nativo do navegador):
// maior, legível e com setinha. Aparece no hover do dia.
function TooltipData({ emoji, nome, rodape }: { emoji: string; nome: string; rodape?: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 flex-col items-center group-hover:flex">
      <span className="rounded-lg border border-linha bg-preto-card px-3 py-2 text-center shadow-xl">
        <span className="block whitespace-nowrap text-sm font-bold text-white">{emoji} {nome}</span>
        {rodape && <span className="mt-0.5 block max-w-[150px] truncate text-[11px] font-normal text-muted">{rodape}</span>}
      </span>
      <span className="-mt-1 h-2 w-2 rotate-45 border-b border-r border-linha bg-preto-card" />
    </span>
  );
}
