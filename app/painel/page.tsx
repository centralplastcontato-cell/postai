import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { criarMarca } from "@/app/actions/marcas";
import { marcaConectada } from "@/lib/instagram";
import { sessaoAtual } from "@/lib/auth";
import { filtroMarcaVisivel } from "@/lib/acesso";

export const dynamic = "force-dynamic";

function tempoDesde(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)} dia(s)`;
}

export default async function PainelHome() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  // Admin vê todas as marcas; cliente vê só as dele (filtroMarcaVisivel).
  const marcas = await prisma.marca.findMany({
    where: filtroMarcaVisivel(s),
    orderBy: { criadoEm: "asc" },
    include: {
      _count: { select: { conteudos: true, publicacoes: true } },
      usuario: { select: { nome: true } }, // dono (cliente) — mostrado no card pro admin
    },
  });

  // Batimento do piloto (só admin): se o cron não roda há mais de 90 min, avisa — pode
  // ter travado e os posts agendados não estarem saindo.
  let pilotoParadoMin: number | null = null;
  if (s.admin) {
    const hb = await prisma.heartbeat.findUnique({ where: { id: "cron" } }).catch(() => null);
    if (hb) {
      const min = Math.floor((Date.now() - hb.em.getTime()) / 60000);
      if (min > 90) pilotoParadoMin = min;
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-3xl text-white">{s.admin ? "Marcas" : "Suas marcas"}</h1>
          <p className="mt-1 text-sm text-muted">
            {s.admin
              ? "Cada marca posta no seu próprio Instagram. Crie uma e conecte a conta."
              : "A sua marca posta sozinha no Instagram e Facebook. Abra pra ver e aprovar os posts."}
          </p>
        </div>
        {s.admin && (
          <Link
            href="/painel/usuarios"
            className="flex items-center gap-1.5 rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho"
          >
            👥 Clientes
          </Link>
        )}
      </div>

      {pilotoParadoMin !== null && (
        <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
          ⚠️ <strong>O piloto não roda há {tempoDesde(pilotoParadoMin)}.</strong> O despertador (cron) pode ter travado — os posts agendados podem não estar saindo. Confira o job <span className="font-mono text-xs">postai-piloto</span> no Supabase (pg_cron).
        </div>
      )}

      {/* Nova marca — só admin cria (e depois atribui ao cliente) */}
      {s.admin && (
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
      )}

      {/* Lista */}
      {marcas.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">
          {s.admin
            ? "Nenhuma marca ainda. Crie a primeira acima (ex: Castelo da Diversão)."
            : "Nenhuma marca atribuída a você ainda. Fale com o suporte."}
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      conectada
                        ? "border-green-500/30 bg-green-500/15 text-green-400"
                        : "border-amber-500/30 bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {conectada ? "✓ Instagram conectado" : "⚠ Falta conectar"}
                  </span>
                  {/* Dono da marca (só o admin vê) — pra saber de quem é cada uma de relance */}
                  {s.admin && (
                    <span
                      className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        m.usuario ? "border-[#7c3aed]/40 bg-[#7c3aed]/15 text-[#c7b2ff]" : "border-linha bg-preto text-muted"
                      }`}
                    >
                      👤 {m.usuario ? m.usuario.nome : "sem dono"}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
