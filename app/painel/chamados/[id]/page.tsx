import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { guardaChamado } from "@/lib/acesso";
import { ChamadoAcoes } from "@/components/chamado-acoes";

export const dynamic = "force-dynamic";

function dataBR(d: Date): string {
  const dia = new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hora = new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

export default async function ChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  const g = await guardaChamado(id);
  if (!g.ok) redirect("/painel/chamados");

  // Quem abre a conversa "leu" — apaga a novidade do seu lado (some o badge).
  try {
    await prisma.chamado.update({ where: { id }, data: s.admin ? { naoLidoAdmin: false } : { naoLidoCliente: false } });
  } catch {}

  const chamado = await prisma.chamado.findUnique({
    where: { id },
    include: { usuario: { select: { nome: true } }, mensagens: { orderBy: { criadoEm: "asc" } } },
  });
  if (!chamado) notFound();

  const souAdmin = s.admin;
  const nomeCliente = chamado.usuario.nome;
  const resolvido = chamado.status === "resolvido";

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/painel/chamados" className="text-sm text-muted transition hover:text-white">← Chamados</Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-2xl text-white">{chamado.assunto}</h1>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            resolvido ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-300"
          }`}
        >
          {resolvido ? "✓ Resolvido" : "● Aberto"}
        </span>
      </div>
      {souAdmin && (
        <p className="mt-1 text-xs text-muted">
          Cliente: <strong className="text-white/80">{nomeCliente}</strong>
        </p>
      )}

      <div className="mt-5 space-y-3">
        {chamado.mensagens.map((m) => {
          const meu = m.deAdmin === souAdmin;
          return (
            <div key={m.id} className={`flex flex-col ${meu ? "items-end" : "items-start"}`}>
              <span className="mb-0.5 text-[11px] text-muted">
                {m.deAdmin ? "🎫 Suporte" : nomeCliente} · {dataBR(m.criadoEm)}
              </span>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  meu ? "bg-vermelho text-white" : "border border-linha bg-preto-card text-white/90"
                }`}
              >
                {m.texto}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        {resolvido && !souAdmin && (
          <p className="mb-3 rounded-lg border border-linha bg-preto-card p-3 text-xs text-muted">
            Este chamado foi marcado como resolvido. Se ainda precisar de ajuda, é só escrever de novo que ele reabre. 💜
          </p>
        )}
        <ChamadoAcoes id={chamado.id} status={chamado.status} souAdmin={souAdmin} />
      </div>
    </div>
  );
}
