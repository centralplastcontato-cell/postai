import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { acessoExpirado } from "@/lib/plano";
import { PainelHeader } from "@/components/painel-header";
import { ChatBia } from "@/components/chat-bia";

export const dynamic = "force-dynamic";

const WHATS = "https://wa.me/5515981121710?text=" + encodeURIComponent("Oi! Quero reativar o meu acesso ao Postaí.");

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  // Acesso do cliente vencido → bloqueia o painel inteiro (o piloto também pausa, no cron).
  // O admin nunca cai aqui. Mostra o header (pra deslogar) e um aviso pra reativar.
  if (acessoExpirado(s)) {
    return (
      <div className="flex min-h-screen flex-col">
        <PainelHeader nome={s.nome} admin={s.admin} />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-linha bg-preto-card p-8 text-center">
            <p className="text-5xl">🚀</p>
            <h1 className="display mt-4 text-2xl text-white">Falta ativar seu Postaí</h1>
            <p className="mt-3 text-sm text-muted">Escolha um plano e pague com Pix ou cartão — o painel libera na hora. <span className="text-white/80">Acabou de pagar no Pix?</span> Pode levar uns minutinhos pra confirmar — é só clicar em atualizar.</p>
            <div className="mt-6 space-y-3">
              <Link href="/assinar" className="block w-full rounded-xl bg-vermelho px-6 py-3 text-sm font-semibold text-white transition hover:bg-vermelho-hover">💳 Ver planos e ativar</Link>
              <a href="/painel" className="block w-full rounded-xl border border-linha px-6 py-3 text-sm font-semibold text-white transition hover:border-vermelho">🔄 Já paguei — atualizar</a>
            </div>
            <a href={WHATS} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs text-muted underline transition hover:text-white">ou fale com a gente no WhatsApp</a>
          </div>
        </main>
      </div>
    );
  }

  // Badge de novidades no suporte: pro admin, chamados com mensagem nova do cliente;
  // pro cliente, chamados com resposta nova do suporte. Best-effort (se a tabela ainda
  // não existir, fica 0 e não quebra o painel).
  let chamadosBadge = 0;
  try {
    chamadosBadge = await prisma.chamado.count({
      where: s.admin ? { naoLidoAdmin: true } : { usuarioId: s.id, naoLidoCliente: true },
    });
  } catch {
    /* tabela ainda não criada (db push pendente) — segue com 0 */
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PainelHeader nome={s.nome} admin={s.admin} chamados={chamadosBadge} />
      <main className="flex-1">{children}</main>
      <ChatBia nome={s.nome} />
    </div>
  );
}
