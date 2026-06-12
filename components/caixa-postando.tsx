// Overlay de "Estamos postando…" — cobre a arte do card enquanto a postagem está
// em andamento (a publicação na Meta leva alguns segundos). Dá feedback claro de que
// o Postaí está trabalhando, e mostra em quais redes está publicando.
export function CaixaPostando({ redes }: { redes: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-lg bg-black/75 px-3 text-center backdrop-blur-sm">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
      <p className="text-sm font-bold text-white">📤 Estamos postando…</p>
      <p className="text-xs text-white/75">{redes}</p>
    </div>
  );
}
