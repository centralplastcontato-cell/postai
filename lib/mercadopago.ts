// Integração com o Mercado Pago (Checkout Pro — hospedado). A gente cria uma "preferência"
// (o pedido) e manda o cliente pra tela do MP, que cuida de Pix + cartão. O cartão NUNCA
// passa pelo nosso servidor (segurança/PCI por conta do MP). Quando o pagamento é aprovado,
// o MP chama nosso webhook (notification_url) e a gente libera o acesso.
//
// Server-only — usa a chave secreta MP_ACCESS_TOKEN (nunca exposta ao navegador).

const API = "https://api.mercadopago.com";

function token(): string | null {
  return process.env.MP_ACCESS_TOKEN || null;
}

export function pagamentoConfigurado(): boolean {
  return Boolean(token());
}

// Cria a preferência e devolve a URL do checkout hospedado (init_point) pra redirecionar.
export async function criarPreferencia(opts: {
  titulo: string;
  valor: number;
  externalReference: string; // "<usuarioId>:<plano>:<periodo>" — chave pro webhook liberar
  base: string; // baseUrl() — pras back_urls e o webhook
  payerEmail?: string;
}): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const t = token();
  if (!t) return { ok: false, erro: "Pagamento ainda não configurado (falta a chave do Mercado Pago)." };
  try {
    const resp = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: opts.titulo, quantity: 1, unit_price: opts.valor, currency_id: "BRL" }],
        external_reference: opts.externalReference,
        back_urls: {
          success: `${opts.base}/assinar?status=sucesso`,
          pending: `${opts.base}/assinar?status=pendente`,
          failure: `${opts.base}/assinar?status=falhou`,
        },
        auto_return: "approved",
        notification_url: `${opts.base}/api/pagamento/webhook`,
        statement_descriptor: "POSTAI",
        ...(opts.payerEmail ? { payer: { email: opts.payerEmail } } : {}),
      }),
    });
    const j = (await resp.json()) as { init_point?: string; sandbox_init_point?: string; message?: string };
    if (!resp.ok) return { ok: false, erro: j?.message || "Não consegui abrir o checkout agora." };
    const url = j.init_point || j.sandbox_init_point;
    if (!url) return { ok: false, erro: "O checkout veio sem URL de pagamento." };
    return { ok: true, url };
  } catch {
    return { ok: false, erro: "Falha ao falar com o Mercado Pago. Tente de novo em instantes." };
  }
}

// Busca um pagamento pelo id (fonte AUTORITATIVA — o webhook só confia nisto, nunca no que
// chega no corpo da notificação). Devolve status + a external_reference que setamos.
export async function buscarPagamento(id: string): Promise<{ status: string; externalReference: string; valor: number | null } | null> {
  const t = token();
  if (!t) return null;
  try {
    const resp = await fetch(`${API}/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { status?: string; external_reference?: string; transaction_amount?: number };
    return {
      status: j.status || "",
      externalReference: j.external_reference || "",
      valor: typeof j.transaction_amount === "number" ? j.transaction_amount : null,
    };
  } catch {
    return null;
  }
}
