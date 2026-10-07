// Controle do limite de chamadas da Meta (Graph API).
//
// A Meta limita o APP do Postaí inteiro (todas as marcas somadas) e informa, em cada
// resposta, quanto do limite já foi usado no cabeçalho X-App-Usage (ou X-Business-Use-Case-Usage),
// em porcentagem. Este módulo guarda o maior valor visto na execução atual (ex.: uma passada
// do piloto) para o piloto poder dar prioridade à PUBLICAÇÃO e deixar estatísticas para depois.

let usoMaximo = 0;
const PORCENTAGENS = new Set(["call_count", "total_time", "total_cputime", "acc_id_util_pct"]);

function maiorPorcentagem(valor: unknown): number {
  if (!valor || typeof valor !== "object") return 0;
  let max = 0;
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    // Só os campos que são porcentagem do limite (ignora ex.: estimated_time_to_regain_access, em minutos).
    if (typeof v === "number") {
      if (PORCENTAGENS.has(chave)) max = Math.max(max, v);
    }
    else if (Array.isArray(v)) for (const item of v) max = Math.max(max, maiorPorcentagem(item));
    else if (v && typeof v === "object") max = Math.max(max, maiorPorcentagem(v));
  }
  return max;
}

function registrar(resp: Response) {
  for (const cab of ["x-app-usage", "x-business-use-case-usage", "x-ad-account-usage"]) {
    const bruto = resp.headers.get(cab);
    if (!bruto) continue;
    try {
      usoMaximo = Math.max(usoMaximo, maiorPorcentagem(JSON.parse(bruto)));
    } catch {
      /* cabeçalho inesperado: ignora */
    }
  }
}

/** fetch para a Graph API que anota o uso do limite informado pela Meta. */
export async function fetchMeta(input: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(input, init);
  registrar(resp);
  return resp;
}

/** Uso do limite (0–100) visto nesta execução. */
export function usoDaMeta(): number {
  return usoMaximo;
}

/** Acima de 75% o piloto só publica; estatísticas ficam para outra passada. */
export function metaNoLimite(): boolean {
  return usoMaximo >= 75;
}

/** Zera no início de cada passada do piloto (a mesma instância pode ser reaproveitada). */
export function zerarUsoDaMeta() {
  usoMaximo = 0;
}

/** Erros de limite da Meta (códigos 4, 17, 32, 613 ou a mensagem conhecida). */
export function ehErroDeLimite(mensagem: string, codigo?: number): boolean {
  return [4, 17, 32, 613].includes(codigo ?? -1) || /request limit reached|rate limit|too many calls/i.test(mensagem);
}
