"use client";

import { useEffect, useRef, useState } from "react";
import {
  PLANOS,
  PRECO_PLANO,
  FEED_POR_DIA,
  rotuloPlano,
  planoTemStory,
  precoDoPedido,
  economiaAnual,
  ehPlano,
  type Plano,
  type Periodo,
} from "@/lib/plano";
import { criarConta, processarPagamento } from "@/app/actions/pagamento";

// SDK do Mercado Pago (carregado uma vez, sob demanda).
declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => { bricks: () => { create: (brick: string, containerId: string, settings: unknown) => Promise<{ unmount: () => void }> } };
  }
}

let sdkPromise: Promise<void> | null = null;
function carregarSDK(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  if (window.MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://sdk.mercadopago.com/js/v2";
    sc.onload = () => resolve();
    sc.onerror = () => reject(new Error("falha ao carregar o Mercado Pago"));
    document.body.appendChild(sc);
  });
  return sdkPromise;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const DESTAQUE: Partial<Record<Plano, string>> = { profissional: "⭐ Mais popular", turbo: "🏆 Melhor custo" };

export function PlanosCheckout({
  admin,
  logado,
  planoInicial,
}: {
  admin: boolean;
  logado: boolean;
  planoInicial: string | null;
}) {
  const [etapa, setEtapa] = useState<"selecao" | "pagamento" | "pix" | "sucesso">("selecao");
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [plano, setPlano] = useState<Plano | null>(ehPlano(planoInicial) ? planoInicial : null);
  const [estaLogado, setEstaLogado] = useState(logado);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pix, setPix] = useState<{ qrBase64: string; copiaECola: string; ticketUrl: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const brickRef = useRef<{ unmount: () => void } | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
  const valor = plano ? precoDoPedido(plano, periodo) : 0;

  // Monta o Payment Brick quando entra na etapa de pagamento.
  useEffect(() => {
    if (etapa !== "pagamento" || !plano) return;
    let cancelado = false;
    setErro(null);
    if (!publicKey) {
      setErro("Pagamento ainda em configuração (falta a chave pública do Mercado Pago).");
      return;
    }
    carregarSDK()
      .then(async () => {
        if (cancelado || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const controller = await mp.bricks().create("payment", "paymentBrick_container", {
          initialization: { amount: valor },
          customization: {
            visual: { style: { theme: "dark" } },
            paymentMethods: { creditCard: "all", bankTransfer: ["pix"], maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => {},
            onError: () => setErro("Algo deu errado ao carregar o pagamento. Recarregue a página."),
            onSubmit: (arg: { formData: unknown }) =>
              new Promise<void>((resolve) => {
                processarPagamento({ formData: arg.formData, plano, periodo })
                  .then((r) => {
                    if (!r.ok) {
                      setErro(r.erro);
                      resolve();
                      return;
                    }
                    if (r.status === "approved") {
                      setEtapa("sucesso");
                      setTimeout(() => { window.location.href = "/painel"; }, 2500);
                    } else if (r.pix) {
                      setPix(r.pix);
                      setEtapa("pix");
                    } else {
                      // pendente sem QR (ex: cartão em análise) — informa e segue pro painel.
                      setErro("Pagamento em análise. Assim que aprovar, seu acesso libera sozinho.");
                    }
                    resolve();
                  })
                  .catch(() => { setErro("Não consegui processar agora. Tente de novo."); resolve(); });
              }),
          },
        });
        if (cancelado) controller.unmount();
        else brickRef.current = controller;
      })
      .catch(() => setErro("Não consegui carregar o Mercado Pago. Confira sua conexão e recarregue."));
    return () => {
      cancelado = true;
      try { brickRef.current?.unmount(); } catch {}
      brickRef.current = null;
    };
  }, [etapa, plano, periodo, valor, publicKey]);

  async function continuar() {
    setErro(null);
    if (!plano) { setErro("Escolha um plano pra continuar."); return; }
    if (admin) { setErro("O admin não assina. Entre com uma conta de cliente pra testar."); return; }
    setCarregando(true);
    try {
      if (!estaLogado) {
        const r = await criarConta({ email, senha });
        if (!r.ok) { setErro(r.erro); setCarregando(false); return; }
        setEstaLogado(true);
      }
      setEtapa("pagamento");
    } finally {
      setCarregando(false);
    }
  }

  function copiarPix() {
    if (!pix) return;
    navigator.clipboard.writeText(pix.copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  // ── Sucesso ─────────────────────────────────────────────────────────────────────────
  if (etapa === "sucesso") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-green-600/40 bg-preto-card p-8 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="display mt-4 text-2xl text-white">Pagamento aprovado!</h1>
        <p className="mt-3 text-sm text-muted">Seu acesso já está liberado. Levando você pro painel…</p>
        <a href="/painel" className="mt-6 inline-block rounded-lg bg-vermelho px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover">Ir pro painel agora</a>
      </div>
    );
  }

  // ── Pix (QR) ────────────────────────────────────────────────────────────────────────
  if (etapa === "pix" && pix) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-linha bg-preto-card p-6 text-center">
        <h1 className="display text-2xl text-white">Pague com Pix pra liberar</h1>
        <p className="mt-2 text-sm text-muted">Abra o app do seu banco, escaneie o QR Code ou cole o código. Seu acesso libera sozinho assim que o Pix cair (uns minutinhos).</p>
        {pix.qrBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code do Pix" className="mx-auto mt-5 h-56 w-56 rounded-lg bg-white p-2" />
        )}
        <button type="button" onClick={copiarPix} className="mt-4 w-full rounded-lg border border-linha px-4 py-2.5 text-sm font-semibold text-white transition hover:border-vermelho">
          {copiado ? "✓ Código copiado!" : "📋 Copiar código Pix (copia e cola)"}
        </button>
        <a href="/painel" className="mt-3 inline-block text-xs text-muted underline transition hover:text-white">Já paguei — ir pro painel</a>
      </div>
    );
  }

  // ── Pagamento (Brick embutido) ──────────────────────────────────────────────────────
  if (etapa === "pagamento") {
    return (
      <div className="mx-auto max-w-md">
        <button type="button" onClick={() => { try { brickRef.current?.unmount(); } catch {} brickRef.current = null; setEtapa("selecao"); }} className="mb-3 text-sm text-muted transition hover:text-white">← Trocar plano</button>
        <div className="rounded-2xl border border-linha bg-preto-card p-5">
          <p className="text-sm text-muted">Você está assinando</p>
          <p className="text-lg font-bold text-white">{plano && rotuloPlano(plano)} · {periodo === "anual" ? "Anual" : "Mensal"}</p>
          <p className="mt-1 text-2xl font-bold text-white">R$ {fmt(valor)}<span className="text-sm font-medium text-muted">/{periodo === "anual" ? "ano" : "mês"}</span></p>
          {erro && <p className="mt-3 rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
          <div id="paymentBrick_container" className="mt-4" />
          <p className="mt-4 text-center text-[11px] text-muted">Pagamento processado pelo Mercado Pago · seguro 🔒</p>
        </div>
      </div>
    );
  }

  // ── Seleção (planos + cadastro) ─────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="display text-3xl text-white">Escolha seu plano</h1>
      <p className="mt-1 text-sm text-muted">A Bia posta sozinha no automático. Pague com <strong className="text-white">Pix ou cartão</strong> — o acesso libera na hora, sem sair daqui.</p>

      {admin && (
        <div className="mt-4 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          👤 Você está como <strong>admin</strong> — o checkout é pros clientes. Pra testar, entre com uma conta de cliente.
        </div>
      )}

      {/* Toggle Mensal × Anual */}
      <div className="mb-6 mt-5 inline-flex rounded-xl border border-linha bg-preto-card p-1">
        <button type="button" onClick={() => setPeriodo("mensal")} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${periodo === "mensal" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}>Mensal</button>
        <button type="button" onClick={() => setPeriodo("anual")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${periodo === "anual" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}>
          Anual
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${periodo === "anual" ? "bg-white/20 text-white" : "bg-green-600/20 text-green-300"}`}>2 meses grátis 🎁</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANOS.map((p) => {
          const sel = plano === p;
          const v = precoDoPedido(p, periodo);
          const porMes = periodo === "anual" ? Math.round(v / 12) : v;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlano(p)}
              className={`flex flex-col rounded-2xl border p-5 text-left transition ${sel ? "border-vermelho ring-2 ring-vermelho/40" : "border-linha hover:border-vermelho/50"} bg-preto-card`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">{rotuloPlano(p)}</h2>
                {DESTAQUE[p] && <span className="rounded-full border border-linha px-2 py-0.5 text-[10px] font-bold text-muted">{DESTAQUE[p]}</span>}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-2xl font-bold text-white">R$ {fmt(v)}</span>
                <span className="mb-1 text-xs text-muted">/{periodo === "anual" ? "ano" : "mês"}</span>
              </div>
              {periodo === "anual" ? (
                <p className="mt-1 text-xs text-green-300">≈ R$ {fmt(porMes)}/mês · economize R$ {fmt(economiaAnual(p))}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">cobrança mensal</p>
              )}
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-white/85">
                <li className="flex items-start gap-2"><span className="text-green-400">✓</span> {FEED_POR_DIA[p]} {FEED_POR_DIA[p] === 1 ? "post/dia" : "posts/dia"} (~{FEED_POR_DIA[p] * 30}/mês)</li>
                {planoTemStory(p) && <li className="flex items-start gap-2"><span className="text-green-400">✓</span> Story automático 🟣</li>}
              </ul>
              <span className={`mt-4 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${sel ? "bg-vermelho text-white" : "border border-linha text-white"}`}>{sel ? "✓ Selecionado" : "Escolher"}</span>
            </button>
          );
        })}
      </div>

      {/* Cadastro (só quem não está logado) */}
      {!estaLogado && !admin && (
        <div className="mt-6 rounded-2xl border border-linha bg-preto-card p-5">
          <p className="text-sm font-semibold text-white">Crie sua conta pra assinar</p>
          <p className="mt-1 text-xs text-muted">Seu e-mail vira seu login. Você entra no painel logo após o pagamento.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="input-base" autoComplete="email" />
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Crie uma senha (mín. 6)" className="input-base" autoComplete="new-password" />
          </div>
          <p className="mt-2 text-[11px] text-muted">Já tem conta? <a href="/login" className="text-white underline">Faça login</a> e volte aqui.</p>
        </div>
      )}

      {erro && <p className="mt-4 rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">{erro}</p>}

      <button
        type="button"
        onClick={continuar}
        disabled={carregando || !plano}
        className="mt-6 w-full rounded-xl bg-vermelho px-5 py-3 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50 sm:w-auto"
      >
        {carregando ? "Um instante…" : plano ? `Continuar pro pagamento · R$ ${fmt(valor)}` : "Escolha um plano acima"}
      </button>

      <p className="mt-4 text-xs text-muted">Pagamento seguro pelo Mercado Pago · Pix ou cartão · o cartão não passa pelo Postaí 🔒</p>
    </div>
  );
}
