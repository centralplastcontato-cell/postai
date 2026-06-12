"use client";

import { useState } from "react";
import { MarketingCalendario, type Post } from "./marketing-calendario";
import { PublicacoesAba, type PublicacaoView } from "./publicacoes-aba";
import { CalendarioRedes, type SelecaoRede } from "./calendario-redes";
import { AniversariantesForm } from "./aniversariantes-form";

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

export function RedesSociais({
  marcaId,
  posts,
  publicacoes,
  diasCarrossel,
  diasFeed,
  paleta,
  temFacebook,
}: {
  marcaId: string;
  posts: Post[];
  publicacoes: PublicacaoView[];
  diasCarrossel: string;
  diasFeed: string;
  paleta: string; // JSON array de hex da marca (pro seletor de cor)
  temFacebook: boolean; // marca com Página do Facebook conectada → posta nos dois
}) {
  const [subaba, setSubaba] = useState<"carrosseis" | "publicacoes">("carrosseis");
  const [selecao, setSelecao] = useState<SelecaoRede | null>(null);
  const [dataAlvo, setDataAlvo] = useState<string | null>(null);

  const planoCar = parseDias(diasCarrossel);
  const planoFeed = parseDias(diasFeed);

  function aoSelecionar(s: SelecaoRede, iso: string) {
    setSelecao(s);
    setSubaba(s.tipo === "carrossel" ? "carrosseis" : "publicacoes");
    setDataAlvo(iso); // o dia clicado também filtra a lista da aba
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
          selecao={selecao}
          onSelecionar={aoSelecionar}
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
            📅 Mostrando só {new Date(`${dataAlvo}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short" })} · vale pras duas abas
          </span>
          <button onClick={() => { setDataAlvo(null); setSelecao(null); }} className="rounded-md border border-linha bg-preto px-3 py-1 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">
            📋 Ver todos os dias
          </button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setSubaba("carrosseis")} className={cls(subaba === "carrosseis", "bg-orange-500")}>🖼️ Carrosséis</button>
        <button onClick={() => setSubaba("publicacoes")} className={cls(subaba === "publicacoes", "bg-sky-600")}>📱 Publicações</button>
      </div>

      {subaba === "carrosseis" && (
        <>
          <MarketingCalendario
            marcaId={marcaId}
            posts={posts}
            selId={selecao?.tipo === "carrossel" ? selecao.id : null}
            onSelId={(id) => setSelecao(id ? { tipo: "carrossel", id } : null)}
            dataAlvo={dataAlvo}
            onGerado={(dia) => setDataAlvo(dia ?? null)}
            onLimparDia={() => { setDataAlvo(null); setSelecao(null); }}
            temFacebook={temFacebook}
          />
          <AniversariantesForm marcaId={marcaId} dataAlvo={dataAlvo} onGerado={(dia) => setDataAlvo(dia ?? null)} />
        </>
      )}

      {subaba === "publicacoes" && (
        <PublicacoesAba
          marcaId={marcaId}
          publicacoes={publicacoes}
          destacarId={selecao?.tipo === "feed" ? selecao.id : null}
          dataAlvo={dataAlvo}
          onGerado={(dia) => setDataAlvo(dia ?? null)}
          onLimparDia={() => { setDataAlvo(null); setSelecao(null); }}
          paleta={paleta}
          temFacebook={temFacebook}
        />
      )}
    </div>
  );
}
