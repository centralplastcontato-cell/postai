"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarLinkFotos, revogarLinkFotos, excluirFesta, editarFesta, adicionarFotoFestaPainel } from "@/app/actions/festas";
import { atualizarImagemMarca } from "@/app/actions/imagens";
import { type FestaView, type FotoView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { MOMENTOS_FESTA, LIMITE_FOTOS_MOMENTO } from "@/lib/momentos-festa";
import { InputDataBR } from "@/components/input-data-br";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

type Confirmacao = { titulo: string; texto: string; rotulo: string; perigo?: boolean; acao: () => void | Promise<void> };

// Aba 📸 Festas do painel da marca. Dois tipos de link:
//  • LINK DE CRIAR (da marca): o gerente cria festas por ele (não vê as existentes).
//  • LINK DE CADA FESTA: isolado — quem tem ele só mexe naquela festa.
// As fotos também aparecem no Banco de imagens (categoria 🎉 Festa); aqui ficam por evento.
export function FestasPainel({ marcaId, linkBase, token: tokenInicial, festas }: {
  marcaId: string;
  linkBase: string;
  token: string;
  festas: FestaView[];
}) {
  const router = useRouter();
  const [token, setToken] = useState(tokenInicial);
  const [gerando, setGerando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set()); // festas expandidas (começam TODAS colapsadas)
  const [fotoAberta, setFotoAberta] = useState<FotoView | null>(null); // foto aberta no modal (ampliar + descrição)
  const [descEdit, setDescEdit] = useState("");
  const [salvandoDesc, setSalvandoDesc] = useState(false);
  const [erroDesc, setErroDesc] = useState<string | null>(null);
  const [editando, setEditando] = useState<FestaView | null>(null); // festa em edição
  const [edData, setEdData] = useState("");
  const [edPessoas, setEdPessoas] = useState<{ nome: string; idade: string }[]>([{ nome: "", idade: "" }]);
  const [edTema, setEdTema] = useState("");
  const [salvandoEd, setSalvandoEd] = useState(false);
  const [erroEd, setErroEd] = useState<string | null>(null);
  const [subindoFesta, setSubindoFesta] = useState<string | null>(null); // "festaId:momento" recebendo fotos
  const [erroUpload, setErroUpload] = useState<string | null>(null);

  const linkCriar = token ? `${linkBase}/f/${token}` : "";

  async function subirFotosPainel(festaId: string, momento: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setErroUpload(null);
    setSubindoFesta(`${festaId}:${momento}`);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
        const data = await resp.json();
        if (!data.ok) { setErroUpload(data.erro || "Falha no upload de uma foto."); continue; }
        const r = await adicionarFotoFestaPainel(festaId, data.url, momento);
        if (!r.ok) setErroUpload(r.erro);
      }
      router.refresh();
    } catch {
      setErroUpload("Não consegui subir as fotos. Tente de novo.");
    } finally {
      setSubindoFesta(null);
    }
  }

  function toggleFesta(id: string) {
    setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function abrirFoto(foto: FotoView) {
    setFotoAberta(foto);
    setDescEdit(foto.descricao || "");
    setErroDesc(null);
  }
  async function salvarDescricao() {
    if (!fotoAberta) return;
    setSalvandoDesc(true);
    setErroDesc(null);
    try {
      const r = await atualizarImagemMarca({ id: fotoAberta.id, descricao: descEdit });
      if (!r.ok) { setErroDesc(r.erro); return; }
      setFotoAberta(null);
      router.refresh();
    } catch {
      setErroDesc("Não consegui salvar. Tente de novo.");
    } finally {
      setSalvandoDesc(false);
    }
  }

  function abrirEdicao(f: FestaView) {
    setEditando(f);
    setEdData(new Date(f.dataISO).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    setEdPessoas(f.aniversariantes.length ? f.aniversariantes.map((a) => ({ nome: a.nome, idade: a.idade != null ? String(a.idade) : "" })) : [{ nome: "", idade: "" }]);
    setEdTema(f.tema);
    setErroEd(null);
  }
  function setPessoaEd(i: number, campo: "nome" | "idade", val: string) {
    setEdPessoas((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: val } : p)));
  }
  function addPessoaEd() {
    setEdPessoas((ps) => (ps.length >= 10 ? ps : [...ps, { nome: "", idade: "" }]));
  }
  function removePessoaEd(i: number) {
    setEdPessoas((ps) => ps.filter((_, idx) => idx !== i));
  }
  async function salvarEdicao() {
    if (!editando) return;
    const lista = edPessoas
      .map((p) => ({ nome: p.nome.trim(), idade: p.idade.trim() ? parseInt(p.idade, 10) : null }))
      .filter((p) => p.nome);
    if (!lista.length) { setErroEd("Qual o nome do aniversariante?"); return; }
    setSalvandoEd(true);
    try {
      const r = await editarFesta(editando.id, { dataISO: edData, aniversariantes: lista, tema: edTema });
      if (!r.ok) { setErroEd(r.erro); return; }
      setEditando(null);
      router.refresh();
    } catch {
      setErroEd("Não consegui salvar. Tente de novo.");
    } finally {
      setSalvandoEd(false);
    }
  }

  async function gerar() {
    setErro(null);
    setGerando(true);
    try {
      const r = await gerarLinkFotos(marcaId);
      if (!r.ok) { setErro(r.erro); return; }
      setToken(r.token);
    } catch {
      setErro("Não consegui gerar o link agora. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  function gerarNovo() {
    setConfirmar({
      titulo: "Gerar um link de criar novo?",
      texto: "Isso desativa o link de criar atual — quem tiver o antigo não consegue mais criar festas. (Os links de festas já criadas continuam funcionando.)",
      rotulo: "Gerar link novo",
      acao: gerar,
    });
  }

  function pedirRevogar() {
    setConfirmar({
      titulo: "Desativar o link de criar?",
      texto: "Quem tiver o link atual deixa de conseguir criar festas. Os links de festas já criadas continuam funcionando. Você pode gerar um novo depois.",
      rotulo: "Desativar link",
      perigo: true,
      acao: async () => {
        setErro(null);
        try {
          const r = await revogarLinkFotos(marcaId);
          if (!r.ok) { setErro(r.erro); return; }
          setToken("");
        } catch {
          setErro("Não consegui desativar o link agora.");
        }
      },
    });
  }

  async function copiarLink(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie manualmente.");
    }
  }

  function pedirApagarFesta(f: FestaView) {
    setConfirmar({
      titulo: `Excluir a festa de ${rotuloAniversariantes(f.aniversariantes)}?`,
      texto: "As fotos continuam no Banco de imagens — só some o agrupamento por festa.",
      rotulo: "Excluir festa",
      perigo: true,
      acao: async () => {
        await excluirFesta(f.id);
        router.refresh();
      },
    });
  }

  return (
    <section className="space-y-5">
      {/* Modal de confirmação no padrão da plataforma (substitui o confirm() nativo) */}
      {confirmar && (
        <div onClick={() => setConfirmar(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-semibold text-white">{confirmar.titulo}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{confirmar.texto}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white">Cancelar</button>
              <button
                type="button"
                onClick={async () => { const a = confirmar.acao; setConfirmar(null); await a(); }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${confirmar.perigo ? "bg-red-600 hover:bg-red-700" : "bg-vermelho hover:bg-vermelho-hover"}`}
              >
                {confirmar.rotulo}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal da foto: ampliar + ver/corrigir a descrição que a IA leu (a Bia usa pra casar com o post) */}
      {fotoAberta && (
        <div onClick={() => !salvandoDesc && setFotoAberta(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-2xl border border-linha bg-preto-card p-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoAberta.url} alt="foto da festa" className="max-h-[45vh] w-full rounded-lg object-contain sm:max-h-[70vh] sm:w-1/2" />
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-semibold text-white">🔍 O que a IA leu nesta foto</p>
              <p className="mt-1 text-[11px] text-muted">A Bia usa esta descrição pra escolher a foto quando combinar com o post. Corrija aqui se ela errou.</p>
              <textarea value={descEdit} onChange={(e) => setDescEdit(e.target.value)} rows={3} placeholder="Ainda sem descrição — escreva uma (ex: Mesa de doces colorida)" className="input-base mt-3 resize-none" />
              {erroDesc && <p className="mt-2 text-sm text-vermelho">{erroDesc}</p>}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={salvarDescricao} disabled={salvandoDesc} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{salvandoDesc ? "Salvando…" : "Salvar"}</button>
                <button type="button" onClick={() => setFotoAberta(null)} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de editar as infos da festa */}
      {editando && (
        <div onClick={() => !salvandoEd && setEditando(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-semibold text-white">✏️ Editar festa</p>

            <label className="mt-4 block text-xs font-medium text-muted">Data da festa
              <InputDataBR value={edData} onChange={setEdData} className="mt-1" />
            </label>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Aniversariante(s) e idade</p>
              <div className="mt-1 space-y-2">
                {edPessoas.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={p.nome} onChange={(e) => setPessoaEd(i, "nome", e.target.value)} placeholder={i === 0 ? "Nome (ex: Maria)" : "Outro aniversariante"} className="input-base mt-0 flex-1" />
                    <input type="number" inputMode="numeric" min={0} max={130} value={p.idade} onChange={(e) => setPessoaEd(i, "idade", e.target.value)} placeholder="Idade" className="input-base mt-0 w-20 shrink-0" />
                    {edPessoas.length > 1 && (
                      <button type="button" onClick={() => removePessoaEd(i)} aria-label="Remover aniversariante" className="shrink-0 rounded-lg border border-linha px-2.5 py-2 text-sm text-muted transition hover:border-red-500/50 hover:text-red-400">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {edPessoas.length < 10 && (
                <button type="button" onClick={addPessoaEd} className="mt-2 text-xs font-semibold text-muted transition hover:text-white">+ Adicionar outro aniversariante</button>
              )}
            </div>

            <label className="mt-4 block text-xs font-medium text-muted">Tema da festa <span className="font-normal text-muted/70">(opcional)</span>
              <input type="text" value={edTema} onChange={(e) => setEdTema(e.target.value)} placeholder="Ex: Frozen, Super-heróis…" className="input-base mt-1" />
            </label>

            {erroEd && <p className="mt-3 text-sm text-vermelho">{erroEd}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} disabled={salvandoEd} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={salvarEdicao} disabled={salvandoEd} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">{salvandoEd ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cartão do LINK DE CRIAR */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🔗 Link pra criar festa</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Passe este link pro gerente do buffet. Ele abre no celular <strong className="text-white/80">sem login</strong>, cria a festa e ganha um <strong className="text-white/80">link só dela</strong> pra subir as fotos. Cada festa fica <strong className="text-white/80">isolada</strong> — um gerente não mexe na festa do outro. 🎉
        </p>

        {token ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={linkCriar} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[200px] flex-1 text-xs" />
              <button type="button" onClick={() => copiarLink(linkCriar, "criar")} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
                {copiadoId === "criar" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a href={linkCriar} target="_blank" rel="noopener noreferrer" className="text-muted underline transition hover:text-white">Abrir link</a>
              <button type="button" onClick={gerarNovo} className="text-muted underline transition hover:text-white">Gerar link novo</button>
              <button type="button" onClick={pedirRevogar} className="text-red-400 underline transition hover:text-red-300">Desativar link</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={gerar} disabled={gerando} className="mt-3 rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">
            {gerando ? "Gerando…" : "🔗 Gerar link pra criar festa"}
          </button>
        )}
        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
      </div>

      {/* Galeria por festa — cada uma com seu link próprio */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🎂 Festas registradas <span className="font-normal text-muted">({festas.length})</span></h3>
        {festas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">
            Nenhuma festa ainda. Gere o link de criar acima e mande pro gerente — as festas dele aparecem aqui. 🎉
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {festas.map((f) => {
              const linkFesta = `${linkBase}/f/${f.token}`;
              const aberta = abertas.has(f.id);
              return (
                <div key={f.id} className="rounded-lg border border-linha bg-preto p-3">
                  {/* Cabeçalho clicável: começa COLAPSADO; toca pra expandir/recolher */}
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => toggleFesta(f.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                      <span className="mt-0.5 shrink-0 text-xs text-muted">{aberta ? "▲" : "▼"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">🎂 {rotuloAniversariantes(f.aniversariantes)}{f.tema ? <span className="font-normal text-muted"> · {f.tema}</span> : null}</span>
                        <span className="block text-xs text-muted">{dataBR(f.dataISO)} · {f.fotos.length} {f.fotos.length === 1 ? "foto" : "fotos"} {f.finalizadaEm && <span className="font-semibold text-green-400">· ✓ Finalizada</span>}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => pedirApagarFesta(f)} title="Excluir festa" className="shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-900/30">✕ Excluir</button>
                  </div>

                  {aberta && (
                    <>
                      {/* Link próprio desta festa (pra mandar pro gerente responsável por ela) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input readOnly value={linkFesta} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[160px] flex-1 text-[11px]" />
                        <button type="button" onClick={() => copiarLink(linkFesta, f.id)} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">
                          {copiadoId === f.id ? "✓ Copiado" : "Copiar link"}
                        </button>
                        <button type="button" onClick={() => abrirEdicao(f)} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:border-sky-500 hover:text-sky-200">✏️ Editar</button>
                      </div>

                      {erroUpload && <p className="mt-3 rounded-lg border border-vermelho/40 bg-vermelho/10 p-2 text-center text-sm text-vermelho">{erroUpload}</p>}

                      {/* Fotos por momento — com botão de ADICIONAR (o dono/admin sobe direto pelo painel) */}
                      {MOMENTOS_FESTA.map((m) => {
                        const fotosM = f.fotos.filter((ft) => ft.momento === m.id);
                        const cheio = fotosM.length >= LIMITE_FOTOS_MOMENTO;
                        const subindoEste = subindoFesta === `${f.id}:${m.id}`;
                        return (
                          <div key={m.id} className="mt-3 rounded-lg border border-linha bg-preto p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-semibold text-white">{m.emoji} {m.label}</span>
                              <span className={`shrink-0 text-[11px] font-semibold ${cheio ? "text-green-400" : "text-muted"}`}>{cheio ? "✓ " : ""}{fotosM.length}/{LIMITE_FOTOS_MOMENTO}</span>
                            </div>
                            {!cheio && (
                              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
                                {subindoEste ? "Subindo…" : "📷 Adicionar fotos"}
                                <input type="file" accept="image/*" multiple className="hidden" disabled={subindoEste} onChange={(e) => subirFotosPainel(f.id, m.id, e.target.files)} />
                              </label>
                            )}
                            {fotosM.length > 0 && (
                              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                                {fotosM.map((foto) => (
                                  <button key={foto.id} type="button" onClick={() => abrirFoto(foto)} title="Ver / descrição da IA" className="relative block overflow-hidden rounded-md border border-linha transition hover:border-vermelho">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={foto.url} alt={m.label} className="aspect-square w-full object-cover" />
                                    {foto.descricao ? (
                                      <span title={foto.descricao} className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-0.5 text-left text-[9px] leading-tight text-white/90">🔍 {foto.descricao}</span>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
