"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarCliente, excluirCliente, redefinirSenhaCliente, atribuirMarca } from "@/app/actions/usuarios";
import { ConfirmDialog } from "./confirm-dialog";

type Cliente = { id: string; nome: string; marcas: { id: string; nome: string }[] };
type MarcaItem = { id: string; nome: string; usuarioId: string | null };

export function ClientesAdmin({ usuarios, marcas }: { usuarios: Cliente[]; marcas: MarcaItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<Cliente | null>(null);

  function aviso(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg((m) => (m === texto ? null : m)), 2500);
  }

  function handleCriar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarCliente(nome, senha);
      if (!r.ok) setErro(r.erro);
      else {
        setNome("");
        setSenha("");
        aviso("Cliente criado!");
        router.refresh();
      }
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

  function handleSenha(id: string) {
    const nova = prompt("Nova senha do cliente (mínimo 4 caracteres):");
    if (nova === null) return;
    setErro(null);
    startTransition(async () => {
      const r = await redefinirSenhaCliente(id, nova);
      if (!r.ok) setErro(r.erro);
      else aviso("Senha redefinida!");
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
          <button onClick={handleCriar} disabled={pending || !nome.trim() || senha.length < 4} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            Criar cliente
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">Anote a senha pra passar ao cliente. Você pode redefinir depois.</p>
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
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linha bg-preto-card px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{u.nome}</p>
                  <p className="text-xs text-muted">
                    {u.marcas.length ? u.marcas.map((m) => m.nome).join(", ") : "sem marca atribuída"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleSenha(u.id)} disabled={pending} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-50">🔑 Redefinir senha</button>
                  <button onClick={() => setExcluirAlvo(u)} disabled={pending} className="rounded-md border border-red-900 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-50">🗑 Excluir</button>
                </div>
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
