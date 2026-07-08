// Variação de TOM de cor pras artes geradas em lote (semana do teste, preencher agenda):
// mantém o MATIZ da marca, muda só a profundidade — assim dois itens seguidos quase nunca
// caem na mesma cor. Módulo normal (não "use server") pra poder exportar funções síncronas.

function hexParaRgb(h: string): [number, number, number] {
  const s = (h || "").replace("#", "");
  if (s.length < 6) return [124, 58, 237];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function rgbParaHex(r: number, g: number, b: number): string {
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

// Mistura a cor com um tom bem escuro (grau 0 = cor original; 1 = quase preto). Mantém o
// MATIZ da marca mas escurece em graus diferentes — variação de tom sem perder a identidade.
export function tomEscuro(hex: string, grau: number): string {
  const [r, g, b] = hexParaRgb(hex);
  return rgbParaHex(r * (1 - grau) + 13 * grau, g * (1 - grau) + 13 * grau, b * (1 - grau) + 18 * grau);
}

// Cor de fundo do item: roda pelas cores da paleta (matiz) e por graus de tom (profundidade),
// de modo que dois itens seguidos quase nunca caiam na mesma cor.
export function corFundoDoItem(paleta: string[], i: number): string {
  const base = paleta[i % paleta.length] || "#7c3aed";
  const graus = [0.12, 0.34, 0.52, 0.24, 0.42];
  return tomEscuro(base, graus[i % graus.length]);
}
