"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { gravarSnapshot, backfillMediaIdsDaMarca, rawInsightsDeUmPost } from "@/lib/metricas";

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

    // Validade do token: debug_token dá o expires_at; calculamos QUANTOS DIAS faltam.
    // Útil pros tokens de cliente (long-lived ~60 dias) — dá pra reconectar ANTES de
    // quebrar. System User costuma vir expires_at = 0 (não expira). Sem app token o
    // debug pode falhar → "desconhecido" (mostramos "ativo").
    let token: { estado: "nunca" | "valido" | "expirado" | "desconhecido"; dias: number | null; dataBR: string | null } = {
      estado: "desconhecido",
      dias: null,
      dataBR: null,
    };
    try {
      const d = await fetch(
        `${GRAPH}/debug_token?input_token=${marca.accessToken}&access_token=${marca.accessToken}`,
        { cache: "no-store" }
      );
      const dj = (await d.json()) as { data?: { expires_at?: number; is_valid?: boolean } };
      const exp = dj.data?.expires_at;
      if (exp === 0) {
        token = { estado: "nunca", dias: null, dataBR: null };
      } else if (typeof exp === "number" && exp > 0) {
        const dias = Math.ceil((exp * 1000 - Date.now()) / 86_400_000);
        token = {
          estado: dias <= 0 ? "expirado" : "valido",
          dias,
          dataBR: new Date(exp * 1000).toLocaleDateString("pt-BR"),
        };
      }
    } catch {}

    return {
      ok: true as const,
      conectada: true,
      username: j.username ?? "",
      nome: j.name ?? "",
      seguidores: typeof j.followers_count === "number" ? j.followers_count : null,
      posts: typeof j.media_count === "number" ? j.media_count : null,
      token,
      temFacebook: Boolean(marca.fbPageId),
    };
  } catch (e) {
    return { ok: true as const, conectada: false, erro: e instanceof Error ? e.message : "Falha ao falar com a Meta." };
  }
}

// Resgata o engajamento dos posts ANTIGOS: casa as publicações que já estavam no Instagram
// (por legenda + horário) com os posts do Postaí, guarda o ID e já busca os números.
// Feed/Carrossel só — Story antigo não dá (some em 24h). Disparado por um botão no painel.
export async function backfillEngajamento(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { id: true, igUserId: true, accessToken: true } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  if (!marca.igUserId || !marca.accessToken) return { ok: false as const, erro: "Conecte o Instagram da marca primeiro." };
  try {
    const r = await backfillMediaIdsDaMarca(marca);
    const debug = await rawInsightsDeUmPost(marca); // resposta crua da Meta (diagnóstico)
    revalidatePath(`/painel/marcas/${marcaId}`);
    return { ok: true as const, vinculados: r.vinculados, atualizados: r.atualizados, total: r.total, debug };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao vincular os posts." };
  }
}
