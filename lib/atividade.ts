import { prisma } from "@/lib/prisma";

/** Registra uma ação no feed de atividade do painel. Nunca lança erro. */
export async function registrarAtividade(
  agente: string,
  texto: string,
  marcaId?: string | null
) {
  const t = texto?.trim();
  if (!t) return;
  try {
    await prisma.atividadeAgente.create({
      data: { agente, texto: t.slice(0, 280), marcaId: marcaId ?? null },
    });
  } catch (e) {
    console.error("Erro ao registrar atividade:", e);
  }
}
