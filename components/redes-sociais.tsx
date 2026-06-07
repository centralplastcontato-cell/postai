"use client";

import { useState } from "react";
import { MarketingCalendario, type Post } from "./marketing-calendario";
import { PublicacoesAba, type PublicacaoView } from "./publicacoes-aba";
import { CalendarioRedes, type SelecaoRede } from "./calendario-redes";

export function RedesSociais({
  marcaId,
  posts,
  publicacoes,
}: {
  marcaId: string;
  posts: Post[];
  publicacoes: PublicacaoView[];
}) {
  const [subaba, setSubaba] = useState<"carrosseis" | "publicacoes">("carrosseis");
  const [selecao, setSelecao] = useState<SelecaoRede | null>(null);
  const [dataAlvo, setDataAlvo] = useState<string | null>(null);

  function aoSelecionar(s: SelecaoRede) {
    setSelecao(s);
    setSubaba(s.tipo === "carrossel" ? "carrosseis" : "publicacoes");
  }

  const cls = (ativa: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${ativa ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`;

  return (
    <div>
      <div className="mb-6">
        <CalendarioRedes
          posts={posts}
          publicacoes={publicacoes}
          selecao={selecao}
          onSelecionar={aoSelecionar}
          dataAlvo={dataAlvo}
          onSelecionarDia={setDataAlvo}
        />
      </div>

      <div className="mb-5 flex gap-2">
        <button onClick={() => setSubaba("carrosseis")} className={cls(subaba === "carrosseis")}>🖼️ Carrosséis</button>
        <button onClick={() => setSubaba("publicacoes")} className={cls(subaba === "publicacoes")}>📱 Publicações</button>
      </div>

      {subaba === "carrosseis" && (
        <MarketingCalendario
          marcaId={marcaId}
          posts={posts}
          selId={selecao?.tipo === "carrossel" ? selecao.id : null}
          onSelId={(id) => setSelecao(id ? { tipo: "carrossel", id } : null)}
          dataAlvo={dataAlvo}
          onGerado={() => setDataAlvo(null)}
        />
      )}

      {subaba === "publicacoes" && (
        <PublicacoesAba
          marcaId={marcaId}
          publicacoes={publicacoes}
          destacarId={selecao?.tipo === "feed" ? selecao.id : null}
          dataAlvo={dataAlvo}
          onGerado={() => setDataAlvo(null)}
        />
      )}
    </div>
  );
}
