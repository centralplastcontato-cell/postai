"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarChaveApi, revogarChaveApi, aprovarPostApi, recusarPostApi } from "@/app/actions/api-externa";
import { ConfirmDialog } from "./confirm-dialog";

export type PendenteApi = {
  id: string;
  tipo: "carrossel" | "publicacao";
  formato: string; // feed | carrossel | story | reels
  data: string; // ISO
  legenda: string;
  hashtags: string;
  midias: string[];
  capa: string | null;
  video: boolean;
  externalId: string | null;
};

const ROTULO: Record<string, string> = { feed: "🖼️ Feed", carrossel: "🎠 Carrossel", story: "🟣 Story", reels: "🎬 Reels" };

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

// Cartão "🔌 Automação externa": chave da API da marca (gerar / revogar) + fila de posts que a
// automação mandou como "aguardando_aprovacao" (aprovar com 1 clique ou recusar).
export function AutomacaoCard({
  marcaId,
  linkBase,
  chave,
  pendentes,
}: {
  marcaId: string;
  linkBase: string;
  chave: { prefixo: string; em: string } | null;
  pendentes: PendenteApi[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [novaChave, setNovaChave] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | { titulo: string; descricao: string; texto: string; acao: () => void }>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const executar = (fn: () => Promise<{ ok: boolean; erro?: string }>, id?: string) => {
    setErro(null);
    if (id) setOcupadoId(id);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro || "Algo deu errado.");
      setOcupadoId(null);
      setConfirmar(null);
      router.refresh();
    });
  };

  const gerar = () =>
    executar(async () => {
      const r = await gerarChaveApi(marcaId);
      if (r.ok) {
        setNovaChave(r.chave);
        setCopiado(false);
      }
      return r;
    });

  const copiar = async () => {
    if (!novaChave) return;
    try {
      await navigator.clipboard.writeText(novaChave);
      setCopiado(true);
    } catch {}
  };

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">🔌 Automação externa (API)</p>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chave ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-linha text-muted"}`}>
          {chave ? "Chave ativa" : "Sem chave"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Deixa uma automação (n8n, Make, Zapier…) criar posts desta marca sozinha. Endereço: <code className="text-white">{linkBase}/api/v1/posts</code> · guia em <code className="text-white">docs/API.md</code>.
      </p>

      {chave && !novaChave && (
        <p className="mt-3 text-sm text-white">
          Chave <code className="rounded bg-preto px-1.5 py-0.5">{chave.prefixo}…</code> <span className="text-muted">criada em {quando(chave.em)}</span>
        </p>
      )}

      {novaChave && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3">
          <p className="text-xs font-semibold text-amber-200">Copie agora — por segurança, esta chave não aparece de novo.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-preto px-2 py-1.5 text-xs text-white">{novaChave}</code>
            <button onClick={copiar} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
              {copiado ? "✓ Copiada" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pendente}
          onClick={() =>
            chave
              ? setConfirmar({ titulo: "Gerar uma chave nova?", descricao: "A chave atual para de funcionar na hora. Você vai precisar colar a nova na automação.", texto: "Gerar nova", acao: gerar })
              : gerar()
          }
          className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {chave ? "↻ Gerar nova chave" : "Gerar chave"}
        </button>
        {chave && (
          <button
            disabled={pendente}
            onClick={() =>
              setConfirmar({
                titulo: "Revogar a chave?",
                descricao: "A automação para de conseguir criar ou consultar posts desta marca. Os posts já agendados continuam.",
                texto: "Revogar",
                acao: () => executar(async () => { const r = await revogarChaveApi(marcaId); if (r.ok) setNovaChave(null); return r; }),
              })
            }
            className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50"
          >
            Revogar
          </button>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

      {pendentes.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-white">
            ⏳ Aguardando sua aprovação <span className="font-normal text-muted">({pendentes.length})</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">Ao aprovar, o post entra na fila do piloto. Se o horário já passou, sai na próxima passada (até ~10 min).</p>
          <ul className="mt-3 space-y-3">
            {pendentes.map((p) => {
              const ocupado = pendente && ocupadoId === p.id;
              return (
                <li key={p.id} className="rounded-lg border border-linha bg-preto p-3">
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {p.video ? (
                      <video src={p.midias[0]} poster={p.capa || undefined} controls preload="metadata" className="h-48 shrink-0 rounded-md bg-black" />
                    ) : (
                      p.midias.map((u, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={u} alt="" className="h-48 shrink-0 rounded-md object-contain" />
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-linha px-2 py-0.5 font-semibold text-white">{ROTULO[p.formato] || p.formato}</span>
                    <span className="text-muted">📅 {quando(p.data)}</span>
                    {p.externalId && <span className="truncate text-muted">id: {p.externalId}</span>}
                  </div>
                  {(p.legenda || p.hashtags) && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-white/90">
                      {p.legenda}
                      {p.hashtags && <span className="text-muted">{p.legenda ? "\n\n" : ""}{p.hashtags}</span>}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={pendente}
                      onClick={() => executar(() => aprovarPostApi(p.id, p.tipo), p.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
                    >
                      {ocupado ? "…" : "✓ Aprovar"}
                    </button>
                    <button
                      disabled={pendente}
                      onClick={() =>
                        setConfirmar({
                          titulo: "Recusar este post?",
                          descricao: "Ele é apagado do Postaí e não será publicado.",
                          texto: "Recusar",
                          acao: () => executar(() => recusarPostApi(p.id, p.tipo), p.id),
                        })
                      }
                      className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50"
                    >
                      ✕ Recusar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        aberto={confirmar !== null}
        titulo={confirmar?.titulo || ""}
        descricao={confirmar?.descricao}
        textoConfirmar={confirmar?.texto}
        onConfirmar={() => confirmar?.acao()}
        onCancelar={() => setConfirmar(null)}
        ocupado={pendente}
      />
    </div>
  );
}
