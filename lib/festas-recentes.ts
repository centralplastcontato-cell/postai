// Memória LOCAL (no aparelho do gerente) das festas que ele começou — pra ele voltar numa
// festa mesmo se fechou a aba e perdeu o link. Fica no localStorage do navegador dele, então
// não quebra o isolamento (cada gerente só "lembra" das DELE, no aparelho dele). O dono
// continua tendo todos os links no painel (recuperação pelo outro lado).

export type FestaRecente = { token: string; label: string; dataISO: string };
const CHAVE = "postai:festas-recentes";

export function lerFestasRecentes(): FestaRecente[] {
  try {
    const arr = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(arr) ? arr.filter((f) => f && typeof f.token === "string" && f.token) : [];
  } catch {
    return [];
  }
}

// Põe a festa no topo (sem duplicar) e guarda as últimas 8.
export function salvarFestaRecente(f: FestaRecente): void {
  try {
    const atuais = lerFestasRecentes().filter((x) => x.token !== f.token);
    localStorage.setItem(CHAVE, JSON.stringify([f, ...atuais].slice(0, 8)));
  } catch {}
}
