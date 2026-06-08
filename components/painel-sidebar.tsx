"use client";

import { useState } from "react";
import Link from "next/link";
import { sair } from "@/app/actions/admin";
import { APP_NAME } from "@/lib/config";

export function PainelSidebar({ nome }: { nome: string }) {
  const [recolhido, setRecolhido] = useState(false);

  return (
    <aside
      className={`flex shrink-0 flex-col border-b border-linha bg-preto-card p-4 transition-all duration-200 md:border-b-0 md:border-r ${
        recolhido ? "md:w-16" : "md:w-56"
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        {/* Marca (some quando recolhido no desktop) */}
        <div className={recolhido ? "md:hidden" : ""}>
          <Link href="/painel" className="display text-xl text-white">
            {APP_NAME}
            <span className="text-vermelho">.</span>
          </Link>
          <p className="hidden text-xs text-muted md:block">{nome}</p>
        </div>

        {/* Botão recolher/expandir (só desktop) */}
        <button
          onClick={() => setRecolhido((r) => !r)}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className="hidden rounded-md border border-linha px-2 py-1 text-sm text-muted transition hover:border-vermelho hover:text-white md:block"
        >
          {recolhido ? "»" : "«"}
        </button>

        {/* Sair no topo (só celular) */}
        <form action={sair} className="md:hidden">
          <button className="rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">
            Sair
          </button>
        </form>
      </div>

      <nav className="flex flex-row gap-1 md:flex-col">
        <Link
          href="/painel"
          title="Marcas"
          className={`flex items-center gap-2 rounded-md py-2 text-sm font-medium text-muted transition hover:bg-preto hover:text-white ${
            recolhido ? "md:justify-center md:px-2" : "px-3"
          }`}
        >
          <span>🏷️</span>
          <span className={recolhido ? "md:hidden" : ""}>Marcas</span>
        </Link>
      </nav>

      <form action={sair} className="mt-auto hidden pt-6 md:block">
        <button
          title="Sair"
          className="w-full rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white"
        >
          {recolhido ? "⎋" : "Sair"}
        </button>
      </form>
    </aside>
  );
}
