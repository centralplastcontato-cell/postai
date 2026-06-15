"use server";

import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { gravarSnapshot } from "@/lib/metricas";

const GRAPH = "https://graph.facebook.com/v21.0";

// Lê os números públicos da conta do Instagram da marca (conta, seguidores, posts) e
// o status do token. Usa só `instagram_basic` (já temos) — sem permissão extra.
// Métricas mais profundas (alcance, etc.) virão depois e exigem instagram_manage_insights.
export async function verificarConexaoMarca(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({
    where: { id: marcaId },
    select: { igUserId: true, accessToken: true, fbPageId: true },
  });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.igUserId || !marca.accessToken) return { ok: true as const, conectada: false };

  try {
    const r = await fetch(
      `${GRAPH}/${marca.igUserId}?fields=username,name,followers_count,media_count&access_token=${marca.accessToken}`,
      { cache: "no-store" }
    );
    const j = (await r.json()) as {
      username?: string;
      name?: string;
      followers_count?: number;
      media_count?: number;
      error?: { message?: string };
    };
    if (j.error?.message) return { ok: true as const, conectada: false, erro: j.error.message };

    // Grava o snapshot do dia (alimenta o gráfico de evolução "desde que usa o Postaí").
    if (typeof j.followers_count === "number") {
      await gravarSnapshot(marcaId, j.followers_count, typeof j.media_count === "number" ? j.media_count : 0);
    }

    // Validade do token (best-effort): debug_token pode falhar sem app token — aí
    // mostramos "ativo". Token de Usuário do Sistema costuma vir expires_at = 0 (não expira).
    let tokenExpira: string | null = null;
    try {
      const d = await fetch(
        `${GRAPH}/debug_token?input_token=${marca.accessToken}&access_token=${marca.accessToken}`,
        { cache: "no-store" }
      );
      const dj = (await d.json()) as { data?: { expires_at?: number; is_valid?: boolean } };
      const exp = dj.data?.expires_at;
      if (exp === 0) tokenExpira = "não expira";
      else if (typeof exp === "number" && exp > 0) tokenExpira = `expira ${new Date(exp * 1000).toLocaleDateString("pt-BR")}`;
    } catch {}

    return {
      ok: true as const,
      conectada: true,
      username: j.username ?? "",
      nome: j.name ?? "",
      seguidores: typeof j.followers_count === "number" ? j.followers_count : null,
      posts: typeof j.media_count === "number" ? j.media_count : null,
      tokenExpira,
      temFacebook: Boolean(marca.fbPageId),
    };
  } catch (e) {
    return { ok: true as const, conectada: false, erro: e instanceof Error ? e.message : "Falha ao falar com a Meta." };
  }
}
