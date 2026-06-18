// Aniversariantes de uma festa — uma festa pode ter mais de um (gêmeos, irmãos, festa
// conjunta). Guardados em Festa.aniversariantes como JSON: [{ nome, idade }] (idade opcional).
// Módulo PURO (sem prisma) pra poder ser importado tanto no servidor quanto no cliente.

export type Aniversariante = { nome: string; idade: number | null };

// Lê o JSON do banco com tolerância: ignora itens sem nome, normaliza idade pra número ou null.
export function parseAniversariantes(json: string | null | undefined): Aniversariante[] {
  try {
    const arr = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((a) => {
        const nome = String(a?.nome ?? "").trim().slice(0, 60);
        const idadeNum = a?.idade == null || a?.idade === "" ? null : Number(a.idade);
        const idade = Number.isFinite(idadeNum) && (idadeNum as number) >= 0 && (idadeNum as number) <= 130 ? Math.round(idadeNum as number) : null;
        return { nome, idade };
      })
      .filter((a) => a.nome);
  } catch {
    return [];
  }
}

// Só os nomes: "Maria", "Maria e João", "Maria, João e Pedro". Usado como label simples.
export function nomesAniversariantes(lista: Aniversariante[]): string {
  const nomes = lista.map((a) => a.nome).filter(Boolean);
  if (nomes.length <= 1) return nomes[0] || "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

// Com idade quando houver: "Maria (5)", "Maria (5) e João (7)". Usado na exibição.
export function rotuloAniversariantes(lista: Aniversariante[]): string {
  const ps = lista.map((a) => (a.idade != null ? `${a.nome} (${a.idade})` : a.nome)).filter(Boolean);
  if (ps.length <= 1) return ps[0] || "";
  return `${ps.slice(0, -1).join(", ")} e ${ps[ps.length - 1]}`;
}
