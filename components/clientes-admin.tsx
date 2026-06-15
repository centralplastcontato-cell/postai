"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarCliente, excluirCliente, redefinirSenhaCliente, atribuirMarca, definirPacote, renovarAcesso, removerValidade } from "@/app/actions/usuarios";
import { PLANOS, rotuloPlano, diasDeAcesso } from "@/lib/plano";
import { ConfirmDialog } from "./confirm-dialog";

type Cliente = { id: string; nome: string; plano: string | null; acessoAte: string | null; marcas: { id: string; nome: string }[] };
type MarcaItem = { id: string; nome: string; usuarioId: string | null };
type Resumo = { total: number; ativos: number; mrr: number; porPacote: { essencial: number; profissional: number; turbo: number } };

function Metrica({ rotulo, valor, cor = "text-white" }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-lg border border-linha bg-preto px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
// Texto + cor do status de acesso de um cliente (pra lista do admin).
function statusAcesso(acessoAte: string | null): { txt: string; cls: string } {
  const dias = diasDeAcesso(acessoAte);
  if (dias === null) return { txt: "acesso aberto (sem validade)", cls: "text-muted" };
  if (dias < 0) return { txt: `🔴 vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`, cls: "text-red-400" };
  if (dias === 0) return { txt: "🔴 vence hoje", cls: "text-red-400" };
  const cls = dias <= 7 ? "text-red-400" : dias <= 30 ? "text-amber-300" : "text-green-400";
  return { txt: `ativo · ${dias} ${dias === 1 ? "dia" : "dias"} (até ${dataBR(acessoAte!)})`, cls };
}

export function ClientesAdmin({ usuarios, marcas, resumo }: { usuarios: Cliente[]; marcas: MarcaItem[]; resumo: Resumo }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [novoPlano, setNovoPlano] = useState("profissional");
  const [novoMeses, setNovoMeses] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<Cliente | null>(null);
  const [redefinindoId, setRedefinindoId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

  function aviso(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg((m) => (m === texto ? null : m)), 2500);
  }

  function handleCriar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarCliente(nome, senha, novoPlano, novoMeses);
      if (!r.ok) setErro(r.erro);
      else {
        setNome("");
        setSenha("");
        aviso("Cliente criado!");
        router.refresh();
      }
    });
  }

  function handleDefinirPacote(id: string, plano: string) {
    setErro(null);
    startTransition(async () => {
      const r = await definirPacote(id, plano);
      if (!r.ok) setErro(r.erro);
      else { aviso("Pacote atualizado!"); router.refresh(); }
    });
  }
  function handleRenovar(id: string, meses: number) {
    setErro(null);
    startTransition(async () => {
      const r = await renovarAcesso(id, meses);
      if (!r.ok) setErro(r.erro);
      else { aviso(`Acesso +${meses} ${meses === 1 ? "mês" : "meses"}!`); router.refresh(); }
    });
  }
  function handleRemoverValidade(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await removerValidade(id);
      if (!r.ok) setErro(r.erro);
      else { aviso("Validade removida (acesso aberto)."); router.refresh(); }
    });
  }

  function handleAtribuir(marcaId: string, usuarioId: string) {
    setErro(null);
    startTransition(async () => {
      const r = await atribuirMarca(marcaId, usuarioId);
      if (!r.ok) setErro(r.erro);
      else {
        aviso("Marca atualizada!");
        router.refresh();
      }
    });
  }

  // Abre/fecha o campo inline de nova senha pra um cliente (sem prompt() do navegador,
  // que muitos bloqueiam — por isso o botão "não fazia nada").
  function abrirRedefinir(id: string) {
    setErro(null);
    setNovaSenha("");
    setRedefinindoId((cur) => (cur === id ? null : id));
  }
  function handleSalvarSenha(id: string) {
    if (novaSenha.length < 4) {
      setErro("A nova senha precisa ter no mínimo 4 caracteres.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await redefinirSenhaCliente(id, novaSenha);
      if (!r.ok) setErro(r.erro);
      else {
        aviso("Senha redefinida!");
        setRedefinindoId(null);
        setNovaSenha("");
      }
    });
  }

  function confirmarExcluir(c: Cliente) {
    startTransition(async () => {
      const r = await excluirCliente(c.id);
      if (!r.ok) setErro(r.erro);
      else {
        aviso("Cliente removido. As marcas dele voltaram pra você.");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <h1 className="display text-3xl text-white">Clientes</h1>
      <p className="mt-1 text-sm text-muted">
        Crie um login para cada cliente e atribua a marca dele. O cliente entra e vê só a marca que é dele; você (admin) vê todas.
      </p>

      {/* Resumo do negócio */}
      <div className="mt-5 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-white">📊 Resumo do negócio</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metrica rotulo="Clientes" valor={String(resumo.total)} />
          <Metrica rotulo="Ativos (pagantes)" valor={String(resumo.ativos)} cor="text-green-400" />
          <Metrica rotulo="Receita / mês" valor={`R$ ${resumo.mrr.toLocaleString("pt-BR")}`} cor="text-green-400" />
          <Metrica rotulo="Ticket médio" valor={resumo.ativos > 0 ? `R$ ${Math.round(resumo.mrr / resumo.ativos).toLocaleString("pt-BR")}` : "—"} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Pacotes ativos:</span>
          <span className="rounded-full border border-linha bg-preto px-3 py-1 text-muted">Essencial <strong className="text-white">{resumo.porPacote.essencial}</strong></span>
          <span className="rounded-full border border-linha bg-preto px-3 py-1 text-muted">Profissional <strong className="text-white">{resumo.porPacote.profissional}</strong></span>
          <span className="rounded-full border border-linha bg-preto px-3 py-1 text-muted">Turbo <strong className="text-white">{resumo.porPacote.turbo}</strong></span>
        </div>
        {resumo.total === 0 && <p className="mt-3 text-xs text-muted">Crie seu primeiro cliente abaixo — os números aparecem aqui conforme você fecha e dá pacote a cada um.</p>}
      </div>

      {erro && <p className="mt-4 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}
      {msg && <p className="mt-4 rounded-md border border-green-800 bg-green-950/40 p-3 text-sm text-green-300">{msg}</p>}

      {/* Criar cliente */}
      <div className="mt-6 rounded-xl border border-linha bg-preto-card p-4">
        <p className="text-sm font-semibold text-white">➕ Novo cliente</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs text-muted">
            Usuário (login)
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: castelo" autoCapitalize="none" className="input-base" />
          </label>
          <label className="flex-1 text-xs text-muted">
            Senha
            <input value={senha} onChange={(e) => setSenha(e.target.value)} type="text" placeholder="mínimo 4 caracteres" className="input-base" />
          </label>
          <label className="text-xs text-muted">
            Pacote
            <select value={novoPlano} onChange={(e) => setNovoPlano(e.target.value)} className="input-base">
              {PLANOS.map((p) => <option key={p} value={p}>{rotuloPlano(p)}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">
            Acesso
            <select value={novoMeses} onChange={(e) => setNovoMeses(Number(e.target.value))} className="input-base">
              <option value={1}>1 mês</option>
              <option value={3}>3 meses</option>
              <option value={12}>1 ano</option>
              <option value={0}>sem validade</option>
            </select>
          </label>
          <button onClick={handleCriar} disabled={pending || !nome.trim() || senha.length < 4} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            Criar cliente
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">Anote a senha pra passar ao cliente. O pacote e a validade você ajusta depois também.</p>
      </div>

      {/* Atribuição de marcas */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-white">🏷️ Dono de cada marca</p>
        <div className="mt-3 grid gap-2">
          {marcas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linha bg-preto-card p-4 text-sm text-muted">Nenhuma marca ainda. Crie marcas no painel.</p>
          ) : (
            marcas.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linha bg-preto-card px-4 py-2.5">
                <span className="text-sm font-medium text-white">{m.nome}</span>
                <label className="text-xs text-muted">
                  Dono:{" "}
                  <select
                    value={m.usuarioId ?? ""}
                    onChange={(e) => handleAtribuir(m.id, e.target.value)}
                    disabled={pending}
                    className="input-compact ml-1 w-48"
                  >
                    <option value="">— sem dono (só admin) —</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-white">👥 Clientes cadastrados</p>
        <div className="mt-3 grid gap-2">
          {usuarios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linha bg-preto-card p-4 text-sm text-muted">Nenhum cliente ainda. Crie o primeiro acima.</p>
          ) : (
            usuarios.map((u) => (
              <div key={u.id} className="rounded-lg border border-linha bg-preto-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{u.nome}</p>
                    <p className="text-xs text-muted">
                      {u.marcas.length ? u.marcas.map((m) => m.nome).join(", ") : "sem marca atribuída"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirRedefinir(u.id)} disabled={pending} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-50">🔑 {redefinindoId === u.id ? "Fechar" : "Redefinir senha"}</button>
                    <button onClick={() => setExcluirAlvo(u)} disabled={pending} className="rounded-md border border-red-900 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-50">🗑 Excluir</button>
                  </div>
                </div>

                {/* Assinatura: pacote + validade do acesso */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-linha pt-3">
                  <label className="text-xs text-muted">
                    📦 Pacote:{" "}
                    <select value={u.plano ?? ""} onChange={(e) => handleDefinirPacote(u.id, e.target.value)} disabled={pending} className="input-compact ml-1 w-36">
                      <option value="">— nenhum —</option>
                      {PLANOS.map((p) => <option key={p} value={p}>{rotuloPlano(p)}</option>)}
                    </select>
                  </label>
                  <span className={`text-xs font-semibold ${statusAcesso(u.acessoAte).cls}`}>{statusAcesso(u.acessoAte).txt}</span>
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <button onClick={() => handleRenovar(u.id, 1)} disabled={pending} className="rounded-md border border-linha px-2.5 py-1 text-xs text-muted transition hover:border-green-500 hover:text-white disabled:opacity-50">+1 mês</button>
                    <button onClick={() => handleRenovar(u.id, 3)} disabled={pending} className="rounded-md border border-linha px-2.5 py-1 text-xs text-muted transition hover:border-green-500 hover:text-white disabled:opacity-50">+3 meses</button>
                    {u.acessoAte && <button onClick={() => handleRemoverValidade(u.id)} disabled={pending} className="rounded-md border border-linha px-2.5 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-50">remover validade</button>}
                  </div>
                </div>

                {redefinindoId === u.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-linha pt-3">
                    <label className="flex-1 text-xs text-muted">
                      Nova senha para <span className="font-semibold text-white">{u.nome}</span>
                      <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} type="text" placeholder="mínimo 4 caracteres" autoFocus className="input-base" />
                    </label>
                    <button onClick={() => handleSalvarSenha(u.id)} disabled={pending || novaSenha.length < 4} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">Salvar senha</button>
                    <button onClick={() => { setRedefinindoId(null); setNovaSenha(""); }} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho">Cancelar</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        aberto={!!excluirAlvo}
        titulo="Excluir este cliente?"
        descricao={excluirAlvo ? `O login "${excluirAlvo.nome}" será removido. As marcas dele NÃO são apagadas — voltam a aparecer só pra você (admin).` : undefined}
        textoConfirmar="Excluir cliente"
        onConfirmar={() => {
          if (excluirAlvo) confirmarExcluir(excluirAlvo);
          setExcluirAlvo(null);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />
    </div>
  );
}
