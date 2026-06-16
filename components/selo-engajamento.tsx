// Selo de engajamento de um post no Instagram — mostra os números coletados pelo piloto.
// Story: só alcance (= visualizações). Feed/Carrossel: alcance + curtidas + comentários +
// salvamentos. Some sozinho se ainda não há número (ex: acabou de postar ou sem permissão).

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

type Nums = { curtidas?: number | null; comentarios?: number | null; alcance?: number | null; salvamentos?: number | null };

export function SeloEngajamento({ p, ehStory }: { p: Nums; ehStory?: boolean }) {
  const itens: string[] = [];
  if (typeof p.alcance === "number") itens.push(`👁️ ${fmt(p.alcance)}`);
  if (!ehStory) {
    if (typeof p.curtidas === "number") itens.push(`❤️ ${fmt(p.curtidas)}`);
    if (typeof p.comentarios === "number") itens.push(`💬 ${fmt(p.comentarios)}`);
    if (typeof p.salvamentos === "number") itens.push(`🔖 ${fmt(p.salvamentos)}`);
  }
  if (itens.length === 0) return null;

  return (
    <div
      title={ehStory ? "Visualizações no Story" : "Engajamento no Instagram (alcance · curtidas · comentários · salvamentos)"}
      className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md border border-linha bg-preto px-2 py-1 text-[11px] font-semibold text-white/85"
    >
      {itens.map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  );
}
