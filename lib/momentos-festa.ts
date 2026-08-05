// Momentos guiados do Álbum da Festa — em vez de um "adicionar fotos" solto, o gerente
// sobe as fotos por momento (vira um roteiro/checklist). Cada momento mapeia pra uma
// CATEGORIA do banco (lib/categorias-imagem.ts) — assim a foto entra mais precisa pra IA
// escolher na hora do post. Módulo PURO (sem prisma) pra usar no cliente e no servidor.

// A ORDEM aqui é a ORDEM NARRATIVA do vídeo/álbum (chegada → decoração → brincadeiras → tapete
// → aniversariante → parabéns → momentos). O gerente sobe as fotos por momento; o vídeo já monta
// a sequência sugerida nessa ordem. `curto` = rótulo pequeno (selo da foto no vídeo).
export const MOMENTOS_FESTA = [
  { id: "chegada", emoji: "🚪", label: "Chegada & recepção", curto: "🚪 Chegada", dica: "A família e os convidados chegando, a entrada", categoria: "festa" },
  { id: "salao", emoji: "🎀", label: "Salão & decoração", curto: "🎀 Salão", dica: "O espaço montado, a mesa principal, a decoração", categoria: "espaco" },
  { id: "brinquedos", emoji: "🎠", label: "Brinquedos & brincadeiras", curto: "🎠 Brinquedos", dica: "Pula-pula, piscina de bolinha, a criançada brincando", categoria: "brinquedos" },
  { id: "tapete", emoji: "🌟", label: "Tapete vermelho", curto: "🌟 Tapete", dica: "A entrada especial do aniversariante (tapete vermelho)", categoria: "festa" },
  { id: "aniversariante", emoji: "👑", label: "Aniversariante", curto: "👑 Aniversariante", dica: "O(s) aniversariante(s) da festa", categoria: "festa" },
  { id: "parabens", emoji: "🎉", label: "Parabéns & bolo", curto: "🎉 Parabéns", dica: "O momento do canto, o bolo", categoria: "festa" },
  { id: "momentos", emoji: "📸", label: "Momentos & convidados", curto: "📸 Momentos", dica: "Dança, família, convidados, os melhores cliques", categoria: "festa" },
] as const;

export type MomentoId = (typeof MOMENTOS_FESTA)[number]["id"];

// Limites por festa (curadoria + controla custo da visão da IA, que roda 1x por foto).
export const LIMITE_FOTOS_FESTA = 70; // 7 momentos × 10
export const LIMITE_FOTOS_MOMENTO = 10;

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
