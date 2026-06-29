import { type AnaliseInsights } from "@/lib/inteligencia";

// Cartão "A Bia descobriu pra você" — a parte VISÍVEL do loop. A Bia conta, em linguagem
// humana, o que mais desperta intenção de fechar festa (categoria × horário) e o que ela vai
// priorizar. Componente só de exibição: recebe a análise já pronta da página (servidor).

// Avatar roxo da Bia (mesmo "B" das Atividades) — dá rosto pra fala dela.
function AvatarBia() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 text-xs font-bold text-white">
      B
    </span>
  );
}

function horaBR(h: number): string {
  return `${h}h`;
}

export function BiaDescobriu({ analise, variante }: { analise: AnaliseInsights; variante?: "instagram" }) {
  const { confianca, total, categorias, melhorHora, melhorPost, prioridade, nicho } = analise;
  const aprendendo = confianca === "aprendendo";
  const ig = variante === "instagram"; // texto adaptado pro contexto "estudei seu Instagram"

  // Topo das categorias reais (até 3) com barrinha proporcional — só faz sentido no modo "boa".
  const top = categorias.slice(0, 3);
  const maxTaxa = top.length ? top[0].taxa : 1;

  return (
    <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/30 to-preto-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <AvatarBia />
        <p className="text-sm font-semibold text-white">
          {ig
            ? aprendendo ? "A Bia começou a estudar seu feed" : "A Bia estudou seu feed"
            : aprendendo ? "A Bia está te conhecendo" : "A Bia descobriu pra você"}
        </p>
      </div>

      {aprendendo ? (
        <div className="mt-3 space-y-2 text-sm text-white/85">
          {total === 0 ? (
            ig ? (
              <p>
                Consegui ver seus posts, mas o Instagram não me liberou os números de <strong className="text-white">alcance e salvamento</strong> —
                que é o que mostra quem quer mesmo fechar festa. Pra eu aprender de verdade, falta liberar a permissão de
                insights na conexão. 🔑
              </p>
            ) : (
              <p>
                Assim que seus posts começarem a engajar, eu te conto qual <strong>tipo</strong> mais desperta
                vontade de fechar festa. Por enquanto, tô de olho. 👀
              </p>
            )
          ) : (
            <p>
              {ig ? "Analisei" : "Já medi"} <strong className="text-white">{total}</strong> {total === 1 ? "post" : "posts"}{" "}
              {ig ? "do seu Instagram" : "seus"} — ainda é pouco pra cravar, mas quanto mais você postar, mais afiada eu fico. 💜
            </p>
          )}

          {melhorPost && melhorPost.salvamentos > 0 && (
            <p className="rounded-lg border border-linha bg-preto/40 px-3 py-2">
              ⭐ Seu campeão até agora é um post de <strong className="text-white">{melhorPost.emoji} {melhorPost.nome}</strong>{" "}
              — 🔖 {melhorPost.salvamentos} {melhorPost.salvamentos === 1 ? "salvamento" : "salvamentos"} (gente guardando pra decidir!).
            </p>
          )}

          <p className="text-white/70">
            📌 Em buffets como o seu, o que mais costuma vender festa é{" "}
            <strong className="text-white">{nicho[0]?.emoji} {nicho[0]?.nome}</strong> e{" "}
            <strong className="text-white">{nicho[1]?.emoji} {nicho[1]?.nome}</strong>. Vou apostar nelas e te mostrar os
            números conforme chegam.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm text-white/85">
          <p>
            <strong className="text-white">{categorias[0].emoji} {categorias[0].nome}</strong> é o que mais desperta
            vontade de fechar festa no seu perfil
            {analise.pctAcimaMedia ? <> — uns <strong className="text-white">{analise.pctAcimaMedia}%</strong> acima da sua média</> : null}.
            {melhorHora !== null && <> 🕐 E seus posts das <strong className="text-white">{horaBR(melhorHora)}</strong> rendem mais.</>}
          </p>

          {/* Ranking visual das categorias que mais convertem intenção */}
          <div className="space-y-1.5">
            {top.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-xs text-white/80">{c.emoji} {c.nome}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-preto">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
                    style={{ width: `${Math.max(8, Math.round((c.taxa / maxTaxa) * 100))}%` }}
                  />
                </span>
              </div>
            ))}
            <p className="text-[11px] text-muted">Conta quem salvou, comentou e curtiu — salvar pesa mais (é quem quer fechar festa).</p>
          </div>

          {melhorPost && melhorPost.salvamentos > 0 && (
            <p className="rounded-lg border border-linha bg-preto/40 px-3 py-2">
              ⭐ Campeão: post de <strong className="text-white">{melhorPost.emoji} {melhorPost.nome}</strong> com 🔖{" "}
              {melhorPost.salvamentos} {melhorPost.salvamentos === 1 ? "salvamento" : "salvamentos"}.
            </p>
          )}
        </div>
      )}

      {prioridade && (
        <p className="mt-3 border-t border-linha pt-3 text-xs text-white/70">
          💜 {aprendendo ? "Por ora, vou priorizar" : "Por isso vou priorizar"}{" "}
          <strong className="text-white">{prioridade.emoji} {prioridade.nome}</strong> e seguir medindo cada post.
        </p>
      )}
    </div>
  );
}
