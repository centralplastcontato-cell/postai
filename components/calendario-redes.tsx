"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirConteudo, excluirPublicacao } from "@/app/actions/excluir";
import { ConfirmDialog } from "./confirm-dialog";
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

export type SelecaoRede = { tipo: "carrossel" | "feed"; id: string };

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

export function CalendarioRedes({
  posts,
  publicacoes,
  selecao,
  onSelecionar,
  dataAlvo,
  onSelecionarDia,
  diasCarrossel,
  diasFeed,
}: {
  posts: Post[];
  publicacoes: PublicacaoView[];
  selecao: SelecaoRede | null;
  onSelecionar: (s: SelecaoRede) => void;
  dataAlvo: string | null;
  onSelecionarDia: (iso: string) => void;
  diasCarrossel: string;
  diasFeed: string;
}) {
  const hoje = new Date();
  const [view, setView] = useState(() => ({ ano: hoje.getFullYear(), mes: hoje.getMonth() }));
  const planoCar = parseDias(diasCarrossel);
  const planoFeed = parseDias(diasFeed);

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
        <span>🖼️ <span className="text-orange-400">Carrossel</span></span>
        <span>📱 <span className="text-sky-400">Feed</span></span>
        <span><span className="text-green-400">Verde</span> = postado</span>
        <span><span className="text-amber-300">Amarelo</span> = hoje</span>
        <span>🎉 <span className="text-yellow-300">data comemorativa</span></span>
        <span><span className="text-muted/70">tracejado</span> = agenda (criar aqui)</span>
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
          const comemorativa = dataComemorativaDe(chave);

          if (!carrossel && !feed) {
            const escolhido = dataAlvo === chave;
            // Lembrete da agenda: dia futuro (>= hoje) que cai no plano da marca e
            // ainda não tem conteúdo criado. Indica o que era pra criar ali.
            const futuro = chave >= hojeChave;
            const diaSemana = new Date(view.ano, view.mes, diaCel).getDay();
            const planCar = futuro && planoCar.includes(diaSemana);
            const planFeed = futuro && planoFeed.includes(diaSemana);
            const temPlano = planCar || planFeed;
            const planoTxt = [planCar ? "🖼️ carrossel" : "", planFeed ? "📱 feed" : ""].filter(Boolean).join(" · ");
            // Borda: hoje/escolhido/comemorativa têm prioridade; senão, tracejada do plano.
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
                className={`group relative flex h-11 items-center justify-center rounded-md text-sm transition sm:h-12 sm:text-base ${borda}`}
              >
                {comemorativa && <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">🎉</span>}
                {temPlano && (
                  <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none opacity-60">
                    {planCar && "🖼️"}{planFeed && "📱"}
                  </span>
                )}
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

          const tipo: "carrossel" | "feed" = carrossel ? "carrossel" : "feed";
          const item = carrossel ?? feed!;
          const postado = item.status === "postado";
          const selecionado = selecao?.tipo === tipo && selecao?.id === item.id;
          const icone = tipo === "carrossel" ? "🖼️" : "📱";
          const cor = postado
            ? "bg-green-600 hover:bg-green-500"
            : tipo === "carrossel"
              ? "bg-orange-500 hover:bg-orange-400"
              : "bg-sky-600 hover:bg-sky-500";

          return (
            // div (não button) porque tem o DeleteButton dentro — button aninhado
            // em button quebra a hidratação do React.
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onSelecionar({ tipo, id: item.id })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelecionar({ tipo, id: item.id }); }}
              title={comemorativa ? undefined : `${icone} ${item.titulo}`}
              className={`group relative flex h-11 cursor-pointer items-center justify-center rounded-md text-sm font-bold text-white transition sm:h-12 sm:text-base ${cor} ${
                selecionado ? "ring-2 ring-white" : ehHoje ? "ring-2 ring-amber-400" : comemorativa ? "ring-2 ring-yellow-400/70" : ""
              }`}
            >
              <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">{icone}</span>
              {comemorativa && <span className="absolute bottom-0.5 left-0.5 text-[10px] leading-none">🎉</span>}
              {diaCel}
              {comemorativa && <TooltipData emoji={comemorativa.emoji} nome={comemorativa.nome} rodape={item.titulo} />}
              {/* Delete button */}
              <DeleteButton tipo={tipo} id={item.id} />
            </div>
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

function DeleteButton({ tipo, id }: { tipo: "carrossel" | "feed"; id: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      if (tipo === "carrossel") await excluirConteudo(fd);
      else await excluirPublicacao(fd);
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          setAberto(true);
        }}
        title="Excluir"
        className="absolute right-1 top-1 z-10 rounded bg-black/30 px-1.5 py-0.5 text-xs text-red-400 opacity-90 hover:bg-red-900/30"
      >
        🗑
      </button>
      <ConfirmDialog
        aberto={aberto}
        titulo={tipo === "carrossel" ? "Excluir este carrossel?" : "Excluir esta publicação?"}
        descricao="A ação não pode ser desfeita."
        textoConfirmar="Excluir"
        onConfirmar={confirmar}
        onCancelar={() => setAberto(false)}
        ocupado={ocupado}
      />
    </>
  );
}
