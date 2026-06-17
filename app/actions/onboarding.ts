"use server";

import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { paletaDaMarca } from "@/lib/arte";
import { gerarCarrossel } from "@/app/actions/marketing";
import { gerarPublicacao, definirImagemPublicacao } from "@/app/actions/feed";
import type { Template } from "@/lib/feed-templates";

// SEMANA DO TESTE GRÁTIS: ao terminar o onboarding, o Postaí já monta 7 dias prontos —
// 3 carrosséis + 4 publicações (1 por dia) + 7 stories (1 por dia) = 14 artes. Usa as FOTOS
// REAIS que o cliente subiu (sem imagem por IA), então fica com a cara do buffet e o custo
// quase zero. Pra não ficar repetitivo: cada item tem um TEMA bem distinto (texto varia), um
// TOM de cor diferente (mesma identidade, tons variados) e os stories fazem rodízio de FOTO.

type ItemSemana =
  | { tipo: "carrossel"; dia: number; tema: string; estiloCapa: string; rotulo: string }
  | { tipo: "feed"; dia: number; template: Template; tema: string; rotulo: string }
  | { tipo: "story"; dia: number; template: Template; tema: string; rotulo: string };

// 14 itens: 7 publicações (índices 0–6) e depois 7 stories (índices 7–13). Temas BEM diferentes
// de propósito — assim a IA não escreve sempre "a festa dos sonhos começa aqui".
const PLANO_SEMANA: ItemSemana[] = [
  { tipo: "carrossel", dia: 1, tema: "Tour pelo nosso espaço: salão decorado, brinquedos e área kids", estiloCapa: "foto", rotulo: "Carrossel — tour pelo espaço" },
  { tipo: "feed", dia: 2, template: "divulgacao", tema: "O que faz a nossa festa ser diferente das outras", rotulo: "Post — por que nos escolher" },
  { tipo: "carrossel", dia: 3, tema: "5 dicas pra deixar a festa do seu filho inesquecível", estiloCapa: "moldura", rotulo: "Carrossel — dicas de festa" },
  { tipo: "feed", dia: 4, template: "dica", tema: "Com quanto tempo de antecedência reservar o buffet", rotulo: "Post — dica pros pais" },
  { tipo: "carrossel", dia: 5, tema: "O que está incluso no nosso pacote de festa", estiloCapa: "mosaico", rotulo: "Carrossel — o que oferecemos" },
  { tipo: "feed", dia: 6, template: "data-comemorativa", tema: "Comemore o aniversário do seu filho com a gente", rotulo: "Post — aniversário" },
  { tipo: "feed", dia: 7, template: "promocao", tema: "Condição especial pra quem fechar a festa esta semana", rotulo: "Post — promoção" },
  { tipo: "story", dia: 1, template: "divulgacao", tema: "Bastidores: como deixamos o salão pronto pra cada festa", rotulo: "Story — bastidores" },
  { tipo: "story", dia: 2, template: "dica", tema: "Vem ver a área de brinquedos por dentro", rotulo: "Story — brinquedos" },
  { tipo: "story", dia: 3, template: "divulgacao", tema: "A mesa de doces e o cantinho da comemoração", rotulo: "Story — mesa de doces" },
  { tipo: "story", dia: 4, template: "dica", tema: "Por que as crianças amam festejar aqui", rotulo: "Story — diversão" },
  { tipo: "story", dia: 5, template: "divulgacao", tema: "Agende uma visita e conheça o nosso espaço", rotulo: "Story — visita" },
  { tipo: "story", dia: 6, template: "dica", tema: "Temos pacote pra todo tamanho de festa — fale com a gente", rotulo: "Story — pacotes" },
  { tipo: "story", dia: 7, template: "divulgacao", tema: "Cada detalhe pensado pro grande dia do seu filho", rotulo: "Story — detalhes" },
];

const TOTAL_SEMANA = PLANO_SEMANA.length; // 14 (o cliente conhece esse número pela barra de progresso)

// Data (YYYY-MM-DD em BRT) do dia N a partir de hoje (dia 1 = hoje).
function dataDoDia(dia: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (dia - 1));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// --- Variação de TOM da cor (mantém o matiz da marca, muda só o tom) ---
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
function tomEscuro(hex: string, grau: number): string {
  const [r, g, b] = hexParaRgb(hex);
  return rgbParaHex(r * (1 - grau) + 13 * grau, g * (1 - grau) + 13 * grau, b * (1 - grau) + 18 * grau);
}
// Cor de fundo do item: roda pelas cores da paleta (matiz) e por graus de tom (profundidade),
// de modo que dois itens seguidos quase nunca caiam na mesma cor.
function corFundoDoItem(paleta: string[], i: number): string {
  const base = paleta[i % paleta.length] || "#7c3aed";
  const graus = [0.12, 0.34, 0.52, 0.24, 0.42];
  return tomEscuro(base, graus[i % graus.length]);
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

  // Tom de cor variado por item (mantém a identidade, varia o tom).
  const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { paleta: true, corPrimaria: true } });
  const paleta = paletaDaMarca(marca?.paleta ?? null, marca?.corPrimaria ?? "#7c3aed");
  const corFundo = corFundoDoItem(paleta, indice);

  const data = dataDoDia(item.dia);
  try {
    if (item.tipo === "carrossel") {
      const r = await gerarCarrossel({ marcaId, tema: item.tema, data, estiloCapa: item.estiloCapa, corFundo });
      return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
    }
    if (item.tipo === "feed") {
      const r = await gerarPublicacao({ marcaId, template: item.template, tema: item.tema, data, corFundo });
      return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
    }
    // story (foto real, vertical 9:16)
    const r = await gerarPublicacao({ marcaId, template: item.template, tema: item.tema, data, formato: "story", comFoto: true, estiloStory: "foto", corFundo });
    // Rodízio de FOTO: força fotos diferentes nos 7 stories (senão todos pegam a mesma "melhor
    // foto"). Espalha as fotos do banco em sequência (storyNum = índice − 7).
    if (r.ok && r.id) {
      const fotos = await prisma.imagemMarca.findMany({ where: { marcaId }, orderBy: { criadoEm: "asc" }, select: { url: true } });
      if (fotos.length) {
        const storyNum = indice - 7;
        const url = fotos[((storyNum % fotos.length) + fotos.length) % fotos.length].url;
        await definirImagemPublicacao({ id: r.id, url }).catch(() => {});
      }
    }
    return { ok: r.ok, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: r.ok ? undefined : r.erro };
  } catch {
    return { ok: false, rotulo: item.rotulo, total: TOTAL_SEMANA, erro: "Falha ao gerar este item." };
  }
}
