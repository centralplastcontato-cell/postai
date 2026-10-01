"use client";

// Editor do VÍDEO ANÚNCIO (colagem): 4 passos em sequência — oferta → roteiro da Bia → voz → montar.
// Cada passo destrava o próximo. O motor monta em segundo plano; aqui a tela acompanha até o vídeo
// ficar pronto e mostra pra assistir.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VOZES, ESTILOS, VOZ_PADRAO, DIRECAO_PADRAO } from "@/lib/vozes";
import type { Oferta, Roteiro } from "@/lib/colagem";
import { type Qualidade, dadosVideoColagem, salvarOfertaColagem, gerarRoteiroColagem, gerarVozColagem, montarVideoColagem, ajustarTamanhoRoteiro } from "@/app/actions/colagem";
import { statusVideoTematico } from "@/app/actions/videos-tematicos";

const NOME_ATO: Record<string, { emoji: string; nome: string; cor: string }> = {
  gancho: { emoji: "🪝", nome: "Gancho", cor: "#f59e0b" },
  dor: { emoji: "😩", nome: "Dor", cor: "#ef4444" },
  virada: { emoji: "✨", nome: "Virada", cor: "#a855f7" },
  prova: { emoji: "📸", nome: "Prova", cor: "#3b82f6" },
  oferta: { emoji: "🎁", nome: "Oferta + CTA", cor: "#22c55e" },
};
const ROTULO_ADESIVO: Record<string, string> = {
  estrela_amarela: "⭐", uau: "💥", coracao: "❤️", confete: "🎊", baloes: "🎈", seta_desenhada: "➡️", carinha_preocupada: "😟",
  balao_fala: "💬", etiqueta_amarela: "🏷️", etiqueta_rosa: "🏷️", etiqueta_azul: "🏷️", etiqueta_verde: "🏷️", recibo: "🧾", nota: "📝",
  selo_promo: "🔴", botao_whatsapp: "🟢",
};

