// Cores de fundo válidas de uma paleta — as escuras o suficiente pra o texto
// branco ficar legível. Client-safe (sem dependências de next/og), espelha a
// lógica de escolherFundoFesta em lib/arte.

export function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function parsePaleta(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) : [];
  } catch {
    return [];
  }
}

// As cores da paleta que servem de fundo (escuras). Se nenhuma for escura, usa todas.
export function coresDeFundo(paleta: string[]): string[] {
  const escuras = paleta.filter((c) => luminancia(c) < 0.62);
  return escuras.length ? escuras : paleta;
}

// Paleta fixa de cores de fundo bonitas e variadas (todas escuras o suficiente pro texto
// branco ficar legível). Sempre disponível no seletor, além das cores da própria marca —
// pra dar variedade quando a marca tem poucas cores na paleta.
export const CORES_EXTRAS = [
  "#DC2626", "#EA580C", "#D97706", "#16A34A", "#059669", "#0D9488",
  "#0891B2", "#2563EB", "#4F46E5", "#7C3AED", "#9333EA", "#C026D3",
  "#DB2777", "#E11D48", "#BE185D", "#334155", "#1F2937", "#0F172A",
];

// Cores do seletor de fundo do feed: as da MARCA primeiro (identidade dela) + a paleta
// extra, sem repetir (comparação case-insensitive).
export function paletaComExtras(paleta: string[]): string[] {
  const daMarca = coresDeFundo(paleta);
  const vistas = new Set(daMarca.map((c) => c.toLowerCase()));
  return [...daMarca, ...CORES_EXTRAS.filter((c) => !vistas.has(c.toLowerCase()))];
}
