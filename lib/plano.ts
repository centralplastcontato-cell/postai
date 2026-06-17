// Regras de PACOTE / ASSINATURA dos clientes. O admin (você) define o plano + a validade
// do acesso; o sistema usa estas regras pra LIMITAR (posts de feed por dia, Story) e
// BLOQUEAR (acesso vencido). Tudo num lugar só pra ficar fácil de mexer depois.

export type Plano = "essencial" | "profissional" | "turbo";

// Posts de FEED (carrossel + publicação) por dia, por pacote. O Story NÃO entra nessa
// conta — é um "plus" liberado do Profissional pra cima (ver planoTemStory).
export const FEED_POR_DIA: Record<Plano, number> = {
  essencial: 1,
  profissional: 2,
  turbo: 3,
};

export const ROTULO_PLANO: Record<Plano, string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  turbo: "Turbo",
};

// Preço mensal de cada pacote (R$) — usado pra calcular a receita (MRR) no painel admin.
// Mesmos valores da landing; se mudar lá, mudar aqui.
export const PRECO_PLANO: Record<Plano, number> = {
  essencial: 159,
  profissional: 289,
  turbo: 399,
};

export function precoPlano(plano: string | null | undefined): number {
  return ehPlano(plano) ? PRECO_PLANO[plano] : 0;
}

// ── Período de cobrança (mensal × anual) ──────────────────────────────────────────────
// O plano ANUAL é pago de uma vez e dá 12 meses de acesso, com 2 MESES GRÁTIS: o cliente
// paga só 10 mensalidades. (Decisão do dono, 2026-06-16.)
export type Periodo = "mensal" | "anual";
export const MESES_GRATIS_ANUAL = 2;

export function ehPeriodo(v: string | null | undefined): v is Periodo {
  return v === "mensal" || v === "anual";
}

// Quantos meses de acesso o pedido libera (anual = 12, mensal = 1).
export function mesesDoPeriodo(periodo: Periodo): number {
  return periodo === "anual" ? 12 : 1;
}

// Valor a cobrar (R$) por plano + período. Anual = 10 mensalidades (paga 10, leva 12).
export function precoDoPedido(plano: Plano, periodo: Periodo): number {
  return periodo === "anual" ? PRECO_PLANO[plano] * (12 - MESES_GRATIS_ANUAL) : PRECO_PLANO[plano];
}

// Quanto o cliente ECONOMIZA no anual vs pagar 12 meses avulsos (= 2 mensalidades).
export function economiaAnual(plano: Plano): number {
  return PRECO_PLANO[plano] * MESES_GRATIS_ANUAL;
}

export const PLANOS: Plano[] = ["essencial", "profissional", "turbo"];

export function ehPlano(v: string | null | undefined): v is Plano {
  return v === "essencial" || v === "profissional" || v === "turbo";
}

export function rotuloPlano(v: string | null | undefined): string {
  return ehPlano(v) ? ROTULO_PLANO[v] : "—";
}

// Quantos posts de feed/dia o plano permite (sem plano definido = trata como Essencial).
export function limiteFeedDia(plano: string | null | undefined): number {
  return ehPlano(plano) ? FEED_POR_DIA[plano] : FEED_POR_DIA.essencial;
}

// Story é liberado do Profissional pra cima.
export function planoTemStory(plano: string | null | undefined): boolean {
  return plano === "profissional" || plano === "turbo";
}

// O acesso do cliente venceu? Admin nunca vence; sem data definida = sem restrição.
export function acessoExpirado(u: { admin: boolean; acessoAte?: Date | string | null }): boolean {
  if (u.admin) return false;
  if (!u.acessoAte) return false;
  const t = u.acessoAte instanceof Date ? u.acessoAte.getTime() : new Date(u.acessoAte).getTime();
  return t < Date.now();
}

// ── TESTE GRÁTIS (degustação) ──────────────────────────────────────────────────────────
// Quem se cadastra sozinho entra num teste grátis: PODE criar marca, subir fotos e gerar/ver
// as artes à vontade — mas NÃO posta no Instagram de verdade (isso só ativando o plano).
// Representado SEM coluna nova no banco: trial = cliente com acesso no FUTURO mas SEM plano
// definido (todo pagamento preenche o `plano`, então "sem plano + acesso válido" = ainda testando).
export const DIAS_TRIAL = 7;

export function ehTrial(u: { admin: boolean; plano?: string | null; acessoAte?: Date | string | null }): boolean {
  if (u.admin) return false; // admin nunca é trial
  if (u.plano) return false; // já tem pacote → é cliente pago (ou definido pelo admin)
  if (!u.acessoAte) return false; // sem validade = conta aberta (admin criou), não é teste
  const t = u.acessoAte instanceof Date ? u.acessoAte.getTime() : new Date(u.acessoAte).getTime();
  return t >= Date.now(); // acesso ainda no futuro = teste rolando
}

// Mensagem padrão quando o trial tenta POSTAR de verdade (os 3 botões "postar agora").
export const MSG_TRIAL_POSTAR =
  "🎁 No teste grátis você cria e vê as artes à vontade. Pra postar de verdade no seu Instagram, ative seu plano — Pix, cartão ou anual com 2 meses grátis.";

// Dias restantes de acesso (negativo = venceu há X dias). null = sem data.
export function diasDeAcesso(acessoAte?: Date | string | null): number | null {
  if (!acessoAte) return null;
  const t = acessoAte instanceof Date ? acessoAte.getTime() : new Date(acessoAte).getTime();
  return Math.ceil((t - Date.now()) / 86_400_000);
}
