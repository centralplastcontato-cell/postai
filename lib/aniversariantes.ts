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

// Título da CAPA do vídeo da festa. Mostra TODOS os nomes (gêmeos/irmãos aparecem juntos, não
// só o primeiro) e afirma a idade só quando dá: "Luisa e Maria Sofia fizeram 11 aninhos" (idades
// iguais) ou "Enrico fez 4 aninhos" (um só). Idades diferentes/ausentes → "Festa de <nomes>"
// (não dá pra dizer "fez X"). A rota /api/capa-festa desenha isso quebrando linha, então nome
// comprido não estoura mais a tela. labelFallback = Festa.aniversariante (label já pronto).
export function tituloCapaFesta(lista: Aniversariante[], labelFallback?: string): string {
  const nomes = nomesAniversariantes(lista) || (labelFallback || "").trim();
  const idades = lista.map((a) => a.idade).filter((n): n is number => n != null);
  const mesmaIdade = lista.length > 0 && idades.length === lista.length && new Set(idades).size === 1;
  if (mesmaIdade) {
    // CONCORDÂNCIA: mais de um aniversariante → "fizeram". Cobre também o caso do dono digitar os
    // dois nomes num campo só ("Maria Luisa e Maria Sofia") — o " e " denuncia que é plural.
    const plural = lista.length > 1 || / e /i.test(nomes);
    const verbo = plural ? "fizeram" : "fez";
    const unidade = idades[0] === 1 ? "aninho" : "aninhos";
    return `${nomes} ${verbo} ${idades[0]} ${unidade}`;
  }
  return nomes ? `Festa de ${nomes}` : "Festa";
}
