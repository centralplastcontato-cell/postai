// Carimbo de versão (?v=) das artes renderizadas (/api/feed, /api/story). As rotas de
// render têm cache IMUTÁVEL (max-age de 1 ano), então a URL PRECISA mudar quando o conteúdo
// muda — senão o CDN/Instagram serve a arte antiga (bug do "Dia das Crianças" que continuava
// saindo no post mesmo depois de regerar). O MESMO token é usado nas miniaturas do painel
// E na hora de POSTAR (feed/story, manual e piloto) — assim nunca sai uma versão velha.

export function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Inclui data (o selo da data comemorativa depende dela) e o extra (cor/formato/selo).
export function tokenArte(p: { titulo: string; texto?: string | null; imagemUrl?: string | null; extra?: string | null; data?: string | Date | null }): string {
  const d = p.data ? (typeof p.data === "string" ? p.data : new Date(p.data).toISOString()) : "";
  return hashCurto(`a7|${p.titulo}|${p.texto ?? ""}|${p.imagemUrl ?? ""}|${p.extra ?? ""}|${d}`);
}
