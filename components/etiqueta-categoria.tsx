import { emojiCategoria, nomeCategoria } from "@/lib/categorias";

// Etiqueta de CATEGORIA DE INTENÇÃO de um post (🏰 Mostrar o espaço, ⭐ Depoimentos…).
// É a mesma classificação que alimenta a inteligência da Bia — mostrar aqui deixa o sistema
// legível ("a Bia sabe o que cada post é"). Some sozinha se o post ainda não tem categoria.
export function EtiquetaCategoria({ categoria }: { categoria?: string | null }) {
  if (!categoria) return null;
  return (
    <span
      title="O que esse post é — a Bia usa isso pra descobrir o que mais vende festa"
      className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200"
    >
      {emojiCategoria(categoria)} {nomeCategoria(categoria)}
    </span>
  );
}
