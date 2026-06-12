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
}: {
  marcaId: string;
  posts: Post[];
  publicacoes: PublicacaoView[];
  diasCarrossel: string;
  diasFeed: string;
  paleta: string; // JSON array de hex da marca (pro seletor de cor)
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

      <div className="mb-5 flex gap-2">
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
        />
      )}
    </div>
  );
}
