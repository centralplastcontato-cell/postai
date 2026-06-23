"use client";

// Aba PÁGINAS do painel — GALERIA de álbuns pros pais: cada festa vira um card (capa + status +
// autorização) com o link público SÓ-LEITURA (/festa/[tokenAlbum]). A ação principal é 📋 Copiar
// o link pra mandar pros pais; ↗ abre a prévia do álbum e 🔧 abre a tela do gerente (edição).
// Mesmo visual das abas Vídeo e Festas. É diferente da aba Festas (operação) e Vídeo (Reels).

import { useState } from "react";
import { type FestaView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function statusFesta(f: FestaView): { txt: string; cls: string } {
  if (f.finalizadaEm) return { txt: "✓ Pronto", cls: "bg-green-500 text-black" };
  if (f.fotos.length) return { txt: "Em andamento", cls: "bg-amber-500 text-black" };
  return { txt: "Sem fotos", cls: "bg-black/70 text-white/70" };
}

// Selo de autorização de uso de imagem (LGPD) — mostra SEMPRE, pro dono ver de relance no card.
function statusAutoriz(f: FestaView): { txt: string; cls: string } {
  if (f.autorizacao === "negada") return { txt: "✗ Sem autorização", cls: "bg-vermelho text-white" };
  if (f.autorizacao === "pendente") return { txt: "⏳ Pendente", cls: "bg-amber-500 text-black" };
  return { txt: "✓ Autorizado", cls: "bg-green-500 text-black" };
}

function CardPagina({ f, linkBase }: { f: FestaView; linkBase: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = `${linkBase}/festa/${f.tokenAlbum}`;
  const nomes = rotuloAniversariantes(f.aniversariantes) || "Festa";
  const st = statusFesta(f);
  const sa = statusAutoriz(f);
  const capa = f.fotos[0]?.url;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* navegador sem clipboard — abre o álbum pra copiar manual */
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-linha bg-preto-card transition hover:border-white/15">
      {/* capa — abrir o álbum (prévia pros pais) ao clicar */}
      <a href={url} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] w-full bg-preto">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-50">🎂</div>
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.txt}</span>
        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">📷 {f.fotos.length}</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-8">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${sa.cls}`}>{sa.txt}</span>
            <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${f.mostrarAvaliacao ? "bg-green-500 text-black" : "bg-black/55 text-white/60"}`}>⭐ Google {f.mostrarAvaliacao ? "on" : "off"}</span>
          </div>
          <p className="truncate font-titulo text-sm leading-tight text-white">{nomes}</p>
          <p className="truncate text-[10px] text-white/70">{dataCurta(f.dataISO)}{f.horario ? ` · ${f.horario}` : ""}{f.tema ? ` · ${f.tema}` : ""}</p>
        </div>
      </a>

      {/* ações: copiar o link do álbum (principal) · abrir prévia · tela do gerente */}
      <div className="flex items-stretch gap-1.5 p-2">
        <button type="button" onClick={copiar} className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">
          {copiado ? "✓ Copiado" : "📋 Copiar link"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" title="Abrir o álbum (prévia pros pais)" className="shrink-0 rounded-lg border border-linha px-2.5 py-1.5 text-xs font-semibold text-white/90 transition hover:border-white/30">↗</a>
        <a href={`${linkBase}/f/${f.token}`} target="_blank" rel="noreferrer" title="Tela do gerente (subir/editar fotos)" className="shrink-0 rounded-lg border border-linha px-2.5 py-1.5 text-xs font-semibold text-white/90 transition hover:border-white/30">🔧</a>
      </div>
    </div>
  );
}

export function PaginasPainel({ festas, linkBase }: { festas: FestaView[]; linkBase: string }) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">📄 Páginas das festas</p>
        <p className="mt-1 text-xs text-muted">
          Cada festa vira um <strong className="text-white/80">álbum pros pais</strong>. <strong className="text-white/80">📋 Copie</strong> o link e mande — eles veem as fotos, podem avaliar no Google e recebem a oferta da próxima festa (só deixa <strong className="text-white/80">ver</strong>). O <strong className="text-white/80">↗</strong> abre a prévia e o <strong className="text-white/80">🔧</strong> abre a tela do gerente (subir/editar fotos).
        </p>
      </div>

      {festas.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhuma festa ainda. Crie festas na aba <strong className="text-white">📸 Festas</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {festas.map((f) => (
            <CardPagina key={f.id} f={f} linkBase={linkBase} />
          ))}
        </div>
      )}
    </div>
  );
}
