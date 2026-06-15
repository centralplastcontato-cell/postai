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

// Dias restantes de acesso (negativo = venceu há X dias). null = sem data.
export function diasDeAcesso(acessoAte?: Date | string | null): number | null {
  if (!acessoAte) return null;
  const t = acessoAte instanceof Date ? acessoAte.getTime() : new Date(acessoAte).getTime();
  return Math.ceil((t - Date.now()) / 86_400_000);
}
