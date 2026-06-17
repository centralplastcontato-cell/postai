import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { acessoExpirado, ehTrial, diasDeAcesso } from "@/lib/plano";
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
  // O admin nunca cai aqui. Distingue quem só FEZ O TESTE (sem plano) de quem foi cliente pago.
  if (acessoExpirado(s)) {
    const eraTeste = !s.plano; // nunca pagou (cadastro grátis que venceu) → tom de "teste acabou"
    return (
      <div className="flex min-h-screen flex-col">
        <PainelHeader nome={s.nome} admin={s.admin} />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-linha bg-preto-card p-8 text-center">
            <p className="text-5xl">{eraTeste ? "🎁" : "🚀"}</p>
            <h1 className="display mt-4 text-2xl text-white">{eraTeste ? "Seu teste grátis acabou" : "Falta ativar seu Postaí"}</h1>
            <p className="mt-3 text-sm text-muted">
              {eraTeste
                ? "Curtiu criar as artes? Ative um plano pra o Postaí postar sozinho no seu Instagram — Pix, cartão ou anual com 2 meses grátis."
                : "Escolha um plano e pague com Pix ou cartão — o painel libera na hora."}{" "}
              <span className="text-white/80">Acabou de pagar no Pix?</span> Pode levar uns minutinhos pra confirmar — é só clicar em atualizar.
            </p>
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

  // Cliente em TESTE GRÁTIS (degustação) → painel liberado, mas com uma faixa fixa lembrando
  // que é teste e que postar de verdade pede ativação. Some assim que ele assina (vira pago).
  const trial = ehTrial(s);
  const diasTeste = trial ? Math.max(0, diasDeAcesso(s.acessoAte) ?? 0) : 0;

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
      {trial && (
        <div className="border-b border-[#7c3aed]/40 bg-[#7c3aed]/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-2.5 text-center sm:flex-row sm:text-left">
            <p className="flex-1 text-sm text-white">
              🎁 <strong>Você está no teste grátis</strong> — veja a sua semana e ajuste o que quiser.{" "}
              <span className="text-white/70">Pra o Postaí postar de verdade no seu Instagram, ative seu plano.</span>
              {diasTeste > 0 && <span className="text-white/60"> · faltam {diasTeste} {diasTeste === 1 ? "dia" : "dias"}</span>}
            </p>
            <Link href="/assinar" className="shrink-0 rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
              Ativar meu plano →
            </Link>
          </div>
        </div>
      )}
      <main className="flex-1">{children}</main>
      <ChatBia nome={s.nome} />
    </div>
  );
}
