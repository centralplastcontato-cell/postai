import Link from "next/link";
import { sair } from "@/app/actions/admin";
import { APP_NAME } from "@/lib/config";

export function PainelSidebar({ nome }: { nome: string }) {
  return (
    <aside className="flex shrink-0 flex-col border-b border-linha bg-preto-card p-4 md:w-56 md:border-b-0 md:border-r">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/painel" className="display text-xl text-white">
            {APP_NAME}
            <span className="text-vermelho">.</span>
          </Link>
          <p className="hidden text-xs text-muted md:block">{nome}</p>
        </div>
        <form action={sair} className="md:hidden">
          <button className="rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">
            Sair
          </button>
        </form>
      </div>

      <nav className="flex flex-row gap-1 md:flex-col">
        <Link
          href="/painel"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted transition hover:bg-preto hover:text-white"
        >
          🏷️ Marcas
        </Link>
      </nav>

      <form action={sair} className="mt-auto hidden pt-6 md:block">
        <button className="w-full rounded-md border border-linha px-3 py-2 text-sm text-muted transition hover:border-vermelho hover:text-white">
          Sair
        </button>
      </form>
    </aside>
  );
}
