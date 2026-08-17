"use client";

import { useState } from "react";
import Link from "next/link";
import { RedesSociais } from "./redes-sociais";
import { MarcaForm, type MarcaView } from "./marca-form";
import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";
import { type FestaComVideo } from "./reels-aba";
import { BancoImagens, type ImagemView } from "./banco-imagens";
import { FestasPainel } from "./festas-painel";
import { VideoPainel, type VideoTematicoView } from "./video-painel";
import { MascoteEstudio } from "./mascote-estudio";
import { InstagramEspelho } from "./instagram-espelho";
import { PaginasPainel } from "./paginas-painel";
import { CampanhasPainel, type CampanhaView } from "./campanhas-painel";
import { AtividadesRecentes, type Ativ } from "./atividades-recentes";
import { type FestaView } from "@/lib/festa-tipos";
import { ConexaoCard } from "./conexao-card";
import { EvolucaoCard } from "./evolucao-card";
import { BackfillEngajamento } from "./backfill-engajamento";
import { BiaDescobriu } from "./bia-descobriu";
import { RegerarCalendario } from "./regerar-calendario";
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
  reels,
  festasComVideo,
  videosTematicos,
  imagens,
  festas,
  campanhas,
  atividades,
  linkBase,
  tokenFotos,
  evolucao,
  conectada,
  assinatura,
  ehAdmin,
  ehTrial,
  entregue,
  analise,
  sugestao,
}: {
  marca: MarcaView;
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  reels: PublicacaoView[];
  festasComVideo: FestaComVideo[];
  videosTematicos: VideoTematicoView[];
  imagens: ImagemView[];
  festas: FestaView[];
  campanhas: CampanhaView[];
  atividades: Ativ[];
  linkBase: string;
  tokenFotos: string;
  evolucao: { dia: string; seguidores: number; posts: number }[];
  conectada: boolean;
  assinatura?: Assinatura | null;
  ehAdmin: boolean;
  ehTrial?: boolean;
  entregue: { carrosseis: number; feed: number; stories: number; reels: number; total: number };
  analise: AnaliseInsights;
  sugestao: SugestaoBia | null;
}) {
  const [aba, setAba] = useState<"redes" | "imagens" | "festas" | "video-buffet" | "video-festa" | "mascote" | "instagram" | "paginas" | "campanhas" | "config">("redes");
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

      {/* Cartões de contexto (assinatura, conexão, Bia, evolução) são sobre POSTS/conta —
          aparecem SÓ na aba Redes Sociais. Nas abas de gestão (Imagens, Festas, Config) ficam
          escondidos, pra todas as abas serem consistentes e focadas. */}
      {aba === "redes" && (
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
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <div className="rounded-lg border border-linha bg-preto px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">🎬 Reels</p>
                <p className="mt-0.5 text-2xl font-bold text-white">{entregue.reels}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">Carrosséis e Publicações ficam fixos no seu perfil · os Stories somem em 24h.</p>
          </div>
        )}
        {entregue.total > 0 && <BiaDescobriu analise={analise} />}
        <EvolucaoCard pontos={evolucao} />
        {ehAdmin && <BackfillEngajamento marcaId={marca.id} />}
      </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={() => setAba("redes")} className={cls(aba === "redes")}>📱 Redes Sociais</button>
        <button onClick={() => setAba("imagens")} className={cls(aba === "imagens")}>🖼️ Imagens</button>
        <button onClick={() => setAba("festas")} className={cls(aba === "festas")}>📸 Festas</button>
        <button onClick={() => setAba("video-buffet")} className={cls(aba === "video-buffet")}>🏰 Vídeo do buffet</button>
        <button onClick={() => setAba("video-festa")} className={cls(aba === "video-festa")}>🎬 Vídeo de festa</button>
        <button onClick={() => setAba("mascote")} className={cls(aba === "mascote")}>🦸 Mascote</button>
        <button onClick={() => setAba("instagram")} className={cls(aba === "instagram")}>📷 Instagram</button>
        <button onClick={() => setAba("paginas")} className={cls(aba === "paginas")}>📄 Páginas</button>
        <button onClick={() => setAba("campanhas")} className={cls(aba === "campanhas")}>🎈 Campanhas</button>
        <button onClick={() => setAba("config")} className={cls(aba === "config")}>{ehAdmin ? "⚙️ Configurações" : "✏️ Minha marca"}</button>
        {ehTrial && <div className="w-full sm:ml-auto sm:w-auto"><RegerarCalendario marcaId={marca.id} /></div>}
      </div>

      <div className="mt-6">
        {aba === "redes" && <RedesSociais marcaId={marca.id} posts={posts} publicacoes={publicacoes} stories={stories} reels={reels} festasComVideo={festasComVideo} diasCarrossel={marca.diasCarrossel} diasFeed={marca.diasFeed} horaPost={marca.horaPost} horaCarrossel={marca.horaCarrossel} paleta={marca.paleta} temFacebook={Boolean(marca.fbPageId)} espelharStoryPadrao={marca.espelharStory} sugestao={sugestao} feedArtes={marca.feedArtes ?? []} temMascote={Boolean(marca.mascoteUrl)} temLogo={Boolean(marca.logoUrl)} />}
        {aba === "imagens" && <BancoImagens marcaId={marca.id} imagens={imagens} />}
        {aba === "festas" && <FestasPainel marcaId={marca.id} linkBase={linkBase} token={tokenFotos} festas={festas} />}
        {aba === "video-buffet" && <VideoPainel secao="buffet" marcaId={marca.id} festas={festas} tematicos={videosTematicos} corMarca={marca.corPrimaria} capasBanco={marca.capasArte ?? []} mascoteUrl={marca.mascoteUrl ?? ""} logoUrl={marca.logoUrl ?? ""} />}
        {aba === "video-festa" && <VideoPainel secao="festas" marcaId={marca.id} festas={festas} tematicos={videosTematicos} corMarca={marca.corPrimaria} capasBanco={marca.capasArte ?? []} mascoteUrl={marca.mascoteUrl ?? ""} logoUrl={marca.logoUrl ?? ""} />}
        {aba === "mascote" && <MascoteEstudio marcaId={marca.id} mascoteUrl={marca.mascoteUrl ?? ""} mascotes={marca.mascotesArte ?? []} ficha3d={marca.mascoteFicha3d ?? ""} clipes={marca.mascoteClipes ?? []} corMarca={marca.corPrimaria} />}
        {aba === "instagram" && <InstagramEspelho marcaId={marca.id} />}
        {aba === "paginas" && <PaginasPainel festas={festas} linkBase={linkBase} />}
        {aba === "campanhas" && <CampanhasPainel marcaId={marca.id} temTelefone={Boolean(marca.telefone)} campanhas={campanhas} acento={marca.corPrimaria} />}
        {aba === "config" && (ehAdmin ? <MarcaForm marca={marca} /> : <MarcaForm marca={marca} somenteIdentidade />)}
      </div>

      {/* Atividades da Bia (sobre posts) — só na aba Redes Sociais, junto dos demais cartões. */}
      {aba === "redes" && <AtividadesRecentes atividades={atividades} />}
    </div>
  );
}
