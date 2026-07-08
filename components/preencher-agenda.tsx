"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { planejarPreenchimento, gerarItemAgenda, type ItemAgenda } from "@/app/actions/agenda";

// PREENCHER AGENDA: botão + faixa de seleção + telinha de progresso. O usuário liga o modo,
// toca nos dias no calendário (a seleção vive no redes-sociais e é pintada pelo calendário),
// e aqui a gente planeja o lote e gera item por item (mesmo padrão do Regerar calendário —
// cada chamada é curta e não estoura o tempo do servidor).

export const MAX_DIAS_SELECAO = 14;

type Fase = "parado" | "planejando" | "gerando" | "resumo";

export function PreencherAgenda({
  marcaId,
  ativo,
  selecionados,
  onAtivar,
  onCancelar,
  onConcluido,
}: {
  marcaId: string;
  ativo: boolean; // modo de seleção ligado (o calendário passa a marcar dias)
  selecionados: string[]; // dias YYYY-MM-DD escolhidos no calendário
  onAtivar: () => void;
  onCancelar: () => void;
  onConcluido: () => void; // limpa a seleção e sai do modo (depois do refresh)
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("parado");
  const [feito, setFeito] = useState(0);
  const [total, setTotal] = useState(0);
  const [rotuloAtual, setRotuloAtual] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const [avisoPlano, setAvisoPlano] = useState<string | null>(null);
  const [erroPlano, setErroPlano] = useState<string | null>(null);
  // RECRIAR: substitui os posts A POSTAR dos dias marcados (o que já foi postado é intocável).
  const [recriar, setRecriar] = useState(false);

  async function gerar() {
    setErroPlano(null);
    // Etapa 1 — a Bia monta o plano editorial do lote (números + fotos + temas casados).
    setFase("planejando");
    let plano: Awaited<ReturnType<typeof planejarPreenchimento>>;
    try {
      plano = await planejarPreenchimento(marcaId, selecionados, recriar);
    } catch {
      plano = { ok: false, erro: "Não consegui planejar agora. Tente de novo." };
    }
    if (!plano.ok) {
      setFase("parado");
      setErroPlano(plano.erro);
      return;
    }
    setAvisoPlano(plano.aviso ?? null);
    setFase("gerando");
    setTotal(plano.itens.length);
    setFeito(0);
    setErros([]);
    const falhas: string[] = [];
    for (const item of plano.itens as ItemAgenda[]) {
      setRotuloAtual(item.rotulo);
      try {
        const r = await gerarItemAgenda(marcaId, item);
        if (!r.ok) falhas.push(`${item.rotulo}: ${r.erro ?? "falhou"}`);
      } catch {
        falhas.push(`${item.rotulo}: falhou`);
      }
      setFeito((f) => f + 1);
    }
    setErros(falhas);
    router.refresh();
    setFase("resumo");
  }

  function fechar() {
    setFase("parado");
    setRecriar(false);
    onConcluido();
  }

  // Botão de entrada (modo desligado).
  if (!ativo && fase === "parado") {
    return (
      <button
        onClick={onAtivar}
        className="rounded-lg border border-[#7c3aed]/50 bg-[#7c3aed]/10 px-4 py-2 text-sm font-semibold text-[#c7b2ff] transition hover:border-[#7c3aed] hover:bg-[#7c3aed]/20"
      >
        ✨ Preencher agenda com a Bia
      </button>
    );
  }

  const pct = total ? Math.round((feito / total) * 100) : 0;

  return (
    <>
      {/* Faixa do modo de seleção: instrução + contagem + gerar/cancelar. */}
      {ativo && fase === "parado" && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-2">
          <span className="text-xs font-semibold text-[#c7b2ff]">
            ✨ Toque nos dias do calendário e a Bia planeja tudo (até {MAX_DIAS_SELECAO} dias): o que mais vende, temas que se completam e fotos que casam com o texto
          </span>
          <label className="flex w-full cursor-pointer items-center gap-2 text-xs font-semibold text-[#c7b2ff]">
            <input
              type="checkbox"
              checked={recriar}
              onChange={(e) => setRecriar(e.target.checked)}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            🔄 Recriar dias que já têm posts — a versão que ainda NÃO foi postada sai e entra uma nova (o que já está no Instagram fica intocado)
          </label>
          <span className="flex items-center gap-2">
            {erroPlano && <span className="text-xs font-semibold text-red-300">{erroPlano}</span>}
            <button
              onClick={gerar}
              disabled={!selecionados.length}
              className="rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-bold text-white transition enabled:hover:bg-[#6d28d9] disabled:opacity-40"
            >
              🚀 Gerar ({selecionados.length} {selecionados.length === 1 ? "dia" : "dias"})
            </button>
            <button
              onClick={() => { setErroPlano(null); setRecriar(false); onCancelar(); }}
              className="rounded-md border border-linha bg-preto px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white"
            >
              Cancelar
            </button>
          </span>
        </div>
      )}

      {/* Telinha de processamento (por cima de tudo, como no Regerar calendário). */}
      {fase !== "parado" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-3xl border border-linha bg-preto-card p-7 text-center">
            {fase === "planejando" ? (
              <>
                <div className="relative mx-auto h-24 w-24">
                  <div aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed]/20" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-3xl shadow-lg shadow-[#7c3aed]/40">🧠</div>
                </div>
                <h2 className="display mt-5 text-xl text-white">A Bia está montando o plano…</h2>
                <p className="mt-2 text-sm text-muted">Cruzando o que mais vende no seu perfil com as suas fotos reais, pra cada arte casar texto e imagem.</p>
              </>
            ) : fase === "gerando" ? (
              <>
                <div className="relative mx-auto h-24 w-24">
                  <div aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed]/20" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-3xl shadow-lg shadow-[#7c3aed]/40">✨</div>
                </div>
                <h2 className="display mt-5 text-xl text-white">Criando o plano da Bia…</h2>
                <p className="mt-2 text-sm text-muted">{rotuloAtual || "Preparando…"}</p>
                <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-preto">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">{feito} de {total} · {pct}%</p>
                <p className="mt-3 text-[11px] text-muted">Não feche esta tela. 🙏</p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-3xl shadow-lg shadow-[#7c3aed]/40">
                  {erros.length ? "⚠️" : "🎉"}
                </div>
                <h2 className="display mt-5 text-xl text-white">
                  {erros.length ? "Terminei, com alguns tropeços" : "Agenda preenchida!"}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  A Bia criou {total - erros.length} de {total} {total === 1 ? "arte" : "artes"} seguindo o plano dela. Já estão no calendário — revise e ajuste o que quiser.
                </p>
                {avisoPlano && <p className="mt-2 text-xs text-amber-300">{avisoPlano}</p>}
                {erros.length > 0 && (
                  <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-left text-[11px] text-red-300">
                    {erros.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={fechar}
                  className="mt-5 w-full rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6d28d9]"
                >
                  Ver no calendário
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
