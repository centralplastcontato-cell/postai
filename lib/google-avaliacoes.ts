// AVALIAÇÕES REAIS do Google (Places API "New") pra usar como depoimento nos vídeos. A API devolve
// até 5 avaliações por consulta; a cada busca juntamos as novas às já guardadas (Marca.avaliacoesGoogle),
// então a lista cresce com o tempo. Só guardamos as de 5 estrelas com texto.
// Chave: GOOGLE_PLACES_API_KEY (Google Cloud → APIs → "Places API (New)").
export type AvaliacaoGoogle = { nome: string; texto: string; nota: number; quando: string };
export type AvaliacoesGoogle = { nota: number; total: number; em: string; lista: AvaliacaoGoogle[] };

export function lerAvaliacoes(json: string | null | undefined): AvaliacoesGoogle {
  try {
    const o = JSON.parse(json || "{}");
    return {
      nota: Number(o.nota) || 0,
      total: Number(o.total) || 0,
      em: String(o.em || ""),
      lista: Array.isArray(o.lista) ? o.lista.filter((x: AvaliacaoGoogle) => x && x.texto && x.nome) : [],
    };
  } catch {
    return { nota: 0, total: 0, em: "", lista: [] };
  }
}

// "Thatiana Barbosa Lima" → "Thatiana B." (não expõe o nome completo do cliente no vídeo)
export function nomeCurto(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return p[0] || "Cliente";
  return `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
}

export async function buscarAvaliacoesGoogle(placeId: string): Promise<{ ok: true; nota: number; total: number; lista: AvaliacaoGoogle[] } | { ok: false; erro: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { ok: false, erro: "Falta a chave do Google (GOOGLE_PLACES_API_KEY) no site." };
  if (!placeId) return { ok: false, erro: "Esta marca ainda não tem o endereço do Google cadastrado (Place ID)." };
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      rating?: number; userRatingCount?: number; error?: { message?: string };
      reviews?: { rating?: number; publishTime?: string; text?: { text?: string }; originalText?: { text?: string }; authorAttribution?: { displayName?: string } }[];
    };
    if (!r.ok) return { ok: false, erro: `O Google respondeu: ${j.error?.message || r.status}` };
    const lista = (j.reviews || [])
      .map((x) => ({ nome: x.authorAttribution?.displayName || "", texto: (x.originalText?.text || x.text?.text || "").trim(), nota: x.rating || 0, quando: x.publishTime || "" }))
      .filter((x) => x.nota === 5 && x.texto.length >= 15 && x.nome);
    return { ok: true, nota: j.rating || 0, total: j.userRatingCount || 0, lista };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não consegui falar com o Google." };
  }
}

// junta sem repetir (mesmo autor + começo do texto)
export function juntarAvaliacoes(antigas: AvaliacaoGoogle[], novas: AvaliacaoGoogle[]): AvaliacaoGoogle[] {
  const chave = (a: AvaliacaoGoogle) => `${a.nome}|${a.texto.slice(0, 40)}`;
  const vistos = new Set<string>();
  return [...novas, ...antigas].filter((a) => { const k = chave(a); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 40);
}
