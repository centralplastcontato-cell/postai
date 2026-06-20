"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removerFotoPublica, moverFotoMomento, finalizarFestaPublica } from "@/app/actions/festas";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { MOMENTOS_FESTA, LIMITE_FOTOS_FESTA, LIMITE_FOTOS_MOMENTO } from "@/lib/momentos-festa";
import { type FestaView, type FotoView, type MarcaPublica } from "@/lib/festa-tipos";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

// LINK DA FESTA (isolado): mostra SÓ esta festa — subir fotos por momento, mover/remover,
// finalizar. Validado pelo token da festa nas actions; não dá acesso a outras festas.
export function FestaPublico({ token, marca, festa }: { token: string; marca: MarcaPublica; festa: FestaView }) {
  const router = useRouter();
  const cor = marca.corPrimaria || "#7C3AED";

  const [subindo, setSubindo] = useState<string | null>(null); // momento recebendo fotos
  const [erroUp, setErroUp] = useState<string | null>(null);
  const [fotoSel, setFotoSel] = useState<FotoView | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

  async function subirFotos(momento: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setErroUp(null);
    setSubindo(momento);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("momento", momento);
        const resp = await fetch(`/api/f/${token}/upload`, { method: "POST", body: form });
        const d = await resp.json();
        if (!d.ok) setErroUp(d.erro || "Falha ao subir uma das fotos.");
      }
      router.refresh();
    } catch {
      setErroUp("Não consegui subir as fotos. Confira a internet e tente de novo.");
    } finally {
      setSubindo(null);
    }
  }

  function abrirFoto(foto: FotoView) { setFotoSel(foto); setErroModal(null); }

  async function moverPara(momentoId: string) {
    if (!fotoSel) return;
    setMovendo(true);
    setErroModal(null);
    try {
      const r = await moverFotoMomento(token, fotoSel.id, momentoId);
      if (!r.ok) { setErroModal(r.erro); return; }
      setFotoSel(null);
      router.refresh();
    } catch {
      setErroModal("Não consegui mover a foto. Tente de novo.");
    } finally {
      setMovendo(false);
    }
  }

  async function confirmarRemover() {
    if (!fotoSel) return;
    setRemovendo(true);
    setErroModal(null);
    try {
      const r = await removerFotoPublica(token, fotoSel.id);
      if (!r.ok) { setErroModal(r.erro); return; }
      setFotoSel(null);
      router.refresh();
    } catch {
      setErroModal("Não consegui remover a foto. Tente de novo.");
    } finally {
      setRemovendo(false);
    }
  }

  async function alternarFinalizada(finalizar: boolean) {
    setFinalizando(true);
    setErroUp(null);
    try {
      const r = await finalizarFestaPublica(token, finalizar);
      if (!r.ok) setErroUp(r.erro);
      router.refresh();
    } catch {
      setErroUp("Não consegui atualizar agora. Tente de novo.");
    } finally {
      setFinalizando(false);
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 1800);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-preto px-4 py-6 sm:px-6 sm:py-10">
      {/* Modal de ações da foto: mover pro momento certo ou remover */}
      {fotoSel && (
        <div onClick={() => !removendo && !movendo && setFotoSel(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoSel.url} alt="foto da festa" className="h-40 w-full rounded-lg border border-linha object-cover" />
            <p className="mt-4 text-xs font-medium text-muted">Está no momento certo? Toque pra mover:</p>
            <div className="mt-2 space-y-1.5">
              {MOMENTOS_FESTA.map((m) => {
                const atual = fotoSel.momento === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={atual || movendo || removendo}
                    onClick={() => moverPara(m.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition disabled:cursor-default ${atual ? "border-[#7c3aed]/50 bg-[#7c3aed]/10 text-white" : "border-linha text-muted hover:border-white/40 hover:text-white disabled:opacity-60"}`}
                  >
                    <span>{m.emoji} {m.label}</span>
                    {atual && <span className="text-[11px] font-semibold text-[#c7b2ff]">✓ aqui</span>}
                  </button>
                );
              })}
            </div>
            {erroModal && <p className="mt-3 text-sm text-vermelho">{erroModal}</p>}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-linha pt-4">
              <button type="button" onClick={confirmarRemover} disabled={removendo || movendo} className="text-sm font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-60">{removendo ? "Removendo…" : "🗑 Remover foto"}</button>
              <button type="button" onClick={() => setFotoSel(null)} disabled={removendo || movendo} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white disabled:opacity-60">Fechar</button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-md">
        {/* Cabeçalho da marca */}
        <div className="flex items-center gap-3">
          {marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoUrl} alt={marca.nome} className="h-12 w-12 shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white" style={{ backgroundColor: cor }}>
              {marca.nome.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-white">📸 Álbum da Festa</h1>
            <p className="truncate text-xs text-muted">{marca.nome}</p>
          </div>
        </div>

        {/* Cabeçalho da festa */}
        <div className="mt-4 rounded-xl border border-linha bg-preto-card p-4">
          <p className="text-sm font-semibold text-white">🎂 {rotuloAniversariantes(festa.aniversariantes)}{festa.tema ? <span className="font-normal text-muted"> · {festa.tema}</span> : null}</p>
          <p className="mt-0.5 text-xs text-muted">{dataBR(festa.dataISO)} · {festa.fotos.length}/{LIMITE_FOTOS_FESTA} fotos {festa.finalizadaEm && <span className="font-semibold text-green-400">· ✓ Finalizada</span>}</p>
          <button type="button" onClick={copiarLink} className="mt-2 text-[11px] font-semibold text-muted underline transition hover:text-white">🔗 {linkCopiado ? "Link copiado!" : "Salvar o link desta festa (pra voltar depois)"}</button>
        </div>

        {erroUp && <p className="mt-3 rounded-lg border border-vermelho/40 bg-vermelho/10 p-2 text-center text-sm text-vermelho">{erroUp}</p>}

        {/* Um bloco por MOMENTO guiado */}
        <div className="mt-4 space-y-4">
          {MOMENTOS_FESTA.map((m) => {
            const fotosM = festa.fotos.filter((ft) => ft.momento === m.id);
            const cheio = fotosM.length >= LIMITE_FOTOS_MOMENTO;
            const subindoEste = subindo === m.id;
            return (
              <div key={m.id} className="rounded-lg border border-linha bg-preto-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{m.emoji} {m.label}</span>
                  <span className={`shrink-0 text-xs font-semibold ${cheio ? "text-green-400" : "text-muted"}`}>{cheio ? "✓ " : ""}{fotosM.length}/{LIMITE_FOTOS_MOMENTO}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{m.dica}</p>

                {!cheio && (
                  <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition active:opacity-80" style={{ backgroundColor: cor }}>
                    {subindoEste ? "Subindo…" : "📷 Adicionar fotos"}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={subindoEste} onChange={(e) => subirFotos(m.id, e.target.files)} />
                  </label>
                )}

                {fotosM.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {fotosM.map((foto) => (
                      <button key={foto.id} type="button" onClick={() => abrirFoto(foto)} className="relative block" aria-label="Opções da foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto.url} alt={m.label} className="aspect-square w-full rounded-lg border border-linha object-cover" />
                        <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white">⋯</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Finalizar / reabrir o envio da festa */}
          {festa.finalizadaEm ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-center">
              <p className="text-sm font-semibold text-green-400">✓ Envio finalizado</p>
              <p className="mt-0.5 text-[11px] text-muted">Tudo certo — o buffet já pode usar essas fotos. Esqueceu alguma?</p>
              <button type="button" onClick={() => alternarFinalizada(false)} disabled={finalizando} className="mt-2 rounded-lg border border-linha px-4 py-2 text-xs font-semibold text-muted transition hover:text-white disabled:opacity-60">
                {finalizando ? "…" : "↩ Reabrir pra adicionar mais"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => alternarFinalizada(true)} disabled={finalizando || festa.fotos.length === 0} title={festa.fotos.length === 0 ? "Suba pelo menos uma foto antes de finalizar" : undefined} className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 py-3 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 disabled:opacity-50">
              {finalizando ? "Finalizando…" : "✓ Finalizei o envio das fotos"}
            </button>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-muted">Postaí · Álbum da Festa</p>
      </div>
    </div>
  );
}
