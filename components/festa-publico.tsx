"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { removerFotoPublica, moverFotoMomento, finalizarFestaPublica, salvarGerenteFesta, salvarAutorizacaoFesta, salvarMostrarAvaliacao } from "@/app/actions/festas";
import { QRCodeSVG } from "qrcode.react";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { MOMENTOS_FESTA, LIMITE_FOTOS_FESTA, LIMITE_FOTOS_MOMENTO } from "@/lib/momentos-festa";
import { type FestaView, type FotoView, type MarcaPublica } from "@/lib/festa-tipos";
import { salvarFestaRecente } from "@/lib/festas-recentes";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

// LINK DA FESTA (isolado): mostra SÓ esta festa — subir fotos por momento, mover/remover,
// finalizar. Validado pelo token da festa nas actions; não dá acesso a outras festas.
export function FestaPublico({ token, marca, festa, linkAlbum }: { token: string; marca: MarcaPublica; festa: FestaView; linkAlbum: string }) {
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
  const [gerente, setGerente] = useState(festa.gerente || "");
  const [salvouGerente, setSalvouGerente] = useState(false);
  const [erroNome, setErroNome] = useState(false); // nome é obrigatório pra finalizar
  const nomeRef = useRef<HTMLInputElement>(null);
  const [albumCopiado, setAlbumCopiado] = useState(false); // linkAlbum (read-only pros pais) vem pronto do servidor
  // Autorização de uso de imagem (LGPD): pendente | autorizada | negada
  const [autoriz, setAutoriz] = useState(festa.autorizacao);
  const [motivoNao, setMotivoNao] = useState(festa.motivoNaoAutoriza || "");
  const [perguntandoMotivo, setPerguntandoMotivo] = useState(false);
  const [salvandoAutoriz, setSalvandoAutoriz] = useState(false);
  const [erroAutoriz, setErroAutoriz] = useState<string | null>(null);
  const autorizRef = useRef<HTMLDivElement>(null);
  // Card de avaliação no Google (liga/desliga no álbum) + QR code do álbum
  const [mostrarAval, setMostrarAval] = useState(festa.mostrarAvaliacao);
  const [salvandoAval, setSalvandoAval] = useState(false);
  const [mostrarQR, setMostrarQR] = useState(false);

  async function alternarAvaliacao() {
    const novo = !mostrarAval;
    setMostrarAval(novo);
    setSalvandoAval(true);
    try { await salvarMostrarAvaliacao(token, novo); router.refresh(); } catch { setMostrarAval(!novo); } finally { setSalvandoAval(false); }
  }

  async function salvarGerente() {
    try {
      const r = await salvarGerenteFesta(token, gerente);
      if (r.ok) { setSalvouGerente(true); setTimeout(() => setSalvouGerente(false), 2000); }
    } catch {}
  }

  // O aparelho LEMBRA esta festa — pra o gerente voltar mesmo se fechou a aba e perdeu o link.
  useEffect(() => {
    salvarFestaRecente({ token, label: rotuloAniversariantes(festa.aniversariantes) || "Festa", dataISO: festa.dataISO });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  // O gerente registra a autorização de uso de imagem (os pais autorizam divulgar?).
  async function autorizar(sim: boolean) {
    if (!sim && !perguntandoMotivo) { setPerguntandoMotivo(true); return; } // 1º "Não" → abre o campo de motivo
    if (!sim && !motivoNao.trim()) { setErroAutoriz("Escreva o motivo de não autorizar."); return; }
    setSalvandoAutoriz(true);
    setErroAutoriz(null);
    try {
      const r = await salvarAutorizacaoFesta(token, sim, sim ? "" : motivoNao);
      if (!r.ok) { setErroAutoriz(r.erro); return; }
      setAutoriz(sim ? "autorizada" : "negada");
      setPerguntandoMotivo(false);
      router.refresh();
    } catch {
      setErroAutoriz("Não consegui salvar agora. Tente de novo.");
    } finally {
      setSalvandoAutoriz(false);
    }
  }

  // Finalizar EXIGE: (1) o nome do gerente; (2) a decisão de autorização de imagem.
  async function tentarFinalizar() {
    if (!gerente.trim()) {
      setErroNome(true);
      nomeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nomeRef.current?.focus();
      return;
    }
    if (autoriz === "pendente") {
      setErroAutoriz("Registre a autorização de uso de imagem antes de finalizar.");
      autorizRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    await salvarGerenteFesta(token, gerente).catch(() => {}); // garante o nome salvo antes
    await alternarFinalizada(true);
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

  async function copiarAlbum() {
    try {
      await navigator.clipboard.writeText(linkAlbum);
      setAlbumCopiado(true);
      setTimeout(() => setAlbumCopiado(false), 1800);
    } catch {}
  }
  async function compartilharAlbum() {
    try {
      if (navigator.share) await navigator.share({ title: "Álbum da Festa", text: "Olha as fotos da festa! 💜", url: linkAlbum });
      else await copiarAlbum();
    } catch {
      /* cancelou — tudo bem */
    }
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
          <p className="mt-0.5 text-xs text-muted">{dataBR(festa.dataISO)}{festa.horario ? ` às ${festa.horario}` : ""} · {festa.fotos.length}/{LIMITE_FOTOS_FESTA} fotos {festa.finalizadaEm && <span className="font-semibold text-green-400">· ✓ Finalizada</span>}</p>
          <button type="button" onClick={copiarLink} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-linha px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:border-[#7c3aed] hover:text-white">🔗 {linkCopiado ? "✓ Link copiado!" : "Salvar o link desta festa (pra voltar depois)"}</button>
          <div className="mt-3 border-t border-linha pt-3">
            <label className="block text-xs font-medium text-muted">👤 Seu nome <span className="text-vermelho">*</span> <span className="font-normal text-muted/70">(quem está registrando as fotos)</span>
              <input
                ref={nomeRef}
                type="text"
                value={gerente}
                onChange={(e) => { setGerente(e.target.value); if (erroNome) setErroNome(false); }}
                onBlur={salvarGerente}
                placeholder="Ex: João (recepção)"
                maxLength={60}
                className={`input-base mt-1 ${erroNome ? "border-vermelho" : ""}`}
              />
            </label>
            {erroNome ? (
              <p className="mt-1 text-[11px] font-semibold text-vermelho">✋ Coloque seu nome antes de finalizar o envio.</p>
            ) : salvouGerente ? (
              <p className="mt-1 text-[11px] font-semibold text-green-400">✓ Salvo, obrigado!</p>
            ) : null}
          </div>

          {/* Autorização de uso de imagem (LGPD) — obrigatória pra finalizar */}
          <div ref={autorizRef} className="mt-3 border-t border-linha pt-3">
            <p className="text-xs font-medium text-muted">📋 Autorização de uso de imagem <span className="text-vermelho">*</span></p>
            <p className="mt-0.5 text-[11px] text-muted">Os pais autorizam o buffet a divulgar as fotos (Instagram, álbum)?</p>
            {autoriz === "autorizada" ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                <span className="text-xs font-semibold text-green-400">✓ Sim, os pais autorizaram</span>
                <button type="button" onClick={() => { setAutoriz("pendente"); setPerguntandoMotivo(false); setErroAutoriz(null); }} className="shrink-0 rounded-md border border-green-500/30 px-2.5 py-1 text-[11px] font-semibold text-green-400 transition hover:bg-green-500/15">alterar</button>
              </div>
            ) : autoriz === "negada" ? (
              <div className="mt-2 rounded-lg border border-vermelho/40 bg-vermelho/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-vermelho">✗ Não autorizaram a divulgação</span>
                  <button type="button" onClick={() => { setAutoriz("pendente"); setPerguntandoMotivo(true); setErroAutoriz(null); }} className="shrink-0 rounded-md border border-vermelho/40 px-2.5 py-1 text-[11px] font-semibold text-vermelho transition hover:bg-vermelho/15">alterar</button>
                </div>
                {motivoNao && <p className="mt-1 text-[11px] text-muted">Motivo: {motivoNao}</p>}
              </div>
            ) : !perguntandoMotivo ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => autorizar(true)} disabled={salvandoAutoriz} className="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/20 disabled:opacity-60">✓ Sim, autorizam</button>
                <button type="button" onClick={() => autorizar(false)} disabled={salvandoAutoriz} className="flex-1 rounded-lg border border-vermelho/40 bg-vermelho/10 px-3 py-2 text-xs font-semibold text-vermelho transition hover:bg-vermelho/20 disabled:opacity-60">✗ Não autorizam</button>
              </div>
            ) : (
              <div className="mt-2">
                <textarea value={motivoNao} onChange={(e) => { setMotivoNao(e.target.value); if (erroAutoriz) setErroAutoriz(null); }} rows={2} placeholder="Por que não autorizam? (ex: os pais preferem não divulgar a criança)" maxLength={300} className="input-base" />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => autorizar(false)} disabled={salvandoAutoriz} className="flex-1 rounded-lg bg-vermelho px-3 py-2 text-xs font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">{salvandoAutoriz ? "Salvando…" : "Confirmar: não autorizam"}</button>
                  <button type="button" onClick={() => { setPerguntandoMotivo(false); setErroAutoriz(null); }} className="rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-muted transition hover:text-white">Voltar</button>
                </div>
              </div>
            )}
            {erroAutoriz && <p className="mt-1 text-[11px] font-semibold text-vermelho">{erroAutoriz}</p>}
          </div>

          {/* Card de avaliação no Google — o gerente decide se aparece no álbum dos pais */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-linha pt-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white">⭐ Pedir avaliação no Google</p>
              <p className="mt-0.5 text-[11px] text-muted">Mostra um card no álbum dos pais convidando a avaliar o buffet.</p>
            </div>
            <button type="button" role="switch" aria-checked={mostrarAval} onClick={alternarAvaliacao} disabled={salvandoAval} aria-label="Pedir avaliação no Google" className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${mostrarAval ? "bg-green-500" : "bg-linha"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${mostrarAval ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
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
            <button type="button" onClick={tentarFinalizar} disabled={finalizando || festa.fotos.length === 0} title={festa.fotos.length === 0 ? "Suba pelo menos uma foto antes de finalizar" : undefined} className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 py-3 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 disabled:opacity-50">
              {finalizando ? "Finalizando…" : "✓ Finalizei o envio das fotos"}
            </button>
          )}

          {/* Link do álbum pros pais — o gerente já manda na hora (com os pais por perto) */}
          {festa.tokenAlbum && (
            <div className="rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 p-3">
              <p className="text-sm font-semibold text-white">📱 Álbum pros pais</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {festa.finalizadaEm
                  ? "Tudo pronto! Manda este link pra família ver as fotos. 🎉"
                  : "Link pra família ver as fotos. (Pode mandar agora ou finalizar antes pra ficar completo.)"}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input readOnly value={linkAlbum} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 w-full text-[11px] sm:flex-1" />
                <div className="flex gap-2">
                  <button type="button" onClick={copiarAlbum} className="flex-1 rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-white transition hover:border-[#7c3aed] sm:flex-none">{albumCopiado ? "✓ Copiado" : "📋 Copiar"}</button>
                  <a href={linkAlbum} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border border-linha px-3 py-2 text-center text-xs font-semibold text-white transition hover:border-[#7c3aed] sm:flex-none">↗ Abrir</a>
                  <button type="button" onClick={compartilharAlbum} className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#8b4ef5] sm:flex-none">💜 Compartilhar</button>
                </div>
              </div>
              <button type="button" onClick={() => setMostrarQR((v) => !v)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-[#7c3aed]">
                📲 {mostrarQR ? "Esconder QR code" : "Mostrar QR code pros pais"}
              </button>
              {mostrarQR && (
                <div className="mt-3 flex flex-col items-center rounded-lg border border-linha bg-white p-4">
                  <QRCodeSVG value={linkAlbum} size={180} level="M" />
                  <p className="mt-2 text-center text-[11px] font-semibold text-black">Os pais apontam a câmera do celular 📷</p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-muted">Postaí · Álbum da Festa</p>
      </div>
    </div>
  );
}
