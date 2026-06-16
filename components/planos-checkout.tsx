"use client";

import { useEffect, useRef, useState } from "react";
import {
  PLANOS,
  PRECO_PLANO,
  FEED_POR_DIA,
  rotuloPlano,
  precoDoPedido,
  economiaAnual,
  ehPlano,
  type Plano,
  type Periodo,
} from "@/lib/plano";
import { criarConta, processarPagamento, pagarComPix } from "@/app/actions/pagamento";

// SDK do Mercado Pago (só pro CARTÃO — tokenização segura. O Pix é gerado direto no backend).
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
const porPost = (p: Plano) => (PRECO_PLANO[p] / (FEED_POR_DIA[p] * 30)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mesma comunicação da landing — pro checkout ter a cara e o discurso da LP.
const INFO: Record<Plano, { posts: string; resumo: string; itens: string[]; destaque?: boolean; melhorCusto?: boolean }> = {
  essencial: {
    posts: "1 post por dia",
    resumo: "Pra estar presente todo dia, sem esforço.",
    itens: ["Carrosséis e Feed gerados por IA", "Instagram + Facebook", "Piloto automático (posta sozinho)", "Legendas e hashtags prontas"],
  },
  profissional: {
    posts: "2 posts por dia",
    destaque: true,
    resumo: "O mais escolhido — presença forte na temporada de festas.",
    itens: ["Tudo do Essencial, e mais:", "🟣 Stories à vontade (não contam no limite)", "Todos os modelos (promoção, depoimento, datas…)", "Vários horários no mesmo dia"],
  },
  turbo: {
    posts: "3 posts por dia",
    melhorCusto: true,
    resumo: "Máximo de alcance pra encher a agenda de festas.",
    itens: ["Tudo do Profissional, e mais:", "Volume máximo: 3 posts por dia", "Prioridade nas datas quentes", "Suporte e relatório de crescimento"],
  },
};

export function PlanosCheckout({
  admin,
  logado,
  planoInicial,
}: {
  admin: boolean;
  logado: boolean;
  planoInicial: string | null;
}) {
  const [etapa, setEtapa] = useState<"selecao" | "conta" | "pagamento" | "pix" | "sucesso">("selecao");
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [plano, setPlano] = useState<Plano | null>(ehPlano(planoInicial) ? planoInicial : null);
  const [estaLogado, setEstaLogado] = useState(logado);
  const [metodo, setMetodo] = useState<"escolha" | "cartao">("escolha");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [pix, setPix] = useState<{ qrBase64: string; copiaECola: string; ticketUrl: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const brickRef = useRef<{ unmount: () => void } | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
  const valor = plano ? precoDoPedido(plano, periodo) : 0;
  const resumoPlano = plano ? `${rotuloPlano(plano)} · ${periodo === "anual" ? "Anual (12 meses)" : "Mensal"}` : "";

  function escolher(p: Plano) {
    setErro(null);
    if (admin) { setErro("O admin não assina. Entre com uma conta de cliente pra testar."); return; }
    setPlano(p);
    setMetodo("escolha");
    setEtapa(estaLogado ? "pagamento" : "conta");
  }

  async function criarContaEContinuar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await criarConta({ email, senha });
      if (!r.ok) { setErro(r.erro); return; }
      setEstaLogado(true);
      setMetodo("escolha");
      setEtapa("pagamento");
    } finally {
      setCarregando(false);
    }
  }

  async function gerarPix() {
    if (!plano) return;
    setErro(null);
    setGerandoPix(true);
    try {
      const r = await pagarComPix(plano, periodo);
      if (!r.ok) { setErro(r.erro); return; }
      setPix(r.pix);
      setEtapa("pix");
    } finally {
      setGerandoPix(false);
    }
  }

  // Formulário de CARTÃO (Card Brick — só cartão, tokenização segura). Montado só quando o
  // cliente escolhe pagar no cartão.
  useEffect(() => {
    if (etapa !== "pagamento" || metodo !== "cartao" || !plano) return;
    let cancelado = false;
    setErro(null);
    if (!publicKey) { setErro("Pagamento por cartão em configuração — use o Pix por enquanto."); return; }
    carregarSDK()
      .then(async () => {
        if (cancelado || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const controller = await mp.bricks().create("cardPayment", "cardBrick_container", {
          initialization: { amount: valor },
          customization: { visual: { style: { theme: "dark", customVariables: { baseColor: "#7c3aed", buttonTextColor: "#ffffff" } } }, paymentMethods: { maxInstallments: 12 } },
          callbacks: {
            onReady: () => {},
            onError: () => setErro("Erro ao carregar o cartão. Tente o Pix ou recarregue."),
            onSubmit: (arg: { formData: unknown }) =>
              new Promise<void>((resolve) => {
                processarPagamento({ formData: arg.formData, plano, periodo })
                  .then((r) => {
                    if (!r.ok) { setErro(r.erro); resolve(); return; }
                    if (r.status === "approved") {
                      setEtapa("sucesso");
                      setTimeout(() => { window.location.href = "/painel"; }, 2500);
                    } else {
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
      .catch(() => setErro("Não consegui carregar o cartão. Use o Pix ou recarregue."));
    return () => {
      cancelado = true;
      try { brickRef.current?.unmount(); } catch {}
      brickRef.current = null;
    };
  }, [etapa, metodo, plano, periodo, valor, publicKey]);

  function copiarPix() {
    if (!pix) return;
    navigator.clipboard.writeText(pix.copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function voltarPraSelecao() {
    try { brickRef.current?.unmount(); } catch {}
    brickRef.current = null;
    setMetodo("escolha");
    setEtapa("selecao");
  }

  // Cabeçalho do resumo do plano (reusado nas telas de conta/pagamento).
  const ResumoTopo = () => (
    <>
      <p className="text-xs uppercase tracking-widest text-vermelho">{etapa === "conta" ? "Plano escolhido" : "Você está assinando"}</p>
      <p className="mt-1 text-lg font-bold text-white">{resumoPlano}</p>
      <p className="mt-1 text-3xl font-bold text-white">R$ {fmt(valor)}<span className="ml-1 text-base font-medium text-muted">/{periodo === "anual" ? "ano" : "mês"}</span></p>
    </>
  );

  // ── Sucesso ─────────────────────────────────────────────────────────────────────────
  if (etapa === "sucesso") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-green-600/40 bg-preto-card p-8 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="display mt-4 text-2xl text-white">Pagamento aprovado!</h1>
        <p className="mt-3 text-sm text-muted">Seu acesso já está liberado. Levando você pro painel…</p>
        <a href="/painel" className="mt-6 inline-block rounded-xl bg-vermelho px-5 py-3 text-sm font-semibold text-white transition hover:bg-vermelho-hover">Ir pro painel agora</a>
      </div>
    );
  }

  // ── Pix (QR gerado na nossa tela) ───────────────────────────────────────────────────
  if (etapa === "pix" && pix) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-linha bg-preto-card p-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-vermelho/15 px-3 py-1 text-xs font-semibold text-vermelho">💠 Pix · {resumoPlano}</span>
          <h1 className="display mt-4 text-2xl text-white">Quase lá! Escaneie pra pagar</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">Abra o app do seu banco, aponte pro QR Code (ou copie o código). <strong className="text-white">Seu acesso libera sozinho</strong> assim que o Pix cair.</p>
          {pix.qrBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code do Pix" className="mx-auto mt-5 h-60 w-60 rounded-xl bg-white p-2.5" />
          )}
          <button type="button" onClick={copiarPix} className="mt-4 w-full rounded-xl bg-vermelho px-4 py-3 text-sm font-bold text-white transition hover:bg-vermelho-hover">
            {copiado ? "✓ Código copiado!" : "📋 Copiar código Pix (copia e cola)"}
          </button>
          <p className="mt-4 text-xs text-muted">Valor: <strong className="text-white">R$ {fmt(valor)}</strong> · pagamento seguro pelo Mercado Pago 🔒</p>
          <a href="/painel" className="mt-3 inline-block text-xs text-muted underline transition hover:text-white">Já paguei — ir pro painel</a>
        </div>
      </div>
    );
  }

  // ── Cadastro (só quem chegou deslogado) ─────────────────────────────────────────────
  if (etapa === "conta") {
    return (
      <div className="mx-auto max-w-md">
        <button type="button" onClick={() => setEtapa("selecao")} className="mb-3 text-sm text-muted transition hover:text-white">← Trocar plano</button>
        <div className="rounded-2xl border border-linha bg-preto-card p-6">
          <ResumoTopo />
          <div className="my-5 h-px bg-linha" />
          <h2 className="display text-xl text-white">Crie sua conta</h2>
          <p className="mt-1 text-xs text-muted">Seu e-mail vira seu login. Você entra no painel logo após o pagamento.</p>
          <div className="mt-4 space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="input-base" autoComplete="email" />
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Crie uma senha (mín. 6 caracteres)" className="input-base" autoComplete="new-password" />
          </div>
          {erro && <p className="mt-3 rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
          <button type="button" onClick={criarContaEContinuar} disabled={carregando} className="mt-4 w-full rounded-xl bg-vermelho px-5 py-3 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {carregando ? "Criando sua conta…" : "Criar conta e ir pagar →"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">Já tem conta? <a href="/login" className="text-white underline">Faça login</a> e volte aqui.</p>
        </div>
      </div>
    );
  }

  // ── Pagamento (escolha do meio: Pix instantâneo ou cartão) ──────────────────────────
  if (etapa === "pagamento") {
    return (
      <div className="mx-auto max-w-md">
        <button type="button" onClick={voltarPraSelecao} className="mb-3 text-sm text-muted transition hover:text-white">← Trocar plano</button>
        <div className="rounded-2xl border border-linha bg-preto-card p-6">
          <ResumoTopo />
          {erro && <p className="mt-4 rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">{erro}</p>}

          {metodo === "escolha" ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-white">Como você quer pagar?</p>

              {/* Pix — gerado na hora, sem fricção */}
              <button
                type="button"
                onClick={gerarPix}
                disabled={gerandoPix}
                className="flex w-full items-center gap-3 rounded-xl border border-vermelho/40 bg-vermelho/10 px-4 py-3.5 text-left transition hover:border-vermelho disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-vermelho/20 text-xl">💠</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-white">Pix</span>
                  <span className="block text-xs text-muted">QR Code na hora · aprovação na hora</span>
                </span>
                <span className="text-sm font-bold text-vermelho">{gerandoPix ? "Gerando…" : "→"}</span>
              </button>

              {/* Cartão — formulário seguro do MP */}
              <button
                type="button"
                onClick={() => { setErro(null); setMetodo("cartao"); }}
                className="flex w-full items-center gap-3 rounded-xl border border-linha bg-preto px-4 py-3.5 text-left transition hover:border-vermelho"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">💳</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-white">Cartão de crédito</span>
                  <span className="block text-xs text-muted">parcele em até 12x{periodo === "anual" ? " (ótimo pro anual)" : ""}</span>
                </span>
                <span className="text-sm font-bold text-muted">→</span>
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <button type="button" onClick={() => { try { brickRef.current?.unmount(); } catch {} brickRef.current = null; setMetodo("escolha"); setErro(null); }} className="text-xs text-muted underline transition hover:text-white">← outras formas de pagar</button>
              <div id="cardBrick_container" className="mt-3" />
            </div>
          )}

          <p className="mt-5 text-center text-[11px] text-muted">Pagamento processado pelo Mercado Pago · seguro 🔒</p>
        </div>
      </div>
    );
  }

  // ── Seleção dos planos (visual da landing) ──────────────────────────────────────────
  return (
    <div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Planos</p>
        <h1 className="display mt-2 text-3xl sm:text-4xl text-white">Escolha o ritmo do seu buffet</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">Tudo no piloto automático, no Instagram e no Facebook. <span className="text-white">Pague com Pix ou cartão — o acesso libera na hora.</span></p>
      </div>

      {admin && (
        <div className="mx-auto mt-5 max-w-xl rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-center text-sm text-sky-200">
          👤 Você está como <strong>admin</strong> — o checkout é pros clientes. Pra testar, entre com uma conta de cliente.
        </div>
      )}

      <div className="mt-7 flex justify-center">
        <div className="inline-flex rounded-full border border-linha bg-preto-card p-1">
          <button type="button" onClick={() => setPeriodo("mensal")} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${periodo === "mensal" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}>Mensal</button>
          <button type="button" onClick={() => setPeriodo("anual")} className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${periodo === "anual" ? "bg-vermelho text-white" : "text-muted hover:text-white"}`}>
            Anual
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${periodo === "anual" ? "bg-white/20 text-white" : "bg-green-600/20 text-green-300"}`}>2 meses grátis 🎁</span>
          </button>
        </div>
      </div>

      {erro && <p className="mx-auto mt-5 max-w-xl rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-center text-sm text-red-300">{erro}</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANOS.map((p) => {
          const info = INFO[p];
          const v = precoDoPedido(p, periodo);
          const porMes = periodo === "anual" ? Math.round(v / 12) : v;
          return (
            <div key={p} className={`relative flex flex-col rounded-2xl border p-7 ${info.destaque ? "border-vermelho bg-preto-card ring-2 ring-[#7c3aed]/40" : "border-linha bg-preto-card"}`}>
              {info.destaque && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Mais popular</span>
              )}
              <h3 className="display text-2xl text-white">{rotuloPlano(p)}</h3>
              <p className="mt-1 text-sm font-semibold text-vermelho">{info.posts}</p>

              <p className="mt-4 text-3xl font-bold text-white">R$ {fmt(v)}<span className="ml-1 text-base font-medium text-muted">/{periodo === "anual" ? "ano" : "mês"}</span></p>
              {periodo === "anual" ? (
                <p className="mt-1 text-xs font-semibold text-green-400">≈ R$ {fmt(porMes)}/mês · economize R$ {fmt(economiaAnual(p))} 🎁</p>
              ) : (
                <p className={`mt-1 text-xs ${info.melhorCusto ? "font-semibold text-green-400" : "text-muted"}`}>≈ R$ {porPost(p)} por post{info.melhorCusto ? " · melhor custo 🏆" : ""}</p>
              )}
              <p className="mt-2 text-sm text-muted">{info.resumo}</p>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-muted">
                {info.itens.map((i) => (
                  <li key={i} className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> {i}</li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => escolher(p)}
                className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-semibold transition ${info.destaque ? "bg-vermelho text-white hover:bg-vermelho-hover" : "border border-linha text-white hover:border-vermelho"}`}
              >
                Assinar agora
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted">Pagamento seguro pelo Mercado Pago · Pix ou cartão · o cartão não passa pelo Postaí 🔒</p>
    </div>
  );
}
