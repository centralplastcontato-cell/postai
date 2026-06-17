import { prisma } from "@/lib/prisma";
import { limiteFeedDia, ehTrial, TRIAL_MAX_ARTES, TRIAL_ARTES_POR_DIA } from "@/lib/plano";
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

// Limite do TESTE GRÁTIS (degustação): o cliente cria no máximo TRIAL_ARTES_POR_DIA por dia e
// TRIAL_MAX_ARTES no total. Conta carrosséis + publicações de TODAS as marcas do dono. Admin e
// cliente pago NÃO são trial → liberado. Checado ANTES da IA pra não gastar geração à toa.
export async function checarLimiteTrial(sessao: Sessao): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!ehTrial(sessao)) return { ok: true };
  const marcas = await prisma.marca.findMany({ where: { usuarioId: sessao.id }, select: { id: true } }).catch(() => []);
  const ids = marcas.map((m) => m.id);
  if (!ids.length) return { ok: true };
  const { ini, fim } = diaSP(new Date());
  const [totC, totP, hojeC, hojeP] = await Promise.all([
    prisma.conteudo.count({ where: { marcaId: { in: ids } } }),
    prisma.publicacao.count({ where: { marcaId: { in: ids } } }),
    prisma.conteudo.count({ where: { marcaId: { in: ids }, createdAt: { gte: ini, lt: fim } } }),
    prisma.publicacao.count({ where: { marcaId: { in: ids }, createdAt: { gte: ini, lt: fim } } }),
  ]);
  const total = totC + totP;
  const hoje = hojeC + hojeP;
  if (total >= TRIAL_MAX_ARTES) {
    return { ok: false, erro: `🎁 Você já criou as ${TRIAL_MAX_ARTES} artes do teste grátis! Curtiu? Ative seu plano pra criar à vontade e postar de verdade no seu Instagram.` };
  }
  if (hoje >= TRIAL_ARTES_POR_DIA) {
    return { ok: false, erro: `🎁 No teste grátis dá pra criar ${TRIAL_ARTES_POR_DIA === 1 ? "1 arte por dia" : `${TRIAL_ARTES_POR_DIA} artes por dia`} — você já criou a de hoje. Volte amanhã pra criar mais, ou ative seu plano pra liberar tudo agora.` };
  }
  return { ok: true };
}
