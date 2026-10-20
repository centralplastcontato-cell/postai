"use client";

import { useState } from "react";
import { previaRepetidosFacebook, apagarRepetidosFacebook, previaRepetidosInstagram, apagarRepetidosInstagram, type GrupoRepetido } from "@/app/actions/limpeza-facebook";

// 🧹 Limpar posts REPETIDOS do Facebook (só admin). 1) procura: agrupa os posts recentes da Página
// pelo mesmo texto e mostra o que vai ficar (o mais antigo) e quantos vão sair; 2) apaga em lotes.
const dataBR = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function LimpezaFacebook({ marcaId, rede = "facebook" }: { marcaId: string; rede?: "facebook" | "instagram" }) {
  const ehIG = rede === "instagram";
  const previa = ehIG ? previaRepetidosInstagram : previaRepetidosFacebook;
  const apagarLote = ehIG ? apagarRepetidosInstagram : apagarRepetidosFacebook;
  const nomeRede = ehIG ? "Instagram" : "Facebook";
  const [dias, setDias] = useState(7);
  const [buscando, setBuscando] = useState(false);
  const [grupos, setGrupos] = useState<GrupoRepetido[] | null>(null);
  const [info, setInfo] = useState("");
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState<{ feitos: number; total: number; falhas?: number; ultimaFalha?: string; pausa?: number } | null>(null);

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
    setConfirmar(false); setErro(""); setApagando({ feitos: 0, total: ids.length });
    let feitos = 0, falhas = 0, ultimaFalha = "";
    // Instagram: UM por vez com intervalo — se apagar rápido ele trava ("too many actions").
    // Quando trava, a tela espera uns minutos e continua sozinha (desiste depois de várias travas seguidas).
    const LOTE = ehIG ? 1 : 8;
    const INTERVALO_IG = 8_000;
    const ESPERAS_MIN = [5, 10, 20, 30];
    let travasSeguidas = 0;
    for (let i = 0; i < ids.length; ) {
      const pedaco = ids.slice(i, i + LOTE);
      let r = await apagarLote(marcaId, pedaco).catch(() => null);
      if (!r) r = await apagarLote(marcaId, pedaco).catch(() => null); // caiu? tenta o mesmo lote de novo
      if (r && r.ok && "limitado" in r && r.limitado && r.processados === 0) {
        if ("aviso" in r && r.aviso) ultimaFalha = String(r.aviso);
        if (travasSeguidas >= ESPERAS_MIN.length) {
          setApagando(null);
          setErro(`O Instagram travou as exclusões por excesso (proteção dele contra spam). Apaguei ${feitos} até agora. Aviso dele: ${ultimaFalha}. Espere algumas horas (ou até amanhã) e clique em Procurar de novo — ele continua de onde parou.`);
          return;
        }
        const min = ESPERAS_MIN[travasSeguidas++];
        for (let s = min * 60; s > 0; s--) {
          setApagando({ feitos, total: ids.length, falhas, ultimaFalha, pausa: s });
          await new Promise((ok) => setTimeout(ok, 1000));
        }
        continue; // tenta o MESMO post de novo
      }
      travasSeguidas = 0;
      i += LOTE;
      if (!r || !r.ok) { falhas += pedaco.length; ultimaFalha = (r && "erro" in r && r.erro) || "a chamada caiu"; }
      else {
        feitos += r.apagados;
        falhas += Math.max(0, pedaco.length - r.apagados);
        if (r.falhas[0]) ultimaFalha = r.falhas[0];
      }
      setApagando({ feitos, total: ids.length, falhas, ultimaFalha });
      // sem PERMISSÃO pra apagar (erro #10/#200 da Meta): não adianta continuar — para e explica
      if (feitos === 0 && /permission|#10\)|#200\)/i.test(ultimaFalha)) {
        setApagando(null);
        setErro(`A Meta não deixou apagar: falta a permissão de gerenciar conteúdo (${ehIG ? "instagram_manage_contents" : "pages_manage_posts"}) no token desta marca. Nada foi apagado. Erro: ${ultimaFalha}`);
        return;
      }
      if (ehIG && i < ids.length) await new Promise((ok) => setTimeout(ok, INTERVALO_IG));
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
      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      {info && <p className="mt-3 text-sm text-emerald-300">{info}</p>}
      {apagando && (
        <div className="mt-3 text-sm">
          <p className="font-semibold text-amber-300">🧹 Apagando… {apagando.feitos} de {apagando.total}{apagando.falhas ? ` · ${apagando.falhas} com erro` : ""}</p>
          {!!apagando.pausa && <p className="mt-0.5 text-xs text-amber-200">⏸ O Instagram pediu pra ir devagar — continuo sozinho em {Math.floor(apagando.pausa / 60)}:{String(apagando.pausa % 60).padStart(2, "0")}.</p>}
          {ehIG && <p className="mt-0.5 text-xs text-muted">No Instagram vai um por vez, com intervalo (senão ele trava) — pode demorar uns minutos.</p>}
          <p className="mt-0.5 text-xs text-muted">Deixe esta tela aberta e o celular desbloqueado — se trocar de aba, o navegador pausa a limpeza.</p>
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
              <p className="text-sm text-white">Apagar <strong>{grupos.reduce((s, g) => s + g.apagar.length, 0)}</strong> post(s) do {nomeRede}? Os originais (mais antigos) ficam. <strong>Não dá pra desfazer.</strong></p>
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
