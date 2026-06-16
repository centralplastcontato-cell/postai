import Link from "next/link";
import { sessaoAtual } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { PlanosCheckout } from "@/components/planos-checkout";

export const dynamic = "force-dynamic";

// Checkout self-service. Fica FORA do painel de propósito e NÃO exige login: o visitante da
// landing cria a conta aqui mesmo e já paga; o cliente vencido também chega aqui pra renovar
// (o painel bloqueia quem está vencido, mas esta página não).
export default async function AssinarPage({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const s = await sessaoAtual();
  const { plano } = await searchParams;
  const logado = Boolean(s);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-linha bg-preto-card px-4 py-2.5">
        <Link href={logado ? "/painel" : "/"} className="display text-xl text-white">
          {APP_NAME}
          <span className="text-vermelho">.</span>
        </Link>
        {logado ? (
          <Link href="/painel" className="rounded-md border border-linha px-3 py-1.5 text-sm text-muted transition hover:border-vermelho hover:text-white">← Voltar ao painel</Link>
        ) : (
          <Link href="/login" className="rounded-md border border-linha px-3 py-1.5 text-sm text-muted transition hover:border-vermelho hover:text-white">Já sou cliente · entrar</Link>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">
        <PlanosCheckout admin={Boolean(s?.admin)} logado={logado} planoInicial={plano ?? null} />
      </main>
    </div>
  );
}
