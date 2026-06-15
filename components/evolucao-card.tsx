"use client";

type Ponto = { dia: string; seguidores: number; posts: number };

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
}

// Gráfico "Evolução com o Postaí": cresce conforme os snapshots diários acumulam.
// Recebe os pontos já ordenados por dia (asc). Some quando ainda não há dado.
export function EvolucaoCard({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length === 0) return null;

  const atual = pontos[pontos.length - 1];
  const primeiro = pontos[0];
  const deltaSeg = atual.seguidores - primeiro.seguidores;
  const deltaPosts = atual.posts - primeiro.posts;
  const desde = dataCurta(primeiro.dia);

  // Ainda magro pra desenhar um gráfico — mostra só o ponto de partida.
  if (pontos.length < 2) {
    return (
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-white">📈 Evolução com o Postaí</p>
        <p className="mt-2 text-sm text-muted">
          Começamos a medir hoje 🌱. Em alguns dias o gráfico de crescimento aparece aqui — agora a conta tem{" "}
          <strong className="text-white">{atual.seguidores.toLocaleString("pt-BR")}</strong> seguidores.
        </p>
      </div>
    );
  }

  // Geometria do gráfico (SVG esticado na largura).
  const W = 600, H = 150, P = 8;
  const valores = pontos.map((p) => p.seguidores);
  const min = Math.min(...valores), max = Math.max(...valores);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (pontos.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.seguidores).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(pontos.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const subiu = deltaSeg >= 0;

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">📈 Evolução com o Postaí</p>
        <span className="text-[11px] text-muted">medindo desde {desde}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Seguidores</p>
          <p className="text-2xl font-bold text-white">{atual.seguidores.toLocaleString("pt-BR")}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Desde o início</p>
          <p className={`text-2xl font-bold ${subiu ? "text-green-400" : "text-red-400"}`}>{subiu ? "+" : ""}{deltaSeg.toLocaleString("pt-BR")}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Novos posts</p>
          <p className="text-2xl font-bold text-white">{deltaPosts >= 0 ? "+" : ""}{deltaPosts.toLocaleString("pt-BR")}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-32 w-full">
        <defs>
          <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#evoFill)" />
        <path d={linha} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pontos.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.seguidores)} r="3" fill="#c4b5fd" />
        ))}
      </svg>
      <p className="mt-1 text-[11px] text-muted">Crescimento dos seguidores enquanto o Postaí publica sozinho. 🚀</p>
      <p className="mt-0.5 text-[11px] text-muted">📌 “Novos posts” conta só o feed permanente — os Stories não entram aqui (o Instagram não os conta como post fixo). Veja quantos Stories saíram no card 🟣 acima.</p>
    </div>
  );
}
