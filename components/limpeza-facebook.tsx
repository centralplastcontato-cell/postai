"use client";

import { useState, useEffect, useCallback } from "react";
import { previaRepetidosFacebook, apagarRepetidosFacebook, previaRepetidosInstagram, iniciarLimpezaInstagram, estadoLimpezaInstagram, fecharLimpezaInstagram, type GrupoRepetido } from "@/app/actions/limpeza-facebook";
import type { FilaLimpezaIG } from "@/lib/limpeza-ig";

// 🧹 Limpar posts REPETIDOS do Facebook (só admin). 1) procura: agrupa os posts recentes da Página
// pelo mesmo texto e mostra o que vai ficar (o mais antigo) e quantos vão sair; 2) apaga em lotes.
const dataBR = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function LimpezaFacebook({ marcaId, rede = "facebook" }: { marcaId: string; rede?: "facebook" | "instagram" }) {
  const ehIG = rede === "instagram";
  const previa = ehIG ? previaRepetidosInstagram : previaRepetidosFacebook;
  const nomeRede = ehIG ? "Instagram" : "Facebook";
  const [dias, setDias] = useState(7);
  const [buscando, setBuscando] = useState(false);
  const [grupos, setGrupos] = useState<GrupoRepetido[] | null>(null);
  const [info, setInfo] = useState("");
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState<{ feitos: number; total: number; falhas?: number; ultimaFalha?: string } | null>(null);
  // Instagram: a limpeza vai pra uma FILA que o piloto apaga aos poucos — a tela só acompanha
  const [fila, setFila] = useState<FilaLimpezaIG | null>(null);
  const carregarFila = useCallback(async () => {
    if (!ehIG) return;
    const r = await estadoLimpezaInstagram(marcaId).catch(() => null);
    if (r && r.ok) setFila(r.fila);
  }, [ehIG, marcaId]);
  useEffect(() => { carregarFila(); }, [carregarFila]);
  const filaAtiva = !!fila && fila.ids.length > 0;
  useEffect(() => {
    if (!filaAtiva) return;
    const t = setInterval(carregarFila, 60_000); // atualiza o andamento sozinho
    return () => clearInterval(t);
  }, [filaAtiva, carregarFila]);
  async function fecharFila(cancelar: boolean) {
    if (cancelar && !confirm("Parar a limpeza? O que já foi apagado continua apagado; o resto fica no perfil.")) return;
    await fecharLimpezaInstagram(marcaId).catch(() => null);
    setFila(null);
  }

  async function procurar() {
    setErro(""); setInfo(""); setGrupos(null); setConfirmar(false); setBuscando(true);
    const r = await previa(marcaId, dias).catch(() => null);
    setBuscando(false);
    if (!r || !r.ok) { setErro((r && "erro" in r && r.erro) || "Não consegui procurar agora."); return; }
    setGrupos(r.grupos);
    setInfo(r.totalApagar ? `Olhei ${r.analisados} posts. Achei ${r.totalApagar} repetido(s) em ${r.grupos.length} assunto(s) — fica sempre o MAIS ANTIGO de cada.` : `Olhei ${r.analisados} posts dos últimos ${dias} dias e não achei nenhum repetido. 🎉`);
  }

  async function apagar() {
    if (!grupos) return;
    const ids = grupos.flatMap((g) => g.apagar.map((p) => p.id));
    setConfirmar(false); setErro("");
    if (ehIG) {
      // Instagram: não apaga daqui — manda pra fila do piloto (ele apaga devagar, sem travar)
      setApagando({ feitos: 0, total: ids.length });
      const r = await iniciarLimpezaInstagram(marcaId, ids).catch(() => null);
      setApagando(null);
      if (!r || !r.ok) { setErro((r && "erro" in r && r.erro) || "Não consegui começar a limpeza agora. Tente de novo."); return; }
      setGrupos(null); setInfo(""); setFila(r.fila);
      return;
    }
    setApagando({ feitos: 0, total: ids.length });
    let feitos = 0, falhas = 0, ultimaFalha = "";
    const LOTE = 8;
    for (let i = 0; i < ids.length; i += LOTE) {
      const pedaco = ids.slice(i, i + LOTE);
      let r = await apagarRepetidosFacebook(marcaId, pedaco).catch(() => null);
      if (!r) r = await apagarRepetidosFacebook(marcaId, pedaco).catch(() => null); // caiu? tenta o mesmo lote de novo
      if (!r || !r.ok) { falhas += pedaco.length; ultimaFalha = (r && "erro" in r && r.erro) || "a chamada caiu"; }
      else {
        feitos += r.apagados;
        falhas += r.processados - r.apagados;
        if (r.falhas[0]) ultimaFalha = r.falhas[0];
      }
      setApagando({ feitos, total: ids.length, falhas, ultimaFalha });
      // sem PERMISSÃO pra apagar (erro #10/#200 da Meta): não adianta continuar — para e explica
      if (feitos === 0 && /permission|#10\)|#200\)/i.test(ultimaFalha)) {
        setApagando(null);
        setErro(`A Meta não deixou apagar: falta a permissão de gerenciar conteúdo (pages_manage_posts) no token desta marca. Nada foi apagado. Erro: ${ultimaFalha}`);
        return;
      }
    }
    setApagando(null);
    setGrupos(null);
    setInfo(`🧹 Apaguei ${feitos} post(s) repetido(s) do ${nomeRede}.${falhas ? ` ${falhas} não consegui apagar (${ultimaFalha}) — clique em procurar de novo pra tentar.` : ""}`);
  }

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-white">🧹 Limpar posts repetidos do {nomeRede}</p>
      <p className="mt-1 text-xs text-muted">Procura {ehIG ? "no perfil" : "na Página"} posts com o <strong className="text-white/80">mesmo texto</strong> e apaga as cópias — fica sempre o <strong className="text-white/80">mais antigo</strong> de cada. Nada é apagado antes de você conferir a lista.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} disabled={buscando || !!apagando} className="input-base w-auto text-sm">
          <option value={3}>últimos 3 dias</option>
          <option value={7}>últimos 7 dias</option>
          <option value={14}>últimos 14 dias</option>
          <option value={30}>últimos 30 dias</option>
        </select>
        <button type="button" onClick={procurar} disabled={buscando || !!apagando} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-50">{buscando ? "Procurando…" : "🔎 Procurar repetidos"}</button>
      </div>
      {fila && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${filaAtiva ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
          {filaAtiva ? (
            <>
              <p className="font-semibold text-amber-300">🧹 Limpeza em andamento — apaguei {fila.feitos}, faltam {fila.ids.length}{fila.falhas ? ` · ${fila.falhas} não deu` : ""}</p>
              <p className="mt-1 text-xs text-muted">O piloto apaga uns posts a cada 10 minutos, devagar pra o Instagram não travar. <strong className="text-white/80">Pode fechar esta tela</strong> — continua sozinho.</p>
              {fila.proxima && new Date(fila.proxima).getTime() > Date.now() && (
                <p className="mt-1 text-xs text-amber-200">⏸ O Instagram pediu pra ir devagar — próxima tentativa por volta das {new Date(fila.proxima).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}.{fila.aviso ? ` (aviso dele: ${fila.aviso})` : ""}</p>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={carregarFila} className="rounded-lg border border-linha px-3 py-1.5 text-xs text-white hover:border-white/30">↻ Atualizar</button>
                <button type="button" onClick={() => fecharFila(true)} className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40">Parar limpeza</button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-emerald-300">{fila.fim?.startsWith("Parei") ? "⚠️" : "✅"} {fila.fim || `Limpeza terminada: apaguei ${fila.feitos} post(s).`}</p>
              <button type="button" onClick={() => fecharFila(false)} className="rounded-lg border border-linha px-3 py-1.5 text-xs text-muted hover:text-white">OK</button>
            </div>
          )}
        </div>
      )}
      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      {info && <p className="mt-3 text-sm text-emerald-300">{info}</p>}
      {apagando && (
        <div className="mt-3 text-sm">
          <p className="font-semibold text-amber-300">{ehIG ? "🧹 Preparando a limpeza…" : <>🧹 Apagando… {apagando.feitos} de {apagando.total}{apagando.falhas ? ` · ${apagando.falhas} com erro` : ""}</>}</p>
          {!ehIG && <p className="mt-0.5 text-xs text-muted">Deixe esta tela aberta e o celular desbloqueado — se trocar de aba, o navegador pausa a limpeza.</p>}
          {apagando.ultimaFalha && <p className="mt-0.5 text-xs text-red-400">Último erro: {apagando.ultimaFalha}</p>}
        </div>
      )}

      {grupos && grupos.length > 0 && !apagando && (
        <>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {grupos.map((g) => (
              <div key={g.manter.id} className="flex items-start gap-2.5 rounded-lg border border-linha bg-preto p-2.5">
                {g.manter.imagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.manter.imagem} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 text-xs">
                  <p className="line-clamp-2 text-white">“{g.mensagem}”</p>
                  <p className="mt-0.5 text-muted">Fica o de {dataBR(g.manter.criadoEm)} · <strong className="text-red-300">apaga {g.apagar.length}</strong> cópia(s)</p>
                </div>
              </div>
            ))}
          </div>
          {!confirmar ? (
            <button type="button" onClick={() => setConfirmar(true)} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">Apagar {grupos.reduce((s, g) => s + g.apagar.length, 0)} repetido(s)</button>
          ) : (
            <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
              <p className="text-sm text-white">Apagar <strong>{grupos.reduce((s, g) => s + g.apagar.length, 0)}</strong> post(s) do {nomeRede}? Os originais (mais antigos) ficam. <strong>Não dá pra desfazer.</strong>{ehIG && " No Instagram o piloto apaga aos poucos (pode levar algumas horas) — não precisa ficar com a tela aberta."}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg border border-linha px-3 py-1.5 text-sm text-muted hover:text-white">Cancelar</button>
                <button type="button" onClick={apagar} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">Sim, apagar</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
