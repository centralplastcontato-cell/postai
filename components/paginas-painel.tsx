"use client";

// Aba PÁGINAS do painel — a "vitrine": cada festa vira um álbum pros pais (rota pública
// /festa/[tokenAlbum], SÓ-LEITURA). Aqui o dono copia o link de cada álbum pra mandar pros
// pais e abre a prévia. É diferente da aba Festas (operação: criar/subir foto no evento).

import { useState } from "react";
import { type FestaView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function statusFesta(f: FestaView): { txt: string; cls: string } {
  if (f.finalizadaEm) return { txt: "✓ Pronto pra enviar", cls: "border-green-500/30 bg-green-500/15 text-green-400" };
  if (f.fotos.length) return { txt: "Em andamento", cls: "border-amber-500/30 bg-amber-500/15 text-amber-300" };
  return { txt: "Sem fotos ainda", cls: "border-linha bg-preto text-muted" };
}

function CardPagina({ f, linkBase }: { f: FestaView; linkBase: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = `${linkBase}/festa/${f.tokenAlbum}`;
  const nomes = rotuloAniversariantes(f.aniversariantes) || "Festa";
  const st = statusFesta(f);

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
    <div className="rounded-xl border border-linha bg-preto-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white">🎂 {nomes}</p>
          <p className="mt-0.5 text-xs text-muted">
            {dataCurta(f.dataISO)}
            {f.horario ? ` · ${f.horario}` : ""}
            {f.tema ? ` · ${f.tema}` : ""}
            {` · ${f.fotos.length} ${f.fotos.length === 1 ? "foto" : "fotos"}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.txt}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="input-base flex-1 text-xs"
          style={{ minWidth: "12rem" }}
        />
        <button onClick={copiar} className="rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-white transition hover:border-vermelho">
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-vermelho px-3 py-2 text-xs font-semibold text-white transition hover:bg-vermelho-hover">
          Abrir ↗
        </a>
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
          Cada festa vira um <strong className="text-white/80">álbum pros pais</strong>. Mande o link — eles veem as fotos, podem avaliar no Google e recebem a oferta da próxima festa. O link só deixa <strong className="text-white/80">ver</strong> (não dá pra editar).
        </p>
      </div>

      {festas.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhuma festa ainda. Crie festas na aba <strong className="text-white">📸 Festas</strong>.
        </div>
      ) : (
        <div className="space-y-3">
          {festas.map((f) => (
            <CardPagina key={f.id} f={f} linkBase={linkBase} />
          ))}
        </div>
      )}
    </div>
  );
}
