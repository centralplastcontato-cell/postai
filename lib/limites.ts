import { prisma } from "@/lib/prisma";
import { limiteFeedDia, ehTrial, TRIAL_CREDITOS, TRIAL_SEMANA_GRATIS } from "@/lib/plano";
import type { Sessao } from "@/lib/auth";

// Liga o PACOTE do cliente ao que ele pode GERAR. O limite é sempre do DONO da marca
// (modelo concierge: o admin gera pelos clientes, mas o teto é o do pacote do cliente).

// Plano do dono da marca. null = marca sem dono (admin/Victor) ou dono sem plano
// definido → SEM limite. Assim as marcas do próprio admin nunca são travadas.
export async function planoDaMarca(marcaId: string): Promise<string | null> {
  const m = await prisma.marca
    .findUnique({ where: { id: marcaId }, select: { usuario: { select: { plano: true } } } })
    .catch(() => null);
  return m?.usuario?.plano ?? null;
}

// Janela [00:00, 24:00) do dia (fuso de São Paulo) de uma data.
function diaSP(d: Date): { ini: Date; fim: Date } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const ini = new Date(`${s}T00:00:00-03:00`);
  return { ini, fim: new Date(ini.getTime() + 86_400_000) };
}

// O pacote limita os posts de FEED (carrossel + publicação) por dia. Conta quantos já
// existem naquele dia pra a marca e diz se bateu o teto. (Story NÃO entra — é plus.)
export async function checarLimiteFeed(marcaId: string, data: Date, plano: string): Promise<{ bloqueia: boolean; limite: number; jaTem: number }> {
  const limite = limiteFeedDia(plano);
  const { ini, fim } = diaSP(data);
  const [carr, feed] = await Promise.all([
    prisma.conteudo.count({ where: { marcaId, data: { gte: ini, lt: fim } } }),
    prisma.publicacao.count({ where: { marcaId, formato: "feed", data: { gte: ini, lt: fim } } }),
  ]);
  const jaTem = carr + feed;
  return { bloqueia: jaTem >= limite, limite, jaTem };
}

// CRÉDITOS do TESTE GRÁTIS. A semana automática (TRIAL_SEMANA_GRATIS artes) é de graça; ALÉM
// dela, o cliente tem TRIAL_CREDITOS créditos pra criar novos posts. Sem campo no banco: o gasto
// é (total de artes do dono − semana grátis). Conta carrosséis + publicações de todas as marcas
// do dono. (Regerar um post existente NÃO cria arte nova → por ora não gasta crédito.)
export async function creditosTrial(sessao: Sessao): Promise<{ total: number; usados: number; restantes: number }> {
  const semCusto = { total: TRIAL_CREDITOS, usados: 0, restantes: TRIAL_CREDITOS };
  const marcas = await prisma.marca.findMany({ where: { usuarioId: sessao.id }, select: { id: true } }).catch(() => []);
  const ids = marcas.map((m) => m.id);
  if (!ids.length) return semCusto;
  const [nc, np] = await Promise.all([
    prisma.conteudo.count({ where: { marcaId: { in: ids } } }),
    prisma.publicacao.count({ where: { marcaId: { in: ids } } }),
  ]);
  const usados = Math.min(TRIAL_CREDITOS, Math.max(0, nc + np - TRIAL_SEMANA_GRATIS));
  return { total: TRIAL_CREDITOS, usados, restantes: TRIAL_CREDITOS - usados };
}

// Checado ANTES da IA: barra a criação de NOVO post quando os créditos do teste acabam.
// Admin e cliente pago NÃO são trial → liberado. A semana automática nunca é barrada (cai
// dentro da cota grátis).
export async function checarCreditoTrial(sessao: Sessao): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!ehTrial(sessao)) return { ok: true };
  const c = await creditosTrial(sessao);
  if (c.restantes <= 0) {
    return { ok: false, erro: `🎁 Seus ${c.total} créditos do teste grátis acabaram! Ative seu plano pra criar à vontade e postar de verdade no seu Instagram.` };
  }
  return { ok: true };
}
