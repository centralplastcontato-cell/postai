"use client";

import { useState } from "react";
import { MarketingCalendario, type Post } from "./marketing-calendario";
import { PublicacoesAba, type PublicacaoView } from "./publicacoes-aba";
import { StoriesAba } from "./stories-aba";
import { ReelsAba, type FestaComVideo } from "./reels-aba";
import { type SugestaoBia } from "@/lib/inteligencia";
import { CalendarioRedes, type SelecaoRede } from "./calendario-redes";
import { ResumoDoDia } from "./resumo-dia";
import { AniversariantesForm } from "./aniversariantes-form";

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

export function RedesSociais({
  marcaId,
  posts,
  publicacoes,
  stories,
  reels,
  festasComVideo,
  diasCarrossel,
  diasFeed,
  horaPost,
  horaCarrossel,
  paleta,
  temFacebook,
  espelharStoryPadrao,
  sugestao,
}: {
  marcaId: string;
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  reels: PublicacaoView[];
  festasComVideo: FestaComVideo[];
  diasCarrossel: string;
  diasFeed: string;
  horaPost: number; // hora padrão do feed (BRT)
  horaCarrossel: number; // hora padrão do carrossel (BRT)
  paleta: string; // JSON array de hex da marca (pro seletor de cor)
  temFacebook: boolean; // marca com Página do Facebook conectada → posta nos dois
  espelharStoryPadrao?: boolean; // padrão da marca pra espelhar o feed no Story
  sugestao?: SugestaoBia | null; // sugestão da Bia pro próximo post (gerador de feed)
}) {
  const [subaba, setSubaba] = useState<"carrosseis" | "publicacoes" | "story" | "reels">("carrosseis");
  const [selecao, setSelecao] = useState<SelecaoRede | null>(null);
  const [dataAlvo, setDataAlvo] = useState<string | null>(null);

  const planoCar = parseDias(diasCarrossel);
  const planoFeed = parseDias(diasFeed);

  // Abre um item da VISÃO DO DIA: leva pra aba do tipo certo pra editar/postar
  // (o item já aparece filtrado lá, porque o dia segue selecionado).
  function abrirDoResumo(tipo: "carrossel" | "feed" | "story", id: string) {
    if (tipo === "carrossel") { setSelecao({ tipo: "carrossel", id }); setSubaba("carrosseis"); }
    else if (tipo === "feed") { setSelecao({ tipo: "feed", id }); setSubaba("publicacoes"); }
    else { setSelecao(null); setSubaba("story"); }
  }

  // Empurrão pela PROGRAMAÇÃO da agenda (Configurações): ao escolher um dia, leva
  // pra aba do tipo daquele dia — carrossel (laranja) ou feed/publicação (azul) —
  // pra confirmar o que é pra criar ali. Dia sem programação não empurra.
  function aoSelecionarDia(iso: string) {
    setDataAlvo(iso);
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (planoCar.includes(dow)) setSubaba("carrosseis");
    else if (planoFeed.includes(dow)) setSubaba("publicacoes");
  }

  const cls = (ativa: boolean, ativoCor = "bg-vermelho") =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${ativa ? `${ativoCor} text-white` : "border border-linha text-muted hover:text-white"}`;

  return (
    <div>
      <div className="mb-6">
        <CalendarioRedes
          posts={posts}
          publicacoes={publicacoes}
          stories={stories}
          dataAlvo={dataAlvo}
          onSelecionarDia={aoSelecionarDia}
          diasCarrossel={diasCarrossel}
          diasFeed={diasFeed}
        />
      </div>

      {/* Filtro de DIA (global): vem do calendário e vale pras DUAS abas. Fica aqui em
          cima, único, pra deixar claro que "Ver todos os dias" tira o filtro de data —
          não tem a ver com "carrosséis vs publicações" (cada aba mostra seu tipo). */}
      {dataAlvo && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2">
          <span className="text-xs font-semibold text-orange-200">
            📅 Mostrando só {new Date(`${dataAlvo}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short" })} · vale pras 3 abas
          </span>
          <button onClick={() => { setDataAlvo(null); setSelecao(null); }} className="rounded-md border border-linha bg-preto px-3 py-1 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">
            📋 Ver todos os dias
          </button>
        </div>
      )}

      {/* Visão UNIFICADA do dia: Carrossel + Feed + Story juntos (não obriga trocar de aba). */}
      {dataAlvo && (
        <ResumoDoDia
          dia={dataAlvo}
          posts={posts}
          publicacoes={publicacoes}
          stories={stories}
          onAbrir={abrirDoResumo}
        />
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setSubaba("carrosseis")} className={cls(subaba === "carrosseis", "bg-orange-500")}>🖼️ Carrosséis</button>
        <button onClick={() => setSubaba("publicacoes")} className={cls(subaba === "publicacoes", "bg-sky-600")}>📱 Publicações</button>
        <button onClick={() => setSubaba("story")} className={cls(subaba === "story", "bg-[#7c3aed]")}>🟣 Story</button>
        <button onClick={() => setSubaba("reels")} className={cls(subaba === "reels", "bg-[#7c3aed]")}>🎬 Reels{reels.length ? ` (${reels.length})` : ""}</button>
      </div>

      {subaba === "carrosseis" && (
        <MarketingCalendario
          marcaId={marcaId}
          posts={posts}
          selId={selecao?.tipo === "carrossel" ? selecao.id : null}
          onSelId={(id) => setSelecao(id ? { tipo: "carrossel", id } : null)}
          dataAlvo={dataAlvo}
          horaPadrao={horaCarrossel}
          onGerado={(dia) => setDataAlvo(dia ?? null)}
          onLimparDia={() => { setDataAlvo(null); setSelecao(null); }}
          temFacebook={temFacebook}
          slotGerador={<AniversariantesForm marcaId={marcaId} dataAlvo={dataAlvo} onGerado={(dia) => setDataAlvo(dia ?? null)} />}
        />
      )}

      {subaba === "publicacoes" && (
        <PublicacoesAba
          marcaId={marcaId}
          publicacoes={publicacoes}
          destacarId={selecao?.tipo === "feed" ? selecao.id : null}
          dataAlvo={dataAlvo}
          horaPadrao={horaPost}
          onGerado={(dia) => setDataAlvo(dia ?? null)}
          onLimparDia={() => { setDataAlvo(null); setSelecao(null); }}
          paleta={paleta}
          temFacebook={temFacebook}
          espelharStoryPadrao={espelharStoryPadrao}
          sugestao={sugestao}
        />
      )}

      {subaba === "story" && (
        <StoriesAba
          marcaId={marcaId}
          stories={stories}
          dataAlvo={dataAlvo}
          horaPadrao={horaPost}
          onGerado={(dia) => setDataAlvo(dia ?? null)}
          onLimparDia={() => { setDataAlvo(null); setSelecao(null); }}
        />
      )}

      {subaba === "reels" && <ReelsAba reels={reels} festasComVideo={festasComVideo} />}
    </div>
  );
}
