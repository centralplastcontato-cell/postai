"use server";

import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { gerarCarrossel } from "@/app/actions/marketing";
import { gerarPublicacao } from "@/app/actions/feed";
import type { Template } from "@/lib/feed-templates";

// SEMANA DO TESTE GRÁTIS: ao terminar o onboarding, o Postaí já monta 7 dias prontos —
// 3 carrosséis + 4 publicações (1 por dia) + 7 stories (1 por dia) = 14 artes. Usa as FOTOS
// REAIS que o cliente subiu (sem imagem por IA), então fica com a cara do buffet e o custo
// quase zero. O cliente recebe tudo pronto no calendário e só ajusta o que quiser.

type ItemSemana =
  | { tipo: "carrossel"; dia: number; tema: string; estiloCapa: string; rotulo: string }
  | { tipo: "feed"; dia: number; template: Template; tema: string; rotulo: string }
  | { tipo: "story"; dia: number; template: Template; tema: string; rotulo: string };

// 14 itens: 7 publicações (índices 0–6) e depois 7 stories (índices 7–13). Gerar primeiro as
// publicações (o que mais aparece no calendário) e os stories no fim.
const PLANO_SEMANA: ItemSemana[] = [
  { tipo: "carrossel", dia: 1, tema: "Conheça o nosso espaço de festas", estiloCapa: "foto", rotulo: "Carrossel — tour pelo espaço" },
  { tipo: "feed", dia: 2, template: "divulgacao", tema: "Por que as famílias escolhem a gente", rotulo: "Post — por que nos escolher" },
  { tipo: "carrossel", dia: 3, tema: "Dicas pra uma festa infantil inesquecível", estiloCapa: "moldura", rotulo: "Carrossel — dicas de festa" },
  { tipo: "feed", dia: 4, template: "dica", tema: "Uma dica rápida pra organizar a festa", rotulo: "Post — dica pros pais" },
  { tipo: "carrossel", dia: 5, tema: "Tudo o que está incluso na nossa festa", estiloCapa: "mosaico", rotulo: "Carrossel — o que oferecemos" },
  { tipo: "feed", dia: 6, template: "data-comemorativa", tema: "Comemore as datas especiais com a gente", rotulo: "Post — data comemorativa" },
  { tipo: "feed", dia: 7, template: "promocao", tema: "Condição especial pra fechar a sua festa", rotulo: "Post — promoção" },
  { tipo: "story", dia: 1, template: "divulgacao", tema: "Bora marcar a festa dos sonhos!", rotulo: "Story — dia 1" },
  { tipo: "story", dia: 2, template: "dica", tema: "Vem conhecer o nosso espaço", rotulo: "Story — dia 2" },
  { tipo: "story", dia: 3, template: "divulgacao", tema: "Garanta a sua data", rotulo: "Story — dia 3" },
  { tipo: "story", dia: 4, template: "dica", tema: "Momentos que ficam na memória", rotulo: "Story — dia 4" },
  { tipo: "story", dia: 5, template: "divulgacao", tema: "A festa perfeita pro seu pequeno", rotulo: "Story — dia 5" },
  { tipo: "story", dia: 6, template: "dica", tema: "Diversão garantida pra criançada", rotulo: "Story — dia 6" },
  { tipo: "story", dia: 7, template: "divulgacao", tema: "Fale com a gente e agende!", rotulo: "Story — dia 7" },
];

const TOTAL_SEMANA = PLANO_SEMANA.length; // 14 (o cliente conhece esse número pela barra de progresso)

// Data (YYYY-MM-DD em BRT) do dia N a partir de hoje (dia 1 = hoje).
function dataDoDia(dia: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (dia - 1));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Gera UM item da semana (o cliente chama 0..13 em sequência, com barra de progresso — assim
// cada chamada é curta e não estoura o tempo do servidor). Idempotente: trava em TOTAL_SEMANA
// artes pra essa marca, então reclicar/recarregar não duplica nem gera infinito.
export async function gerarItemSemana(marcaId: string, indice: number): Promise<{ ok: boolean; rotulo: string; total: number; erro?: string }> {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false, rotulo: "", total: TOTAL_SEMANA, erro: g.erro };
  if (indice < 0 || indice >= PLANO_SEMANA.length) return { ok: true, rotulo: "", total: TOTAL_SEMANA };
  const item = PLANO_SEMANA[indice];

  const [nc, np] = await Promise.all([
    prisma.conteudo.count({ where: { marcaId } }),
    prisma.publicacao.count({ where: { marcaId } }),
  ]);
  if (nc + np >= TOTAL_SEMANA) return { ok: true, rotulo: item.rotulo, total: TOTAL_SEMANA };

  const data = dataDoDia(item.dia);
  try {
    if (item.tipo === "carrossel") {
      const r = await gerarCarrossel({ marcaId, tema: item.tema, data, estiloCapa: item.estiloCapa });
      return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
    }
    if (item.tipo === "feed") {
      const r = await gerarPublicacao({ marcaId, template: item.template, tema: item.tema, data });
      return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
    }
    // story (foto real, vertical 9:16)
    const r = await gerarPublicacao({ marcaId, template: item.template, tema: item.tema, data, formato: "story", comFoto: true, estiloStory: "foto" });
    return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
  } catch {
    return { ok: false, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: "Falha ao gerar este item." };
  }
}
