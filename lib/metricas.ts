import { prisma } from "@/lib/prisma";

const GRAPH = "https://graph.facebook.com/v21.0";

// Dia atual (00:00 BRT) como Date — chave do snapshot diário.
function diaHojeBRT(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s}T00:00:00-03:00`);
}

// Grava (upsert) o snapshot de HOJE pra marca — 1 linha por dia. Atualiza se já existe
// (pega o valor mais recente do dia). NÃO é server action: só código do servidor chama.
export async function gravarSnapshot(marcaId: string, seguidores: number, posts: number): Promise<void> {
  const dia = diaHojeBRT();
  await prisma.metricaMarca
    .upsert({
      where: { marcaId_dia: { marcaId, dia } },
      update: { seguidores, posts },
      create: { marcaId, dia, seguidores, posts },
    })
    .catch(() => {});
}

// Busca seguidores/posts da conta na Meta (instagram_basic — sem permissão extra) e
// grava o snapshot do dia. Usado pelo piloto (cron). Best-effort: erro vira null.
export async function snapshotDeMarca(marca: { id: string; igUserId: string; accessToken: string }): Promise<void> {
  if (!marca.igUserId || !marca.accessToken) return;
  try {
    const r = await fetch(`${GRAPH}/${marca.igUserId}?fields=followers_count,media_count&access_token=${marca.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { followers_count?: number; media_count?: number; error?: unknown };
    if (typeof j.followers_count === "number") {
      await gravarSnapshot(marca.id, j.followers_count, typeof j.media_count === "number" ? j.media_count : 0);
    }
  } catch {
    /* ignora — snapshot é best-effort */
  }
}
