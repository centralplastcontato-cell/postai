"use client";

// Aba PÁGINAS do painel — a "vitrine": cada festa vira um álbum pros pais (rota pública
// /festa/[tokenAlbum], SÓ-LEITURA). Aqui o dono copia o link de cada álbum pra mandar pros
// pais e abre a prévia. É diferente da aba Festas (operação: criar/subir foto no evento).

import { useState } from "react";
import { type FestaView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { SeletorVideoFotos } from "@/components/seletor-video-fotos";
import { FestaVideoAgendar } from "@/components/festa-video-agendar";
import { FestaGerarVideo } from "@/components/festa-gerar-video";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function statusFesta(f: FestaView): { txt: string; cls: string } {
  if (f.finalizadaEm) return { txt: "✓ Pronto pra enviar", cls: "border-green-500/30 bg-green-500/15 text-green-400" };
  if (f.fotos.length) return { txt: "Em andamento", cls: "border-amber-500/30 bg-amber-500/15 text-amber-300" };
  return { txt: "Sem fotos ainda", cls: "border-linha bg-preto text-muted" };
}

// Selo de autorização de uso de imagem — só aparece quando NÃO autorizada (o caso que pede atenção).
function statusAutoriz(f: FestaView): { txt: string; cls: string } | null {
  if (f.autorizacao === "negada") return { txt: "✗ Sem autorização", cls: "border-vermelho/40 bg-vermelho/10 text-vermelho" };
  if (f.autorizacao === "pendente") return { txt: "⏳ Autorização pendente", cls: "border-amber-500/30 bg-amber-500/15 text-amber-300" };
  return null;
}

function CardPagina({ f, linkBase, onAbrirSeletor }: { f: FestaView; linkBase: string; onAbrirSeletor: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const url = `${linkBase}/festa/${f.tokenAlbum}`;
  const nomes = rotuloAniversariantes(f.aniversariantes) || "Festa";
  const st = statusFesta(f);
  const sa = statusAutoriz(f);
  const capa = f.fotos[0]?.url; // miniatura: uma foto da festa (ou placeholder)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* navegador sem clipboard — o usuário copia manual do campo */
    }
  }

  return (
    <div className="rounded-2xl border border-linha bg-preto-card p-3 transition hover:border-white/15 sm:p-4">
      {/* topo: capa + info */}
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-linha bg-preto sm:h-24 sm:w-24">
          {capa ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capa} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-60">🎂</div>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-[10px] font-semibold text-white">
            {f.fotos.length} {f.fotos.length === 1 ? "foto" : "fotos"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-titulo text-lg leading-tight text-white">{nomes}</p>
            <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.txt}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {dataCurta(f.dataISO)}{f.horario ? ` · ${f.horario}` : ""}{f.tema ? ` · ${f.tema}` : ""}
          </p>
          {sa && <span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sa.cls}`}>{sa.txt}</span>}
          {f.autorizacao === "negada" && (
            <p className="mt-1.5 rounded-md border border-vermelho/30 bg-vermelho/5 px-2 py-1 text-[11px] text-muted">
              🔒 Fotos não divulgadas{f.motivoNaoAutoriza ? ` — ${f.motivoNaoAutoriza}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* link do álbum */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-linha bg-preto px-3 py-2">
        <span className="shrink-0 text-sm opacity-70">🔗</span>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-xs text-muted outline-none"
        />
        <button onClick={copiar} className="shrink-0 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-vermelho px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-vermelho-hover">
          Abrir ↗
        </a>
      </div>

      {/* vídeo: pronto (ver+agendar) · gerando · gerar */}
      {f.videoUrl.startsWith("http") ? (
        <FestaVideoAgendar videoUrl={f.videoUrl} />
      ) : f.videoUrl === "gerando" ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <span className="text-lg">🎬</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white">Gerando o vídeo…</p>
            <p className="text-[11px] text-muted">Leva uns minutos. Atualize a página pra ver quando ficar pronto. ⏳</p>
          </div>
        </div>
      ) : (
        <FestaGerarVideo festaId={f.id} />
      )}

      {/* ações secundárias */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linha pt-3">
        <a
          href={`${linkBase}/f/${f.token}`}
          target="_blank"
          rel="noreferrer"
          className="group/g inline-flex items-center gap-2 rounded-xl border border-linha bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-white/90 transition hover:border-white/20 hover:bg-white/[0.07]"
        >
          <span className="text-sm">🔧</span>
          Tela do gerente
          <span className="text-muted transition group-hover/g:translate-x-0.5">↗</span>
        </a>
        <button
          type="button"
          onClick={onAbrirSeletor}
          className="inline-flex items-center gap-2 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-3.5 py-2 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed]/70 hover:bg-[#7c3aed]/25"
        >
          <span className="text-sm">🎬</span>
          Fotos do vídeo
          {f.videoFotos.length > 0 && (
            <span className="rounded-full bg-[#7c3aed] px-1.5 py-0.5 text-[10px] font-bold text-white">{f.videoFotos.length}</span>
          )}
        </button>
      </div>
    </div>
  );
}

export function PaginasPainel({ festas, linkBase }: { festas: FestaView[]; linkBase: string }) {
  const [seletor, setSeletor] = useState<FestaView | null>(null);
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">📄 Páginas das festas</p>
        <p className="mt-1 text-xs text-muted">
          Cada festa vira um <strong className="text-white/80">álbum pros pais</strong>. Mande o link — eles veem as fotos, podem avaliar no Google e recebem a oferta da próxima festa. O link só deixa <strong className="text-white/80">ver</strong>. Já o <strong className="text-white/80">🔧</strong> abre a <strong className="text-white/80">tela do gerente</strong> — onde você (ou ele) sobe e edita as fotos.
        </p>
      </div>

      {festas.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhuma festa ainda. Crie festas na aba <strong className="text-white">📸 Festas</strong>.
        </div>
      ) : (
        <div className="space-y-3">
          {festas.map((f) => (
            <CardPagina key={f.id} f={f} linkBase={linkBase} onAbrirSeletor={() => setSeletor(f)} />
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
