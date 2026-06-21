// Monta os dados do "Álbum pros pais" a partir de uma festa + suas fotos. Centraliza a lógica
// que o protótipo (/album-demo) e a rota pública real (/festa/[token]) usam — pra não duplicar.
// Módulo de servidor (só monta objeto; quem renderiza é o componente client AlbumFesta).

import { type AlbumData, type AlbumMomento } from "@/components/album-festa";
import { parseAniversariantes, nomesAniversariantes } from "@/lib/aniversariantes";
import { normalizarMomento } from "@/lib/momentos-festa";
import { temaVisual } from "@/lib/temas-festa";

// Apresentação carinhosa de cada momento (os ids internos viram títulos pros pais).
const APRES: Record<string, { emoji: string; titulo: string; sub: string }> = {
  salao: { emoji: "🎀", titulo: "Chegada & decoração", sub: "O espaço montado com todo carinho" },
  brinquedos: { emoji: "🎠", titulo: "Brinquedos & diversão", sub: "A criançada aproveitando cada cantinho" },
  aniversariante: { emoji: "👑", titulo: "O aniversariante", sub: "A estrela do dia" },
  parabens: { emoji: "🎂", titulo: "Hora dos parabéns", sub: "O momento mais esperado" },
  momentos: { emoji: "📸", titulo: "Momentos especiais", sub: "Aqueles cliques que ficam pra sempre" },
};
const ORDEM = ["salao", "brinquedos", "aniversariante", "parabens", "momentos"];

export type FestaParaAlbum = {
  data: Date;
  aniversariantes: string;
  tema: string;
  horario: string;
  marca: { nome: string; logoUrl: string; corPrimaria: string; telefone: string; site: string };
};
export type FotoParaAlbum = { url: string; momento: string; descricao: string };

export function montarDadosAlbum(
  festa: FestaParaAlbum,
  fotos: FotoParaAlbum[],
  extras: {
    preview: boolean;
    googleReviewUrl?: string | null;
    instagram?: string | null;
    campanha?: AlbumData["campanha"];
  },
): AlbumData {
  // Agrupa as fotos por momento, na ordem natural da festa.
  const grupos: Record<string, { url: string; desc: string }[]> = {};
  for (const f of fotos) {
    const m = normalizarMomento(f.momento);
    (grupos[m] ||= []).push({ url: f.url, desc: f.descricao });
  }
  const momentos: AlbumMomento[] = ORDEM.filter((id) => grupos[id]?.length).map((id) => ({
    ...APRES[id],
    fotos: grupos[id],
  }));

  const anivs = parseAniversariantes(festa.aniversariantes);
  const nomes = nomesAniversariantes(anivs) || "Aniversariante";
  const idade = anivs[0]?.idade ?? null;
  const primeiroNome = anivs[0]?.nome || nomes;
  // Título sem emoji — o ícone do tema é colado no componente.
  const titulo = anivs.length === 1 && idade != null ? `${nomes} fez ${idade}!` : `Festa de ${nomes}`;

  // Data por extenso com dia da semana, primeira letra maiúscula ("Sábado, 20 de junho de 2026").
  const dl = festa.data.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
  });
  const dataLabel = dl.charAt(0).toUpperCase() + dl.slice(1);

  const visual = temaVisual(festa.tema, festa.marca.corPrimaria || undefined);
  // Foto de capa do hero: prioriza um momento marcante (parabéns → aniversariante → 1ª foto).
  const capaUrl = grupos["parabens"]?.[0]?.url ?? grupos["aniversariante"]?.[0]?.url ?? fotos[0]?.url ?? null;
  const mensagem = `Foi uma alegria receber ${primeiroNome} e toda a família aqui! Guardamos cada momento com muito carinho. Voltem sempre! 💜`;

  return {
    marca: {
      nome: festa.marca.nome,
      logoUrl: festa.marca.logoUrl || null,
      telefone: festa.marca.telefone || null,
      site: festa.marca.site || null,
      instagram: extras.instagram ?? null,
    },
    visual,
    titulo,
    tema: festa.tema,
    idade,
    dataLabel,
    horario: festa.horario || "",
    capaUrl,
    mensagem,
    momentos,
    googleReviewUrl: extras.googleReviewUrl ?? null,
    campanha: extras.campanha ?? null,
    preview: extras.preview,
  };
}
