"use client";

import { useState } from "react";
import Link from "next/link";
import { RedesSociais } from "./redes-sociais";
import { MarcaForm, type MarcaView } from "./marca-form";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";
import { BancoImagens, type ImagemView } from "./banco-imagens";

export function MarcaHub({
  marca,
  posts,
  publicacoes,
  imagens,
  conectada,
}: {
  marca: MarcaView;
  posts: Post[];
  publicacoes: PublicacaoView[];
  imagens: ImagemView[];
  conectada: boolean;
}) {
  const [aba, setAba] = useState<"redes" | "imagens" | "config">("redes");
  const cls = (a: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${a ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`;

  return (
    <div>
      <Link href="/painel" className="text-sm text-muted transition hover:text-white">← Marcas</Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {marca.logoUrl ? (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl p-1.5" style={{ backgroundColor: marca.corFundo || "#0E0E0E" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={marca.logoUrl} alt={marca.nome} className="max-h-full max-w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ backgroundColor: marca.corPrimaria }}>
            {marca.nome.slice(0, 2).toUpperCase()}
          </span>
        )}
        <h1 className="display text-3xl text-white">{marca.nome}</h1>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${conectada ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>
          {conectada ? "✓ Instagram conectado" : "⚠ Falta conectar"}
        </span>
      </div>

      {!conectada && (
        <p className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Pra postar de verdade, vá em <strong>Configurações</strong> e conecte o Instagram desta marca (IG User ID + token).
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button onClick={() => setAba("redes")} className={cls(aba === "redes")}>📱 Redes Sociais</button>
        <button onClick={() => setAba("imagens")} className={cls(aba === "imagens")}>🖼️ Imagens</button>
        <button onClick={() => setAba("config")} className={cls(aba === "config")}>⚙️ Configurações</button>
      </div>

      <div className="mt-6">
        {aba === "redes" && <RedesSociais marcaId={marca.id} posts={posts} publicacoes={publicacoes} diasCarrossel={marca.diasCarrossel} diasFeed={marca.diasFeed} />}
        {aba === "imagens" && <BancoImagens marcaId={marca.id} imagens={imagens} />}
        {aba === "config" && <MarcaForm marca={marca} />}
      </div>
    </div>
  );
}
