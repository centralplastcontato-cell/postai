import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { criarMarca } from "@/app/actions/marcas";
import { marcaConectada } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export default async function PainelHome() {
  const marcas = await prisma.marca.findMany({
    orderBy: { criadoEm: "asc" },
    include: { _count: { select: { conteudos: true, publicacoes: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="display text-3xl text-white">Marcas</h1>
      <p className="mt-1 text-sm text-muted">
        Cada marca posta no seu próprio Instagram. Crie uma e conecte a conta.
      </p>

      {/* Nova marca */}
      <form
        action={criarMarca}
        className="mt-6 flex flex-col gap-3 rounded-xl border border-linha bg-preto-card p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-xs text-muted">
          Nome da marca
          <input
            name="nome"
            required
            placeholder="Ex: Castelo da Diversão"
            className="input-base"
          />
        </label>
        <button className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
          + Criar marca
        </button>
      </form>

      {/* Lista */}
      {marcas.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">
          Nenhuma marca ainda. Crie a primeira acima (ex: Castelo da Diversão).
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {marcas.map((m) => {
            const conectada = marcaConectada({
              igUserId: m.igUserId,
              accessToken: m.accessToken,
            });
            return (
              <Link
                key={m.id}
                href={`/painel/marcas/${m.id}`}
                className="flex flex-col rounded-xl border border-linha bg-preto-card p-4 transition hover:border-vermelho"
              >
                <div className="flex items-center gap-3">
                  {m.logoUrl ? (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1"
                      style={{ backgroundColor: m.corFundo || "#0E0E0E" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.logoUrl} alt={m.nome} className="max-h-full max-w-full object-contain" />
                    </span>
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: m.corPrimaria }}
                    >
                      {m.nome.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{m.nome}</p>
                    <p className="text-xs text-muted">
                      {m._count.conteudos} carrossel(éis) · {m._count.publicacoes} feed
                    </p>
                  </div>
                </div>
                <span
                  className={`mt-3 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    conectada
                      ? "border-green-500/30 bg-green-500/15 text-green-400"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-400"
                  }`}
                >
                  {conectada ? "✓ Instagram conectado" : "⚠ Falta conectar"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
