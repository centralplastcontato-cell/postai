"use client";

import Link from "next/link";
import { sair } from "@/app/actions/admin";
import { APP_NAME } from "@/lib/config";

// Cabeçalho horizontal fino do painel (substituiu a sidebar lateral, que gastava
// largura à toa com um único item). Libera a área útil inteira pro conteúdo.
export function PainelHeader({ nome, admin, chamados = 0 }: { nome: string; admin?: boolean; chamados?: number }) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-linha bg-preto-card px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto sm:gap-4">
        <Link href="/painel" className="display shrink-0 text-xl text-white">
          {APP_NAME}
          <span className="text-vermelho">.</span>
        </Link>
        <Link
          href="/painel"
          title="Marcas"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
        >
          <span>🏷️</span>
          <span>Marcas</span>
        </Link>
        <Link
          href="/painel/chamados"
          title={admin ? "Chamados de suporte" : "Suporte"}
          className="relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
        >
          <span>🎫</span>
          <span className="hidden sm:inline">{admin ? "Chamados" : "Suporte"}</span>
          {chamados > 0 && (
            <span className="rounded-full bg-vermelho px-1.5 py-0.5 text-[10px] font-bold text-white">{chamados}</span>
          )}
        </Link>
        {!admin && (
          <Link
            href="/assinar"
            title="Planos e assinatura"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
          >
            <span>💳</span>
            <span className="hidden sm:inline">Planos</span>
          </Link>
        )}
        {admin && (
          <Link
            href="/painel/usuarios"
            title="Clientes"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
          >
            <span>👥</span>
            <span className="hidden sm:inline">Clientes</span>
          </Link>
        )}
        {admin && (
          <Link
            href="/painel/guia"
            title="Guia: colocar um cliente no ar"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
          >
            <span>📋</span>
            <span className="hidden sm:inline">Guia</span>
          </Link>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-muted sm:block">{nome}</span>
        <form action={sair}>
          <button className="rounded-md border border-linha px-3 py-1.5 text-sm text-muted transition hover:border-vermelho hover:text-white">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
