// Momentos guiados do Álbum da Festa — em vez de um "adicionar fotos" solto, o gerente
// sobe as fotos por momento (vira um roteiro/checklist). Cada momento mapeia pra uma
// CATEGORIA do banco (lib/categorias-imagem.ts) — assim a foto entra mais precisa pra IA
// escolher na hora do post. Módulo PURO (sem prisma) pra usar no cliente e no servidor.

export const MOMENTOS_FESTA = [
  { id: "salao", emoji: "🎀", label: "Salão & decoração", dica: "O espaço montado, mesa principal", categoria: "espaco" },
  { id: "brinquedos", emoji: "🎠", label: "Brinquedos & atrações", dica: "Pula-pula, piscina de bolinha, diversão", categoria: "brinquedos" },
  { id: "aniversariante", emoji: "👑", label: "Aniversariante", dica: "O(s) aniversariante(s) da festa", categoria: "festa" },
  { id: "parabens", emoji: "🎉", label: "Parabéns", dica: "O momento do canto, o bolo", categoria: "festa" },
  { id: "momentos", emoji: "📸", label: "Momentos & convidados", dica: "Brincadeiras, família, convidados", categoria: "festa" },
] as const;

export type MomentoId = (typeof MOMENTOS_FESTA)[number]["id"];

// Limites por festa (curadoria + controla custo da visão da IA, que roda 1x por foto).
export const LIMITE_FOTOS_FESTA = 25;
export const LIMITE_FOTOS_MOMENTO = 5;

export function momentoPorId(id: string) {
  return MOMENTOS_FESTA.find((m) => m.id === id) ?? null;
}

// Categoria do banco pra um momento (cai em "festa" se o momento for desconhecido).
export function categoriaDoMomento(id: string): string {
  return momentoPorId(id)?.categoria ?? "festa";
}

// Valida/normaliza um id de momento vindo do cliente; default "momentos".
export function normalizarMomento(id: string | null | undefined): MomentoId {
  return (momentoPorId(id || "")?.id ?? "momentos") as MomentoId;
}
