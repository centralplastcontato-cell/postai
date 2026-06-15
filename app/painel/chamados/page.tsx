import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { AbrirChamado } from "@/components/abrir-chamado";

export const dynamic = "force-dynamic";

function dataBR(d: Date): string {
  const dia = new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hora = new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

function buscar(admin: boolean, usuarioId: string) {
  return prisma.chamado.findMany({
    where: admin ? {} : { usuarioId },
    orderBy: [{ status: "asc" }, { atualizadoEm: "desc" }], // "aberto" antes de "resolvido"
    include: { usuario: { select: { nome: true } }, _count: { select: { mensagens: true } } },
    take: 100,
  });
}

export default async function ChamadosPage() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  let chamados: Awaited<ReturnType<typeof buscar>> = [];
  let indisponivel = false;
  try {
    chamados = await buscar(s.admin, s.id);
  } catch {
    indisponivel = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-3xl text-white">🎫 {s.admin ? "Chamados de suporte" : "Suporte"}</h1>
          <p className="mt-1 text-sm text-muted">
            {s.admin
              ? "Tudo que os clientes abriram. Abertos primeiro — abra pra responder."
              : "Precisa de ajuda? Abra um chamado que a gente responde por aqui. A Bia também tira dúvidas rápidas no 💬."}
          </p>
        </div>
        {!s.admin && <AbrirChamado />}
      </div>

      {indisponivel ? (
        <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center text-sm text-amber-100">
          O suporte por chamados está sendo preparado. Por enquanto, fale com a gente pelo 💬 (chat da Bia) ou no WhatsApp.
        </p>
      ) : chamados.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">
          {s.admin ? "Nenhum chamado por enquanto. 🎉" : "Você ainda não abriu nenhum chamado. Qualquer dúvida, é só abrir um. 😊"}
        </p>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {chamados.map((c) => {
            const novidade = s.admin ? c.naoLidoAdmin : c.naoLidoCliente;
            const resolvido = c.status === "resolvido";
            return (
              <li key={c.id}>
                <Link
                  href={`/painel/chamados/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-linha bg-preto-card p-4 transition hover:border-vermelho"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-white">{c.assunto}</p>
                      {novidade && <span className="rounded-full bg-vermelho px-1.5 py-0.5 text-[10px] font-bold text-white">novo</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.admin && <>👤 {c.usuario.nome} · </>}
                      {c._count.mensagens} {c._count.mensagens === 1 ? "mensagem" : "mensagens"} · {dataBR(c.atualizadoEm)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      resolvido ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {resolvido ? "✓ Resolvido" : "● Aberto"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
