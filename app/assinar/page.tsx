import { redirect } from "next/navigation";
import Link from "next/link";
import { sessaoAtual } from "@/lib/auth";
import { diasDeAcesso } from "@/lib/plano";
import { APP_NAME } from "@/lib/config";
import { PlanosCheckout } from "@/components/planos-checkout";

export const dynamic = "force-dynamic";

// Página de assinatura/checkout. Fica FORA do painel de propósito: o painel bloqueia quem
// está com o acesso vencido, e é justamente o cliente vencido que precisa chegar aqui pra
// renovar. Só exige estar logado.
export default async function AssinarPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  const { status } = await searchParams;
  const dias = s.admin ? null : diasDeAcesso(s.acessoAte ?? null);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-linha bg-preto-card px-4 py-2.5">
        <Link href="/painel" className="display text-xl text-white">
          {APP_NAME}
          <span className="text-vermelho">.</span>
        </Link>
        <Link href="/painel" className="rounded-md border border-linha px-3 py-1.5 text-sm text-muted transition hover:border-vermelho hover:text-white">
          ← Voltar ao painel
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">
        <PlanosCheckout admin={s.admin} planoAtual={s.plano ?? null} diasRestantes={dias} status={status ?? null} />
      </main>
    </div>
  );
}
