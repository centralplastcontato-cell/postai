"use client";

import Link from "next/link";
import { sair } from "@/app/actions/admin";
import { APP_NAME } from "@/lib/config";

// Cabeçalho horizontal fino do painel (substituiu a sidebar lateral, que gastava
// largura à toa com um único item). Libera a área útil inteira pro conteúdo.
export function PainelHeader({ nome, admin }: { nome: string; admin?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-linha bg-preto-card px-4 py-2.5">
      <div className="flex items-center gap-2 sm:gap-4">
        <Link href="/painel" className="display text-xl text-white">
          {APP_NAME}
          <span className="text-vermelho">.</span>
        </Link>
        <Link
          href="/painel"
          title="Marcas"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
        >
          <span>🏷️</span>
          <span>Marcas</span>
        </Link>
        {admin && (
          <Link
            href="/painel/usuarios"
            title="Clientes"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
          >
            <span>👥</span>
            <span>Clientes</span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
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
