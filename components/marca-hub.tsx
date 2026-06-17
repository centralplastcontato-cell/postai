"use client";

import { useState } from "react";
import Link from "next/link";
import { RedesSociais } from "./redes-sociais";
import { MarcaForm, type MarcaView } from "./marca-form";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";
import { BancoImagens, type ImagemView } from "./banco-imagens";
import { ConexaoCard } from "./conexao-card";
import { EvolucaoCard } from "./evolucao-card";
import { BackfillEngajamento } from "./backfill-engajamento";
import { BiaDescobriu } from "./bia-descobriu";
import { type AnaliseInsights, type SugestaoBia } from "@/lib/inteligencia";
import { rotuloPlano, diasDeAcesso } from "@/lib/plano";

type Assinatura = { cliente: string; plano: string | null; acessoAte: string | null };

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function statusAssinatura(acessoAte: string | null): { txt: string; cls: string } {
  const dias = diasDeAcesso(acessoAte);
  if (dias === null) return { txt: "Acesso aberto (sem validade)", cls: "text-muted" };
  if (dias < 0) return { txt: `🔴 Vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} — piloto pausado`, cls: "text-red-400" };
  if (dias === 0) return { txt: "🔴 Vence hoje", cls: "text-red-400" };
  const cls = dias <= 7 ? "text-red-400" : dias <= 30 ? "text-amber-300" : "text-green-400";
  return { txt: `Ativo · ${dias} ${dias === 1 ? "dia" : "dias"} (até ${dataCurta(acessoAte!)})`, cls };
}

export function MarcaHub({
  marca,
  posts,
  publicacoes,
  stories,
  imagens,
  evolucao,
  conectada,
  assinatura,
  ehAdmin,
  entregue,
  analise,
  sugestao,
}: {
  marca: MarcaView;
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  imagens: ImagemView[];
  evolucao: { dia: string; seguidores: number; posts: number }[];
  conectada: boolean;
  assinatura?: Assinatura | null;
  ehAdmin: boolean;
  entregue: { carrosseis: number; feed: number; stories: number; total: number };
  analise: AnaliseInsights;
  sugestao: SugestaoBia | null;
}) {
  const [aba, setAba] = useState<"redes" | "imagens" | "config">("redes");
  const cls = (a: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${a ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`;
  const stAssin = assinatura ? statusAssinatura(assinatura.acessoAte) : null;

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
          {conectada ? "✓ Instagram conectado" : ehAdmin ? "Conectar Instagram" : "🔒 Ative pra postar"}
        </span>
      </div>

      {!conectada && ehAdmin && (
        <p className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Pra postar de verdade, vá em <strong>Configurações</strong> e conecte o Instagram desta marca (IG User ID + token).
        </p>
      )}
      {!conectada && !ehAdmin && (
        <p className="mt-3 rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 p-3 text-sm text-[#c7b2ff]">
          🎁 Veja a sua semana e ajuste as artes. Pra o Postaí <strong>postar de verdade</strong> no seu Instagram, <Link href="/assinar" className="font-semibold underline underline-offset-2">ative seu plano</Link> — a gente conecta sua conta pra você.
        </p>
      )}

      <div className="mt-5 space-y-4">
        {assinatura && stAssin && (
          <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">📦 Assinatura <span className="font-normal text-muted">— cliente {assinatura.cliente}</span></p>
              <span className="rounded-full border border-vermelho/40 bg-vermelho/15 px-2.5 py-0.5 text-xs font-semibold text-white">{assinatura.plano ? rotuloPlano(assinatura.plano) : "sem pacote"}</span>
            </div>
            <p className={`mt-2 text-sm font-semibold ${stAssin.cls}`}>{stAssin.txt}</p>
            {ehAdmin && <p className="mt-1 text-xs text-muted">Pacote e validade você ajusta em 👥 Clientes.</p>}
          </div>
        )}
        <ConexaoCard marcaId={marca.id} temConexao={conectada} />
        {entregue.total > 0 && (
          <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
            <p className="text-sm font-semibold text-white">🤖 A Bia já trabalhou por você</p>
            <p className="mt-1 text-xs text-muted">
              A Bia já fez <strong className="text-white">{entregue.total}</strong> {entregue.total === 1 ? "publicação" : "publicações"} sozinha — sem você levantar um dedo. 🚀
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-linha bg-preto px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">🎠 Carrosséis</p>
                <p className="mt-0.5 text-2xl font-bold text-white">{entregue.carrosseis}</p>
              </div>
              <div className="rounded-lg border border-linha bg-preto px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">🖼️ Publicações</p>
                <p className="mt-0.5 text-2xl font-bold text-white">{entregue.feed}</p>
              </div>
              <div className="rounded-lg border border-linha bg-preto px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">🟣 Stories</p>
                <p className="mt-0.5 text-2xl font-bold text-white">{entregue.stories}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">Carrosséis e Publicações ficam fixos no seu perfil · os Stories somem em 24h.</p>
          </div>
        )}
        {entregue.total > 0 && <BiaDescobriu analise={analise} />}
        <EvolucaoCard pontos={evolucao} />
        {ehAdmin && <BackfillEngajamento marcaId={marca.id} />}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => setAba("redes")} className={cls(aba === "redes")}>📱 Redes Sociais</button>
        <button onClick={() => setAba("imagens")} className={cls(aba === "imagens")}>🖼️ Imagens</button>
        <button onClick={() => setAba("config")} className={cls(aba === "config")}>{ehAdmin ? "⚙️ Configurações" : "✏️ Minha marca"}</button>
      </div>

      <div className="mt-6">
        {aba === "redes" && <RedesSociais marcaId={marca.id} posts={posts} publicacoes={publicacoes} stories={stories} diasCarrossel={marca.diasCarrossel} diasFeed={marca.diasFeed} horaPost={marca.horaPost} horaCarrossel={marca.horaCarrossel} paleta={marca.paleta} temFacebook={Boolean(marca.fbPageId)} espelharStoryPadrao={marca.espelharStory} sugestao={sugestao} />}
        {aba === "imagens" && <BancoImagens marcaId={marca.id} imagens={imagens} />}
        {aba === "config" && (ehAdmin ? <MarcaForm marca={marca} /> : <MarcaForm marca={marca} somenteIdentidade />)}
      </div>
    </div>
  );
}
