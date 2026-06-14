"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { entrar } from "@/app/actions/admin";
import { APP_NAME } from "@/lib/config";

export default function LoginPage() {
  const [state, action, pending] = useActionState(entrar, null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-preto px-5">
      <form
        action={action}
        className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-8"
      >
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-white"
        >
          ← Voltar ao site
        </Link>
        <h1 className="display text-3xl text-white">
          {APP_NAME}
          <span className="text-vermelho">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Painel de postagem automática.</p>

        <input
          type="text"
          name="nome"
          placeholder="Usuário"
          autoFocus
          autoCapitalize="none"
          autoComplete="username"
          className="input-base"
        />

        <div className="relative mt-3">
          <input
            type={mostrarSenha ? "text" : "password"}
            name="senha"
            placeholder="Senha"
            autoComplete="current-password"
            className="input-base pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg text-muted hover:text-white"
          >
            {mostrarSenha ? "🙈" : "👁️"}
          </button>
        </div>

        {state?.erro && <p className="mt-3 text-sm text-vermelho">{state.erro}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-lg bg-vermelho px-6 py-3 font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60"
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
