"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarLinkFotos, revogarLinkFotos, excluirFesta, editarFesta, adicionarFotoFestaPainel, finalizarFestaPainel } from "@/app/actions/festas";
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
// As festas viram uma GALERIA de cards (igual a aba Vídeo); clicar num card abre o DETALHE
// num modal (link da festa + editar + fotos por momento + excluir). As fotos também aparecem
// no Banco de imagens (categoria 🎉 Festa); aqui ficam por evento.
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
  const [detalheId, setDetalheId] = useState<string | null>(null); // festa aberta no modal de detalhe
  const [fotoAberta, setFotoAberta] = useState<FotoView | null>(null); // foto aberta no modal (ampliar + descrição)
  const [descEdit, setDescEdit] = useState("");
  const [salvandoDesc, setSalvandoDesc] = useState(false);
  const [erroDesc, setErroDesc] = useState<string | null>(null);
  const [editando, setEditando] = useState<FestaView | null>(null); // festa em edição
  const [edData, setEdData] = useState("");
  const [edPessoas, setEdPessoas] = useState<{ nome: string; idade: string }[]>([{ nome: "", idade: "" }]);
  const [edTema, setEdTema] = useState("");
  const [edHorario, setEdHorario] = useState("");
  const [edInsta, setEdInsta] = useState("");
  const [salvandoEd, setSalvandoEd] = useState(false);
  const [erroEd, setErroEd] = useState<string | null>(null);
  const [subindoFesta, setSubindoFesta] = useState<string | null>(null); // "festaId:momento" recebendo fotos
  const [erroUpload, setErroUpload] = useState<string | null>(null);

  const linkCriar = token ? `${linkBase}/f/${token}` : "";
  // Derivado do `festas` (não de um snapshot): após router.refresh() o modal reflete os dados novos.
  const detalhe = detalheId ? festas.find((f) => f.id === detalheId) ?? null : null;

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
    setEdHorario(f.horario || "");
    setEdInsta(f.instagramAnfitriao || "");
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
      const r = await editarFesta(editando.id, { dataISO: edData, aniversariantes: lista, tema: edTema, horario: edHorario, instagramAnfitriao: edInsta });
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
        setDetalheId(null);
        await excluirFesta(f.id);
        router.refresh();
      },
    });
  }

  // Dono finaliza no lugar do gerente que esqueceu de fechar (ou reabre, se precisar).
  function pedirFinalizarFesta(f: FestaView) {
    setConfirmar({
      titulo: `Finalizar a festa de ${rotuloAniversariantes(f.aniversariantes)}?`,
      texto: "Marca a festa como concluída (caso o gerente tenha esquecido de fechar). Dá pra reabrir depois.",
      rotulo: "✓ Finalizar festa",
      perigo: false,
      acao: async () => {
        const r = await finalizarFestaPainel(f.id, true);
        if (!r.ok) setErro(r.erro);
        router.refresh();
      },
    });
  }
  function pedirReabrirFesta(f: FestaView) {
    setConfirmar({
      titulo: `Reabrir a festa de ${rotuloAniversariantes(f.aniversariantes)}?`,
      texto: "Volta pra 'Em andamento' — permite subir mais fotos e ajustar.",
      rotulo: "Reabrir festa",
      perigo: false,
      acao: async () => {
        const r = await finalizarFestaPainel(f.id, false);
        if (!r.ok) setErro(r.erro);
        router.refresh();
      },
    });
  }

  // Status (badge) de uma festa pro card da galeria.
  function statusFesta(f: FestaView): { txt: string; cls: string } {
    if (f.finalizadaEm) return { txt: "✓ Finalizada", cls: "bg-green-500 text-black" };
    if (f.fotos.length) return { txt: "Em andamento", cls: "bg-amber-500 text-black" };
    return { txt: "Sem fotos", cls: "bg-black/70 text-white/70" };
  }
  // Selo de autorização (LGPD) — mostra sempre, igual na aba Páginas.
  function statusAutoriz(f: FestaView): { txt: string; cls: string } {
    if (f.autorizacao === "negada") return { txt: "✗ Sem autorização", cls: "bg-vermelho text-white" };
    if (f.autorizacao === "pendente") return { txt: "⏳ Pendente", cls: "bg-amber-500 text-black" };
    return { txt: "✓ Autorizado", cls: "bg-green-500 text-black" };
  }

  return (
    <section className="space-y-5">
      {/* Modal de confirmação no padrão da plataforma (substitui o confirm() nativo) */}
      {confirmar && (
        <div onClick={() => setConfirmar(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
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
        <div onClick={() => !salvandoDesc && setFotoAberta(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
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
        <div onClick={() => !salvandoEd && setEditando(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-semibold text-white">✏️ Editar festa</p>

            <div className="mt-4 flex gap-3">
              <label className="block min-w-0 flex-1 text-xs font-medium text-muted">Data da festa
                <InputDataBR value={edData} onChange={setEdData} className="mt-1" />
              </label>
              <label className="block w-28 shrink-0 text-xs font-medium text-muted">Horário
                <input type="time" value={edHorario} onChange={(e) => setEdHorario(e.target.value)} style={{ colorScheme: "dark" }} className="input-base mt-1 min-w-0" />
              </label>
            </div>

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

            <label className="mt-4 block text-xs font-medium text-muted">📸 Instagram da família <span className="font-normal text-muted/70">(marca no post do Reels)</span>
              <input type="text" value={edInsta} onChange={(e) => setEdInsta(e.target.value)} placeholder="@usuario_da_familia" autoCapitalize="none" autoCorrect="off" className="input-base mt-1" />
            </label>

            {erroEd && <p className="mt-3 text-sm text-vermelho">{erroEd}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} disabled={salvandoEd} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={salvarEdicao} disabled={salvandoEd} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">{salvandoEd ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de DETALHE da festa — link próprio + editar + fotos por momento + excluir */}
      {detalhe && (
        <div onClick={() => setDetalheId(null)} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="my-4 w-full max-w-2xl rounded-2xl border border-linha bg-preto-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">🎂 {rotuloAniversariantes(detalhe.aniversariantes)}{detalhe.tema ? <span className="font-normal text-muted"> · {detalhe.tema}</span> : null}</p>
                <p className="text-xs text-muted">{dataBR(detalhe.dataISO)}{detalhe.horario ? ` às ${detalhe.horario}` : ""} · {detalhe.fotos.length} {detalhe.fotos.length === 1 ? "foto" : "fotos"}{detalhe.gerente ? <span> · 📷 {detalhe.gerente}</span> : null} {detalhe.finalizadaEm && <span className="font-semibold text-green-400">· ✓ Finalizada</span>}</p>
              </div>
              <button type="button" onClick={() => setDetalheId(null)} aria-label="Fechar" className="shrink-0 rounded-lg border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">✕</button>
            </div>

            {/* Link próprio desta festa (pra mandar pro gerente responsável por ela) */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input readOnly value={`${linkBase}/f/${detalhe.token}`} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[160px] flex-1 text-[11px]" />
              <button type="button" onClick={() => copiarLink(`${linkBase}/f/${detalhe.token}`, detalhe.id)} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">
                {copiadoId === detalhe.id ? "✓ Copiado" : "Copiar link"}
              </button>
              <a href={`${linkBase}/f/${detalhe.token}`} target="_blank" rel="noreferrer" className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-[#7c3aed] hover:text-white">↗ Abrir</a>
              <button type="button" onClick={() => abrirEdicao(detalhe)} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:border-sky-500 hover:text-sky-200">✏️ Editar</button>
            </div>

            {erroUpload && <p className="mt-3 rounded-lg border border-vermelho/40 bg-vermelho/10 p-2 text-center text-sm text-vermelho">{erroUpload}</p>}

            {/* Fotos por momento — com botão de ADICIONAR (o dono/admin sobe direto pelo painel) */}
            {MOMENTOS_FESTA.map((m) => {
              const fotosM = detalhe.fotos.filter((ft) => ft.momento === m.id);
              const cheio = fotosM.length >= LIMITE_FOTOS_MOMENTO;
              const subindoEste = subindoFesta === `${detalhe.id}:${m.id}`;
              return (
                <div key={m.id} className="mt-3 rounded-lg border border-linha bg-preto p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-white">{m.emoji} {m.label}</span>
                    <span className={`shrink-0 text-[11px] font-semibold ${cheio ? "text-green-400" : "text-muted"}`}>{cheio ? "✓ " : ""}{fotosM.length}/{LIMITE_FOTOS_MOMENTO}</span>
                  </div>
                  {!cheio && (
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
                      {subindoEste ? "Subindo…" : "📷 Adicionar fotos"}
                      <input type="file" accept="image/*" multiple className="hidden" disabled={subindoEste} onChange={(e) => subirFotosPainel(detalhe.id, m.id, e.target.files)} />
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

            <div className="mt-4 border-t border-linha pt-3 text-right">
              <button type="button" onClick={() => pedirApagarFesta(detalhe)} className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 hover:bg-red-900/20">✕ Excluir festa</button>
            </div>
          </div>
        </div>
      )}

      {/* Cartão do LINK DE CRIAR */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-white">🔗 Link para criar festas</h3>
          <span className="rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c7b2ff]">1 link · pro buffet todo</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          É <strong className="text-white/80">um link só</strong>, o mesmo pra sempre. Mande pro gerente: ele cria cada festa por aqui — e <strong className="text-white/80">cada festa ganha o próprio link</strong>, na lista abaixo.
        </p>

        {/* Como funciona — 2 passos, pra não confundir os dois tipos de link */}
        <div className="mt-3 space-y-1.5 rounded-lg border border-linha bg-preto p-3 text-[11px] text-muted">
          <p><span className="mr-1 font-semibold text-[#c7b2ff]">1.</span> Você manda <strong className="text-white/80">este</strong> link pro gerente (sempre o mesmo).</p>
          <p><span className="mr-1 font-semibold text-[#c7b2ff]">2.</span> Ele cria a festa → ganha um link <strong className="text-white/80">só dela</strong> (clicando na festa abaixo → <span className="text-white/80">Copiar link</span>).</p>
        </div>

        {token ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={linkCriar} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[200px] flex-1 text-xs" />
              <button type="button" onClick={() => copiarLink(linkCriar, "criar")} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
                {copiadoId === "criar" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={linkCriar} target="_blank" rel="noopener noreferrer" className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">↗ Abrir</a>
              <button type="button" onClick={gerarNovo} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">↻ Gerar novo</button>
              <button type="button" onClick={pedirRevogar} className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 hover:bg-red-900/20">🚫 Desativar</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={gerar} disabled={gerando} className="mt-3 rounded-lg bg-vermelho px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">
            {gerando ? "Gerando…" : "🔗 Gerar o link de criar festas"}
          </button>
        )}
        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
      </div>

      {/* GALERIA por festa — cada uma é um card; clicar abre o detalhe no modal */}
      <div>
        <h3 className="text-sm font-semibold text-white">🎂 Festas registradas <span className="font-normal text-muted">({festas.length})</span></h3>
        <p className="mt-0.5 text-[11px] text-muted">Cada festa tem o <strong className="text-white/70">seu próprio link</strong> — toque na festa pra abrir, copiar o link e gerenciar as fotos.</p>
        {festas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">
            Nenhuma festa ainda. Gere o link de criar acima e mande pro gerente — as festas dele aparecem aqui. 🎉
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {festas.map((f) => {
              const capa = f.fotos[0]?.url;
              const st = statusFesta(f);
              const sa = statusAutoriz(f);
              return (
                <div key={f.id} className="overflow-hidden rounded-2xl border border-linha bg-preto-card transition hover:border-white/15">
                  <button type="button" onClick={() => setDetalheId(f.id)} className="relative block aspect-[4/5] w-full bg-preto text-left">
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
                      <p className="truncate font-titulo text-sm leading-tight text-white">{rotuloAniversariantes(f.aniversariantes)}</p>
                      <p className="truncate text-[10px] text-white/70">{dataBR(f.dataISO)}{f.horario ? ` · ${f.horario}` : ""}{f.tema ? ` · ${f.tema}` : ""}</p>
                    </div>
                  </button>
                  <div className="flex items-stretch gap-1.5 p-2">
                    {!f.finalizadaEm && f.fotos.length > 0 && (
                      <button type="button" onClick={() => pedirFinalizarFesta(f)} title="Finalizar a festa (caso o gerente tenha esquecido)" className="shrink-0 rounded-lg border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 text-xs font-semibold text-green-400 transition hover:border-green-500 hover:bg-green-500/20">✓ Finalizar</button>
                    )}
                    {f.finalizadaEm && (
                      <button type="button" onClick={() => pedirReabrirFesta(f)} title="Reabrir a festa (volta pra Em andamento)" className="shrink-0 rounded-lg border border-linha px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-white/40 hover:text-white">↩</button>
                    )}
                    <button type="button" onClick={() => setDetalheId(f.id)} className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">Abrir festa</button>
                    <button type="button" onClick={() => pedirApagarFesta(f)} title="Excluir festa" className="shrink-0 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 hover:bg-red-900/20">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