export function ColagemEditor({ videoId, onFechar }: { videoId: string; onFechar: () => void }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [oferta, setOferta] = useState<Oferta>({ principal: "", extras: [], prazo: "", condicoes: true });
  const [extrasTxt, setExtrasTxt] = useState(["", "", ""]);
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [voz, setVoz] = useState(VOZ_PADRAO);
  const [estilo, setEstilo] = useState(DIRECAO_PADRAO);
  const [audio, setAudio] = useState<{ url: string; segundos: number } | null>(null);
  const [temTempos, setTemTempos] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [qualidade, setQualidade] = useState<Qualidade | null>(null);
  const [ocupado, setOcupado] = useState<"" | "roteiro" | "voz" | "montar">("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; txt: string } | null>(null);

  async function recarregar() {
    const d = await dadosVideoColagem(videoId).catch(() => null);
    setCarregando(false);
    if (!d || !d.ok) { setMsg({ tipo: "erro", txt: (d && "erro" in d && d.erro) || "Não consegui abrir esse vídeo." }); return; }
    setTitulo(d.titulo);
    setOferta(d.oferta);
    setExtrasTxt([0, 1, 2].map((i) => d.oferta.extras[i] || ""));
    setRoteiro(d.roteiro);
    setFotos(d.fotos);
    setVoz(d.narracao.voz || VOZ_PADRAO);
    setEstilo(d.narracao.estilo || DIRECAO_PADRAO);
    setAudio(d.narracao.url.startsWith("http") ? { url: d.narracao.url, segundos: d.narracao.segundos } : null);
    setTemTempos(d.temTempos);
    setVideoUrl(d.videoUrl);
    setQualidade(d.qualidade);
  }
  useEffect(() => { recarregar(); }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acompanha a montagem no motor (callback grava no banco; aqui só pergunta de tempos em tempos).
  useEffect(() => {
    if (videoUrl !== "gerando") return;
    const t = setInterval(async () => {
      const r = await statusVideoTematico(videoId).catch(() => null);
      if (r?.ok && r.videoUrl !== "gerando") {
        setVideoUrl(r.videoUrl);
        const d = await dadosVideoColagem(videoId).catch(() => null);
        if (d?.ok) setQualidade(d.qualidade);
        setMsg(r.videoUrl.startsWith("http") ? { tipo: "ok", txt: "🎬 Vídeo pronto! Assista abaixo." } : { tipo: "erro", txt: "O motor não conseguiu montar o vídeo. Tente de novo." });
        router.refresh();
      }
    }, 6000);
    return () => clearInterval(t);
  }, [videoUrl, videoId, router]);

  const ofertaAtual = (): Oferta => ({ ...oferta, extras: extrasTxt.map((x) => x.trim()).filter(Boolean) });

  async function escreverRoteiro() {
    setMsg(null);
    setOcupado("roteiro");
    const s = await salvarOfertaColagem(videoId, ofertaAtual()).catch(() => null);
    if (!s || !s.ok) { setOcupado(""); setMsg({ tipo: "erro", txt: (s && "erro" in s && s.erro) || "Não consegui salvar a oferta." }); return; }
    // Até 3 tentativas: se a conferência reprovar, a Bia recebe os problemas e corrige.
    let correcao: { rascunho: string; erros: string[] } | undefined;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (tentativa > 1) setMsg({ tipo: "aviso", txt: `🔁 A conferência pediu ajustes — a Bia está corrigindo (tentativa ${tentativa} de 3)…` });
      const r = await gerarRoteiroColagem(videoId, correcao, tentativa === 3).catch(() => null);
      if (r?.ok) {
        setOcupado("");
        setRoteiro(r.roteiro);
        setAudio(null);
        setTemTempos(false);
        const d = await dadosVideoColagem(videoId).catch(() => null);
        if (d?.ok) setFotos(d.fotos);
        setMsg({ tipo: "ok", txt: `✓ Roteiro pronto (${r.palavras} palavras) e aprovado na conferência${tentativa > 1 ? ` — a Bia corrigiu ${tentativa - 1}×` : ""}. Agora gere a voz.` });
        return;
      }
      if (r && "reprovado" in r && r.reprovado) { correcao = { rascunho: r.rascunho, erros: r.erros }; continue; }
      setOcupado("");
      setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "A Bia não conseguiu agora." });
      return;
    }
    setOcupado("");
    setMsg({ tipo: "erro", txt: `A Bia não conseguiu fechar um roteiro que passasse na conferência. Problemas: ${correcao?.erros.slice(0, 3).join(" ")} — tente de novo.` });
  }

  async function gerarVoz() {
    setMsg(null);
    setOcupado("voz");
    // A voz tem que dar 30–35s: se sair fora, a Bia ajusta o tamanho das falas e a voz é refeita
    // (no máximo 3 rodadas — depois disso vai do jeito que ficou, com aviso).
    let r = await gerarVozColagem(videoId, voz, estilo).catch(() => null);
    for (let rodada = 1; rodada <= 3 && r?.ok && r.foraDoTempo; rodada++) {
      setMsg({ tipo: "aviso", txt: `⏱️ A fala ficou com ${r.segundos}s (o ideal é 30–35s) — a Bia está ${r.foraDoTempo === "longo" ? "encurtando" : "alongando"} o texto (rodada ${rodada} de 3)…` });
      const aj = await ajustarTamanhoRoteiro(videoId, r.segundosExatos).catch(() => null);
      if (!aj?.ok) break;
      setRoteiro(aj.roteiro);
      r = await gerarVozColagem(videoId, voz, estilo).catch(() => null);
    }
    setOcupado("");
    if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui gerar a voz." }); return; }
    setAudio({ url: r.url, segundos: r.segundos });
    setTemTempos(true);
    const d = await dadosVideoColagem(videoId).catch(() => null);
    if (d?.ok && d.roteiro) setRoteiro(d.roteiro);
    setMsg({ tipo: r.foraDoTempo ? "aviso" : "ok", txt: `🔊 Voz pronta (${r.segundos}s)${r.foraDoTempo ? " — ainda fora dos 30–35s, mas pode montar assim" : ""}${r.sincronizado ? " — figurinhas sincronizadas com cada palavra." : " — não consegui marcar cada palavra; as figurinhas vão entrar no tempo estimado."}` });
  }

  async function montar() {
    setMsg(null);
    setOcupado("montar");
    const r = await montarVideoColagem(videoId).catch(() => null);
    setOcupado("");
    if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui mandar pro motor." }); return; }
    setVideoUrl("gerando");
    setMsg({ tipo: "ok", txt: "⏳ Montando o vídeo no motor… leva uns 2 a 3 minutos. Pode deixar essa tela aberta." });
  }

  const passoOferta = oferta.principal.trim().length >= 3;
  const nPalavras = roteiro ? roteiro.cenas.reduce((s, c) => s + c.narracao.trim().split(/\s+/).filter(Boolean).length, 0) : 0;
  const nFotos = roteiro ? new Set(roteiro.cenas.flatMap((c) => c.elementos.filter((e) => e.tipo === "foto").map((e) => e.asset))).size : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/85 p-0 sm:items-center sm:p-4" onClick={() => !ocupado && onFechar()}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-preto-card sm:rounded-2xl sm:border sm:border-linha">
        <div className="flex items-center justify-between gap-2 border-b border-linha px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">🎬 Vídeo anúncio (colagem) — {titulo}</p>
            <p className="text-[11px] text-muted">Mural animado com fotos, figurinhas e o mascote apresentando a sua oferta.</p>
          </div>
          <button type="button" onClick={onFechar} disabled={!!ocupado} className="rounded-full border border-linha px-3 py-1 text-sm text-muted hover:text-white disabled:opacity-40">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {carregando ? <p className="text-sm text-muted">Carregando…</p> : (<>
          {/* 1. OFERTA */}
          <section className="rounded-xl border border-linha bg-preto/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">1 · 🎁 A oferta <span className="font-normal normal-case text-muted">(obrigatória — aparece falada e escrita)</span></p>
            <label className="mt-2 block text-[11px] font-semibold text-muted">Benefício principal *</label>
            <input value={oferta.principal} onChange={(e) => setOferta({ ...oferta, principal: e.target.value })} maxLength={70} placeholder="Ex: +10 amiguinhos grátis" className="input-base mt-1 w-full text-sm" />
            <label className="mt-2 block text-[11px] font-semibold text-muted">Extras (opcional)</label>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
              {extrasTxt.map((x, i) => (
                <input key={i} value={x} onChange={(e) => setExtrasTxt((l) => l.map((y, k) => (k === i ? e.target.value : y)))} maxLength={40} placeholder={i === 0 ? "Ex: 10x no boleto" : "Outro extra"} className="input-base w-full text-sm" />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted">Prazo (até)</label>
                <input type="date" value={oferta.prazo} onChange={(e) => setOferta({ ...oferta, prazo: e.target.value })} className="input-base mt-1 text-sm" />
              </div>
              <label className="flex items-center gap-2 pb-2 text-[12px] text-white">
                <input type="checkbox" checked={oferta.condicoes} onChange={(e) => setOferta({ ...oferta, condicoes: e.target.checked })} />
                Tem condições (mostra &quot;Consulte condições&quot;)
              </label>
            </div>
          </section>

          {/* 2. ROTEIRO */}
          <section className="rounded-xl border border-linha bg-preto/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">2 · ✍️ Roteiro da Bia</p>
              <button type="button" onClick={escreverRoteiro} disabled={!passoOferta || !!ocupado || videoUrl === "gerando"} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40">
                {ocupado === "roteiro" ? "✍️ escrevendo e conferindo… (até 1 min)" : roteiro ? "🔄 Pedir outro roteiro" : "✨ Bia monta o roteiro"}
              </button>
            </div>
            {!passoOferta && <p className="mt-2 text-[11px] text-amber-300/90">Preencha o benefício principal da oferta pra liberar.</p>}
            {roteiro && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-muted">{nPalavras} palavras · {nFotos} fotos · {roteiro.cenas.length} cenas</p>
                {roteiro.cenas.map((c, i) => {
                  const a = NOME_ATO[c.ato] || { emoji: "•", nome: c.ato, cor: "#888" };
                  return (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: a.cor }}>{a.emoji} {a.nome}</span>
                      <p className="mt-1.5 text-[12px] leading-snug text-white">“{c.narracao}”</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {c.elementos.map((e, k) => e.tipo === "foto" && fotos[e.asset || ""] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={k} src={fotos[e.asset || ""]} alt="" className="h-10 w-10 rounded object-cover ring-2 ring-white" title={`foto — entra em "${e.gatilho}"`} />
                        ) : (
                          <span key={k} className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] text-white/80" title={`entra em "${e.gatilho}"`}>
                            {e.tipo === "mascote" ? `🏰 ${e.pose}${e.balao ? `: “${e.balao}”` : ""}` : e.tipo === "grupo" ? `👧🧒 ×${e.quantidade}` : e.tipo === "texto" ? e.texto : `${ROTULO_ADESIVO[e.estilo || ""] || "✨"} ${e.texto || e.estilo}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. VOZ */}
          <section className={`rounded-xl border border-linha bg-preto/40 p-3 ${roteiro ? "" : "opacity-50"}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">3 · 🎙️ Voz</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ESTILOS.map((s) => (
                <button key={s.nome} type="button" disabled={!roteiro} onClick={() => setEstilo(s.direcao)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${estilo === s.direcao ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-linha text-muted hover:text-white"}`}>{s.emoji} {s.nome}</button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select value={voz} onChange={(e) => setVoz(e.target.value)} disabled={!roteiro} className="input-base text-sm">
                {VOZES.map((v) => <option key={v.id} value={v.id}>{v.favorita ? "⭐ " : ""}{v.nome} — {v.sexo === "m" ? "masculina" : "feminina"}, {v.nota}</option>)}
              </select>
              <button type="button" onClick={gerarVoz} disabled={!roteiro || !!ocupado || videoUrl === "gerando"} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
                {ocupado === "voz" ? "🎙️ gerando e marcando cada palavra…" : audio ? "🔊 Gerar voz de novo" : "🔊 Gerar voz"}
              </button>
            </div>
            {audio && <audio src={audio.url} controls className="mt-2 h-9 w-full" />}
          </section>

          {/* 4. MONTAR */}
          <section className={`rounded-xl border border-linha bg-preto/40 p-3 ${temTempos ? "" : "opacity-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">4 · 🎬 Montar o vídeo</p>
              <button type="button" onClick={montar} disabled={!temTempos || !!ocupado || videoUrl === "gerando"} className="rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                {videoUrl === "gerando" ? "⏳ Montando…" : ocupado === "montar" ? "Enviando…" : videoUrl.startsWith("http") ? "🔄 Montar de novo" : "⚡ Montar vídeo"}
              </button>
            </div>
            {videoUrl.startsWith("http") && qualidade && (
              <p className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${qualidade.aprovado ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200" : "border-amber-500/30 bg-amber-500/[0.07] text-amber-200"}`}>
                {qualidade.aprovado ? "✓ Conferência aprovada" : "⚠️ Conferência com aviso"} · tela coberta: mínimo {qualidade.coberturaMin}% (média {qualidade.coberturaMedia}%) · {qualidade.cortados.length ? `peça na borda: ${qualidade.cortados.join(", ")}` : "nada cortado"}
                {qualidade.ajustes > 0 && ` · ${qualidade.ajustes} ajuste(s) automático(s)`}
                {qualidade.aviso && <><br />{qualidade.aviso}</>}
              </p>
            )}
            {videoUrl.startsWith("http") && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoUrl} controls playsInline className="mx-auto mt-3 aspect-[9/16] w-full max-w-xs rounded-xl bg-black" />
            )}
          </section>
          </>)}
        </div>

        {msg && (
          <div className={`border-t border-linha px-4 py-2.5 text-[12px] font-semibold ${msg.tipo === "ok" ? "text-green-400" : msg.tipo === "aviso" ? "text-amber-300" : "text-vermelho"}`}>{msg.txt}</div>
        )}
      </div>
    </div>
  );
}
