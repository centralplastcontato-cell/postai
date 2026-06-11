import { PrismaClient } from "@prisma/client";

// Singleton do Prisma — evita abrir várias conexões em dev (hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// O Neon (plano grátis) HIBERNA quando fica parado: o 1º acesso depois disso leva
// alguns segundos pra "acordar" o banco. Sem margem, o Prisma desiste cedo e mostra
// "Timed out fetching a connection from the pool" (erro feio pro usuário). Anexando
// timeouts maiores, ele ESPERA o banco acordar em vez de falhar. Não expõe a URL —
// só acrescenta os parâmetros à connection string que já vem do ambiente.
function comTimeout(url?: string): string | undefined {
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connect_timeout=20&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasources: { db: { url: comTimeout(process.env.POSTGRES_PRISMA_URL) } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
