"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarFestaPublica, removerFotoPublica, moverFotoMomento } from "@/app/actions/festas";
import { type Aniversariante, rotuloAniversariantes } from "@/lib/aniversariantes";
import { MOMENTOS_FESTA, LIMITE_FOTOS_FESTA, LIMITE_FOTOS_MOMENTO } from "@/lib/momentos-festa";

export type FotoView = { id: string; url: string; momento: string };
export type FestaView = { id: string; dataISO: string; aniversariantes: Aniversariante[]; tema: string; fotos: FotoView[] };
export type MarcaPublica = { nome: string; logoUrl: string; corPrimaria: string };

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}
// Data de hoje (BRT) no formato yyyy-mm-dd pro <input type="date">.
function hojeBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// PÁGINA PÚBLICA do Álbum da Festa — o gerente do buffet abre pelo link (sem login), cria a
// festa e sobe as fotos por MOMENTO guiado (salão, brinquedos, parabéns…). Cada foto entra
// no banco da marca e abastece os posts.
export function AlbumFestaPublico({ token, marca, festas }: { token: string; marca: MarcaPublica; festas: FestaView[] }) {
  const router = useRouter();
  const cor = marca.corPrimaria || "#7C3AED";

  const [novaAberta, setNovaAberta] = useState(festas.length === 0);
  const [data, setData] = useState("");
  const [pessoas, setPessoas] = useState<{ nome: string; idade: string }[]>([{ nome: "", idade: "" }]);
  const [tema, setTema] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [festaAtiva, setFestaAtiva] = useState<string | null>(festas[0]?.id ?? null);
  const [subindo, setSubindo] = useState<string | null>(null); // "festaId:momento" que está recebendo fotos
  const [erroUp, setErroUp] = useState<string | null>(null);
  const [fotoSel, setFotoSel] = useState<FotoView | null>(null); // foto aberta no modal de ações (mover/remover)
  const [removendo, setRemovendo] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  function setPessoa(i: number, campo: "nome" | "idade", val: string) {
    setPessoas((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: val } : p)));
  }
  function addPessoa() {
    setPessoas((ps) => (ps.length >= 10 ? ps : [...ps, { nome: "", idade: "" }]));
  }
  function removePessoa(i: number) {
    setPessoas((ps) => ps.filter((_, idx) => idx !== i));
  }

  function abrirNova() {
    setData(hojeBR());
    setPessoas([{ nome: "", idade: "" }]);
    setTema("");
    setErro(null);
    setNovaAberta(true);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const lista = pessoas
      .map((p) => ({ nome: p.nome.trim(), idade: p.idade.trim() ? parseInt(p.idade, 10) : null }))
      .filter((p) => p.nome);
    if (!lista.length) { setErro("Qual o nome do aniversariante?"); return; }
    setCriando(true);
    try {
      const r = await criarFestaPublica(token, { dataISO: data || hojeBR(), aniversariantes: lista, tema });
      if (!r.ok) { setErro(r.erro); setCriando(false); return; }
      setNovaAberta(false);
      setFestaAtiva(r.festaId);
      router.refresh();
    } catch {
      setErro("Algo deu errado ao criar a festa. Tente de novo.");
    } finally {
      setCriando(false);
    }
  }

  async function subirFotos(festaId: string, momento: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setErroUp(null);
    setSubindo(`${festaId}:${momento}`);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("festaId", festaId);
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

  function abrirFoto(foto: FotoView) {
    setFotoSel(foto);
    setErroModal(null);
  }

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

  return (
    <div className="min-h-screen bg-preto px-4 py-6 sm:px-6 sm:py-10">
      {/* Modal de ações da foto: mover pro momento certo ou remover (padrão escuro, sem confirm() nativo) */}
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

        <p className="mt-4 rounded-xl border border-linha bg-preto-card p-3 text-sm leading-relaxed text-muted">
          Crie a festa e vá subindo as fotos por momento durante o evento. Elas viram conteúdo do perfil do buffet, automaticamente. 🎉
        </p>

        {/* Nova festa */}
        {novaAberta ? (
          <form onSubmit={criar} className="mt-4 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
            <p className="text-sm font-semibold text-white">✨ Nova festa</p>

            <label className="mt-4 block text-xs font-medium text-muted">Data da festa
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input-base mt-1" />
            </label>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Aniversariante(s) e idade</p>
              <div className="mt-1 space-y-2">
                {pessoas.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.nome}
                      onChange={(e) => setPessoa(i, "nome", e.target.value)}
                      placeholder={i === 0 ? "Nome (ex: Maria)" : "Outro aniversariante"}
                      autoFocus={i === 0}
                      className="input-base mt-0 flex-1"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={130}
                      value={p.idade}
                      onChange={(e) => setPessoa(i, "idade", e.target.value)}
                      placeholder="Idade"
                      className="input-base mt-0 w-20 shrink-0"
                    />
                    {pessoas.length > 1 && (
                      <button type="button" onClick={() => removePessoa(i)} aria-label="Remover aniversariante" className="shrink-0 rounded-lg border border-linha px-2.5 py-2 text-sm text-muted transition hover:border-red-500/50 hover:text-red-400">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {pessoas.length < 10 && (
                <button type="button" onClick={addPessoa} className="mt-2 text-xs font-semibold text-muted transition hover:text-white">+ Adicionar outro aniversariante</button>
              )}
            </div>

            <label className="mt-4 block text-xs font-medium text-muted">Tema da festa <span className="font-normal text-muted/70">(opcional)</span>
              <input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: Frozen, Super-heróis…" className="input-base mt-1" />
            </label>

            {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={criando} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60" style={{ backgroundColor: cor }}>
                {criando ? "Criando…" : "Criar festa"}
              </button>
              {festas.length > 0 && (
                <button type="button" onClick={() => setNovaAberta(false)} className="rounded-lg border border-linha px-4 py-2.5 text-sm text-muted transition hover:text-white">Cancelar</button>
              )}
            </div>
          </form>
        ) : (
          <button type="button" onClick={abrirNova} className="mt-4 w-full rounded-xl border border-dashed border-linha bg-preto-card py-3.5 text-sm font-semibold text-white transition hover:border-white/40">
            ➕ Nova festa
          </button>
        )}

        {/* Lista de festas */}
        <div className="mt-5 space-y-3">
          {festas.map((f) => {
            const ativa = festaAtiva === f.id;
            return (
              <div key={f.id} className="overflow-hidden rounded-xl border border-linha bg-preto-card">
                <button type="button" onClick={() => setFestaAtiva(ativa ? null : f.id)} className="flex w-full items-center justify-between gap-2 p-4 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">🎂 {rotuloAniversariantes(f.aniversariantes)}{f.tema ? <span className="font-normal text-muted"> · {f.tema}</span> : null}</span>
                    <span className="block text-xs text-muted">{dataBR(f.dataISO)} · {f.fotos.length}/{LIMITE_FOTOS_FESTA} fotos</span>
                  </span>
                  <span className="shrink-0 text-muted">{ativa ? "▲" : "▼"}</span>
                </button>

                {ativa && (
                  <div className="space-y-4 border-t border-linha p-4">
                    {erroUp && <p className="rounded-lg border border-vermelho/40 bg-vermelho/10 p-2 text-center text-sm text-vermelho">{erroUp}</p>}

                    {/* Um bloco por MOMENTO guiado */}
                    {MOMENTOS_FESTA.map((m) => {
                      const fotosM = f.fotos.filter((ft) => ft.momento === m.id);
                      const cheio = fotosM.length >= LIMITE_FOTOS_MOMENTO;
                      const subindoEste = subindo === `${f.id}:${m.id}`;
                      return (
                        <div key={m.id} className="rounded-lg border border-linha bg-preto p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white">{m.emoji} {m.label}</span>
                            <span className={`shrink-0 text-xs font-semibold ${cheio ? "text-green-400" : "text-muted"}`}>{cheio ? "✓ " : ""}{fotosM.length}/{LIMITE_FOTOS_MOMENTO}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted">{m.dica}</p>

                          {!cheio && (
                            <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition active:opacity-80" style={{ backgroundColor: cor }}>
                              {subindoEste ? "Subindo…" : "📷 Adicionar fotos"}
                              <input type="file" accept="image/*" multiple className="hidden" disabled={subindoEste} onChange={(e) => subirFotos(f.id, m.id, e.target.files)} />
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
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[11px] text-muted">Postaí · Álbum da Festa</p>
      </div>
    </div>
  );
}
