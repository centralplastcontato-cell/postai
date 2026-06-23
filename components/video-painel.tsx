"use client";

// Aba VÍDEO do painel — GALERIA de Reels: cada festa é uma miniatura VERTICAL (9:16), estilo a
// aba de Reels do Instagram. Play no centro quando o vídeo está pronto; ⚡ Gerar quando não tem.
// Escolher/ordenar fotos abre o seletor. O AGENDAMENTO/postagem mora em Redes Sociais → 🎬 Reels.

import { useState } from "react";
import { type FestaView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { SeletorVideoFotos } from "@/components/seletor-video-fotos";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

// Player do Reels em tela cheia (clicar fora ou no ✕ fecha).
function PlayerModal({ url, onFechar }: { url: string; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="relative">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls autoPlay playsInline className="max-h-[85vh] rounded-xl" />
        <button onClick={onFechar} aria-label="Fechar" className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">✕</button>
      </div>
    </div>
  );
}

function CardVideo({ f, onAbrirSeletor }: { f: FestaView; onAbrirSeletor: () => void }) {
  const [ver, setVer] = useState(false);

  const pronto = f.videoUrl.startsWith("http");
  const emGeracao = f.videoUrl === "gerando";
  const nomes = rotuloAniversariantes(f.aniversariantes) || "Festa";
  const capa = f.fotos[0]?.url;

  const badge = pronto
    ? { txt: "✅ Pronto", cls: "bg-green-600 text-white" }
    : emGeracao
    ? { txt: "🎬 Gerando", cls: "bg-amber-500 text-black" }
    : f.fotos.length
    ? { txt: "Pra gerar", cls: "bg-black/70 text-white" }
    : { txt: "Sem fotos", cls: "bg-black/70 text-white/70" };

  // Autorização (LGPD): festa SEM autorização não pode ter o Reels postado — mostra no card.
  const autoriz = f.autorizacao === "negada"
    ? { txt: "✗ Sem autorização", cls: "bg-vermelho text-white" }
    : f.autorizacao === "pendente"
    ? { txt: "⏳ Pendente", cls: "bg-amber-500 text-black" }
    : { txt: "✓ Autorizado", cls: "bg-green-500 text-black" };

  return (
    <div className="overflow-hidden rounded-2xl border border-linha bg-preto-card transition hover:border-white/15">
      {/* miniatura vertical 9:16 */}
      <div className="relative aspect-[9/16] bg-preto">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-50">🎬</div>
        )}

        {/* badge de status (topo) */}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.txt}</span>

        {/* contador de fotos do vídeo (topo dir.) */}
        {f.videoFotos.length > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">🎬 {f.videoFotos.length}</span>
        )}

        {/* play central (pronto) ou spinner (gerando) */}
        {pronto && (
          <button onClick={() => setVer(true)} aria-label="Ver vídeo" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-2xl text-white backdrop-blur-sm transition hover:scale-110 hover:bg-[#7c3aed]">▶</span>
          </button>
        )}
        {emGeracao && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
            <span className="text-3xl">🎬</span>
            <span className="animate-pulse text-[11px] font-semibold text-white">Montando…</span>
          </div>
        )}

        {/* nome + data (rodapé do thumb, sobre gradiente) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-8">
          <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${autoriz.cls}`}>{autoriz.txt}</span>
          <p className="truncate font-titulo text-sm leading-tight text-white">{nomes}</p>
          <p className="truncate text-[10px] text-white/70">{dataCurta(f.dataISO)}{f.horario ? ` · ${f.horario}` : ""}{f.tema ? ` · ${f.tema}` : ""}</p>
        </div>
      </div>

      {/* ações */}
      <div className="flex items-stretch gap-1.5 p-2">
        {pronto ? (
          <>
            <button onClick={() => setVer(true)} className="flex-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500">▶ Ver vídeo</button>
            <button onClick={onAbrirSeletor} title="Trocar as fotos e gerar de novo" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed]/70 hover:bg-[#7c3aed]/25">🎬 Fotos</button>
          </>
        ) : emGeracao ? (
          <button disabled className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-300">🎬 Gerando…</button>
        ) : (
          <button onClick={onAbrirSeletor} className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">⚡ Gerar vídeo</button>
        )}
      </div>

      {ver && pronto && <PlayerModal url={f.videoUrl} onFechar={() => setVer(false)} />}
    </div>
  );
}

export function VideoPainel({ festas }: { festas: FestaView[] }) {
  const [seletor, setSeletor] = useState<FestaView | null>(null);
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">🎬 Vídeo das festas</p>
        <p className="mt-1 text-xs text-muted">
          Monte o <strong className="text-white/80">Reels</strong> de cada festa: escolha e ordene as fotos (🎬 Fotos), clique em <strong className="text-white/80">⚡ Gerar vídeo</strong> e o Postaí monta sozinho (capa + jingle). Depois, pra <strong className="text-white/80">agendar/postar</strong>, vá em <strong className="text-white/80">📱 Redes Sociais → 🎬 Reels</strong>.
        </p>
      </div>

      {festas.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhuma festa ainda. Crie festas na aba <strong className="text-white">📸 Festas</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {festas.map((f) => (
            <CardVideo key={f.id} f={f} onAbrirSeletor={() => setSeletor(f)} />
          ))}
        </div>
      )}

      {seletor && (
        <SeletorVideoFotos
          festaId={seletor.id}
          nome={rotuloAniversariantes(seletor.aniversariantes) || "Festa"}
          fotos={seletor.fotos}
          inicial={seletor.videoFotos}
          onFechar={() => setSeletor(null)}
        />
      )}
    </div>
  );
}
