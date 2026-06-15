import { prisma } from "@/lib/prisma";
import { limiteFeedDia } from "@/lib/plano";

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
