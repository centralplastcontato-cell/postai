"use client";

import { useState } from "react";
import {
  PLANOS,
  PRECO_PLANO,
  FEED_POR_DIA,
  rotuloPlano,
  planoTemStory,
  precoDoPedido,
  economiaAnual,
  MESES_GRATIS_ANUAL,
  type Plano,
  type Periodo,
} from "@/lib/plano";
import { criarCheckout } from "@/app/actions/pagamento";

const fmt = (n: number) => n.toLocaleString("pt-BR");

// Selos e diferenciais por plano (o "porquê" de cada degrau da escada).
const DESTAQUE: Partial<Record<Plano, string>> = { profissional: "⭐ Mais popular", turbo: "🏆 Melhor custo por post" };
const EXTRAS: Record<Plano, string[]> = {
  essencial: ["Carrossel + publicação no automático", "Artes no tom da sua marca", "Métricas e a inteligência da Bia"],
  profissional: ["Story incluso 🟣", "Modelos prontos e melhores horários", "Tudo do Essencial"],
  turbo: ["Prioridade no suporte", "Mais alcance com volume", "Tudo do Profissional"],
};

function Banner({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, { cls: string; txt: string }> = {
    sucesso: { cls: "border-green-600/40 bg-green-600/10 text-green-300", txt: "🎉 Pagamento aprovado! Seu acesso já está liberado. Pode voltar ao painel e postar." },
    pendente: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-200", txt: "⏳ Estamos confirmando seu pagamento. No Pix pode levar alguns minutinhos — seu acesso libera sozinho assim que cair." },
    falhou: { cls: "border-red-600/40 bg-red-600/10 text-red-300", txt: "😕 O pagamento não foi concluído. Nada foi cobrado — é só tentar de novo." },
  };
  const m = map[status];
  if (!m) return null;
  return <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${m.cls}`}>{m.txt}</div>;
}

export function PlanosCheckout({
  admin,
  planoAtual,
  diasRestantes,
  status,
}: {
  admin: boolean;
  planoAtual: string | null;
  diasRestantes: number | null;
  status: string | null;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [carregando, setCarregando] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function assinar(plano: Plano) {
    setErro(null);
    setCarregando(plano);
    try {
      const r = await criarCheckout(plano, periodo);
      if (r.ok) {
        window.location.href = r.url; // vai pro checkout do Mercado Pago
      } else {
        setErro(r.erro);
        setCarregando(null);
      }
    } catch {
      setErro("Não consegui abrir o checkout agora. Tente de novo em instantes.");
      setCarregando(null);
    }
  }

  return (
    <div>
      <h1 className="display text-3xl text-white">Escolha seu plano</h1>
      <p className="mt-1 text-sm text-muted">
        A Bia posta sozinha no automático. Pague com <strong className="text-white">Pix ou cartão</strong> — o acesso libera na hora.
      </p>

      <div className="mt-5">
        <Banner status={status} />
      </div>

      {admin && (
        <div className="mb-5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          👤 Você está como <strong>admin</strong> — o checkout é pros clientes. Pra testar de ponta a ponta, entre com uma conta de cliente.
        </div>
      )}

      {!admin && planoAtual && diasRestantes !== null && diasRestantes >= 0 && (
        <div className="mb-5 rounded-lg border border-linha bg-preto-card px-4 py-3 text-sm text-muted">
          Seu plano atual: <strong className="text-white">{rotuloPlano(planoAtual)}</strong> · {diasRestantes} {diasRestantes === 1 ? "dia restante" : "dias restantes"}. Renove ou troque quando quiser — o tempo que sobra é somado.
        </div>
      )}

      {/* Toggle Mensal × Anual */}
      <div className="mb-6 inline-flex rounded-xl border border-linha bg-preto-card p-1">
        <button
          type="button"
          onClick={() => setPeriodo("mensal")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${periodo === "mensal" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => setPeriodo("anual")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${periodo === "anual" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}
        >
          Anual
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${periodo === "anual" ? "bg-white/20 text-white" : "bg-green-600/20 text-green-300"}`}>2 meses grátis 🎁</span>
        </button>
      </div>

      {erro && <p className="mb-4 rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">{erro}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANOS.map((plano) => {
          const ehAtual = planoAtual === plano;
          const valor = precoDoPedido(plano, periodo);
          const porMes = periodo === "anual" ? Math.round(valor / 12) : valor;
          const destaque = plano === "profissional";
          return (
            <div
              key={plano}
              className={`flex flex-col rounded-2xl border p-5 ${destaque ? "border-vermelho bg-gradient-to-br from-vermelho/10 to-preto-card" : "border-linha bg-preto-card"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">{rotuloPlano(plano)}</h2>
                {DESTAQUE[plano] && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${destaque ? "bg-vermelho text-white" : "border border-linha text-muted"}`}>{DESTAQUE[plano]}</span>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-white">R$ {fmt(valor)}</span>
                  <span className="mb-1 text-sm text-muted">/{periodo === "anual" ? "ano" : "mês"}</span>
                </div>
                {periodo === "anual" ? (
                  <p className="mt-1 text-xs text-green-300">12 meses · equivale a R$ {fmt(porMes)}/mês · economize R$ {fmt(economiaAnual(plano))}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">cobrança mensal</p>
                )}
              </div>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/85">
                <li className="flex items-start gap-2"><span className="text-green-400">✓</span> {FEED_POR_DIA[plano]} {FEED_POR_DIA[plano] === 1 ? "post por dia" : "posts por dia"} (~{FEED_POR_DIA[plano] * 30}/mês)</li>
                {planoTemStory(plano) && <li className="flex items-start gap-2"><span className="text-green-400">✓</span> Story automático 🟣</li>}
                {EXTRAS[plano].map((e) => (
                  <li key={e} className="flex items-start gap-2"><span className="text-green-400">✓</span> {e}</li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => assinar(plano)}
                disabled={carregando !== null}
                className={`mt-5 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${destaque ? "bg-vermelho text-white hover:bg-vermelho-hover" : "border border-linha text-white hover:border-vermelho"}`}
              >
                {carregando === plano ? "Abrindo o pagamento…" : ehAtual ? "Renovar este plano" : "Assinar com Pix ou cartão"}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-muted">{PRECO_PLANO[plano] === valor ? "" : `de R$ ${fmt(PRECO_PLANO[plano] * 12)} por ano`}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Pagamento processado pelo Mercado Pago · o cartão não passa pelo Postaí 🔒
      </p>
    </div>
  );
}
