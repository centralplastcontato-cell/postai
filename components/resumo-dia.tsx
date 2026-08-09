"use client";

import { type Post } from "./marketing-calendario";
import { type PublicacaoView } from "./publicacoes-aba";

// Visão UNIFICADA do dia: ao escolher um dia no calendário, mostra TUDO daquele dia
// junto — Carrossel + Feed + Story — em vez de obrigar a trocar de aba pra ver cada um.
// Cada item tem thumbnail, tipo, status e um "Abrir" que leva pra aba certa pra editar.

function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function chaveDiaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function dataLongaBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });
}

type Tipo = "carrossel" | "feed" | "story" | "reels";

type ItemDia = {
  tipo: Tipo;
  id: string;
  titulo: string;
  status: string;
  aprovado: boolean;
  thumb?: string;
  video?: string; // miniatura quando é vídeo (Reels)
  aspect: string;
  ordem: number; // pra ordenar por horário
};

const CFG: Record<Tipo, { nome: string; icone: string; cls: string }> = {
  carrossel: { nome: "Carrossel", icone: "🖼️", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  feed: { nome: "Feed", icone: "📱", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  story: { nome: "Story", icone: "🟣", cls: "bg-[#7c3aed]/20 text-purple-300 border-[#7c3aed]/40" },
  reels: { nome: "Reels", icone: "🎬", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

export function ResumoDoDia({
  dia,
  posts,
  publicacoes,
  stories,
  reels,
  onAbrir,
}: {
  dia: string; // chave do dia (YYYY-MM-DD em SP)
  posts: Post[];
  publicacoes: PublicacaoView[];
  stories: PublicacaoView[];
  reels: PublicacaoView[];
  onAbrir: (tipo: Tipo, id: string) => void;
}) {
  const v = (p: PublicacaoView) => hashCurto(`a2|${p.titulo}|${p.texto}|${p.imagemUrl ?? ""}|${p.extra ?? ""}`);

  const itens: ItemDia[] = [
    ...posts
      .filter((p) => chaveDiaSP(p.data) === dia)
      .map((p) => ({ tipo: "carrossel" as const, id: p.id, titulo: p.titulo, status: p.status, aprovado: p.aprovado, thumb: p.slides[0], aspect: "aspect-[4/5]", ordem: new Date(p.data).getTime() })),
    ...publicacoes
      .filter((p) => chaveDiaSP(p.data) === dia)
      .map((p) => ({ tipo: "feed" as const, id: p.id, titulo: p.titulo, status: p.status, aprovado: p.aprovado, thumb: `/api/feed/${p.id}?v=${v(p)}`, aspect: "aspect-[4/5]", ordem: new Date(p.data).getTime() })),
    ...stories
      .filter((p) => chaveDiaSP(p.data) === dia)
      .map((p) => ({ tipo: "story" as const, id: p.id, titulo: p.titulo, status: p.status, aprovado: p.aprovado, thumb: `/api/story/${p.id}?v=${v(p)}`, aspect: "aspect-[9/16]", ordem: new Date(p.data).getTime() })),
    ...reels
      .filter((p) => chaveDiaSP(p.data) === dia)
      // Vídeo arquivado (postado há +24h → MP4 apagado): usa a foto da festa (capaReel)
      // como miniatura — igual à aba Reels — em vez do quadrado "sem capa".
      .map((p) => ({ tipo: "reels" as const, id: p.id, titulo: p.titulo, status: p.status, aprovado: p.aprovado, video: p.videoUrl || undefined, thumb: p.capaReel ?? undefined, aspect: "aspect-[9/16]", ordem: new Date(p.data).getTime() })),
  ].sort((a, b) => a.ordem - b.ordem);

  const dataItem = posts.find((p) => chaveDiaSP(p.data) === dia)?.data
    ?? publicacoes.find((p) => chaveDiaSP(p.data) === dia)?.data
    ?? stories.find((p) => chaveDiaSP(p.data) === dia)?.data
    ?? `${dia}T12:00:00-03:00`;

  return (
    <div className="mb-6 rounded-xl border border-orange-500/30 bg-preto-card p-4">
      <p className="mb-3 text-sm font-semibold capitalize text-white">
        📅 {dataLongaBR(dataItem)} <span className="font-normal text-muted">· {itens.length} {itens.length === 1 ? "publicação" : "publicações"} nesse dia</span>
      </p>

      {itens.length === 0 ? (
        <p className="text-sm text-muted">Nada criado nesse dia ainda. Use as abas abaixo pra gerar um Carrossel, Feed ou Story aqui.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {itens.map((it) => {
            const postado = it.status === "postado";
            const cfg = CFG[it.tipo];
            return (
              <div key={`${it.tipo}-${it.id}`} className="flex flex-col rounded-lg border border-linha bg-preto p-2">
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${cfg.cls}`}>{cfg.icone} {cfg.nome}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "Postado" : "A postar"}</span>
                </div>
                <button type="button" onClick={() => onAbrir(it.tipo, it.id)} title="Abrir pra editar/postar" className="block w-full overflow-hidden rounded-md border border-linha transition hover:border-vermelho">
                  {it.video ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={`${it.video}#t=0.5`} preload="metadata" muted playsInline className={`${it.aspect} w-full object-cover`} />
                  ) : it.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb} alt={it.titulo} className={`${it.aspect} w-full object-cover`} />
                  ) : (
                    <div className={`${it.aspect} flex w-full items-center justify-center bg-preto-card text-[11px] text-muted`}>sem capa</div>
                  )}
                </button>
                <p className="mt-1.5 line-clamp-2 text-xs text-white">{it.titulo}</p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted">🕐 {horaSP(it.ordem ? new Date(it.ordem).toISOString() : dataItem)}</span>
                  {it.aprovado && <span className="text-[10px] font-semibold text-green-400">✓ aprovado</span>}
                </div>
                <button type="button" onClick={() => onAbrir(it.tipo, it.id)} className="mt-1.5 rounded-md border border-linha px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">Abrir →</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
