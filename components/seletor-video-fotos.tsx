"use client";

// Modal pra ESCOLHER as fotos do vídeo da festa, NA ORDEM, em DUAS grades de fotos GRANDES:
//  1) "Sua sequência" — as escolhidas, numeradas, ARRASTÁVEIS pra reordenar (× pra tirar);
//  2) "Adicionar" — as disponíveis, toque na ordem que quiser e elas sobem pra sequência.
// Arrastar acontece nas próprias fotos grandes (não numa tira pequena). Vazio = automático.

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { salvarFotosVideo, gerarVideoDaFesta, gerarTextoFinalVideo } from "@/app/actions/festas";
import { salvarFotosVideoTematico, gerarVideoTematico, gerarTextoFinalVideoTematico, gerarTextosVideoTematico, editarTextoFotoVideo, gerarLegendaUmaFotoVideo, gerarRoteiroNarracao, gerarNarracaoVideo, removerNarracaoVideo } from "@/app/actions/videos-tematicos";
import { type FotoView } from "@/lib/festa-tipos";
import { VOZES, VOZ_PADRAO, ESTILOS, DIRECAO_PADRAO, fotosParaDuracao } from "@/lib/vozes";

const ORDEM = ["salao", "brinquedos", "aniversariante", "parabens", "momentos"];
const LABEL: Record<string, string> = {
  salao: "🎀 Salão",
  brinquedos: "🎠 Brinquedos",
  aniversariante: "👑 Aniversariante",
  parabens: "🎉 Parabéns",
  momentos: "📸 Momentos",
  // rótulos do modo TEMÁTICO (fotos do acervo — o "momento" vira a categoria do banco)
  espaco: "🏰 Espaço",
  festa: "🎉 Festa",
  comida: "🍔 Comida",
  geral: "📸 Geral",
};

const MOLDURAS_UI = [
  { id: "nenhuma", label: "Sem moldura" },
  { id: "branca", label: "Branca" },
  { id: "grossa", label: "Branca grossa" },
  { id: "marca", label: "Cor da marca" },
];

// Estilo da moldura no PREVIEW (aproxima o que o motor faz: borda colorida ao redor da foto).
// `esc` escala a espessura — 1 no mini-preview, maior no modal ampliado.
function estiloMoldura(m: string, cor: string, esc = 1): CSSProperties {
  if (m === "branca") return { padding: 3 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "grossa") return { padding: 6 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "marca") return { padding: 3 * esc, background: cor, borderRadius: 2 };
  return {};
}

export function SeletorVideoFotos({ festaId, tematicoId, nome, fotos, inicial, capaInicial = "", molduraInicial = "branca", textoFinalInicial = "", textosIniciais = {}, narracao, corMarca = "#E11D2A", jaTemVideo = false, onFechar }: {
  festaId: string;
  tematicoId?: string; // modo TEMÁTICO: salva/gera no VideoTematico (fotos vêm do acervo)
  nome: string;
  fotos: FotoView[];
  inicial: string[];
  capaInicial?: string;
  molduraInicial?: string;
  textoFinalInicial?: string;
  textosIniciais?: Record<string, string>; // legendas por foto (só no modo temático)
  narracao?: { texto: string; voz: string; estilo: string; url: string; segundos: number }; // a voz do vídeo
  corMarca?: string;
  jaTemVideo?: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  // galeria ordenada por momento (narrativa) — base pra parte "disponíveis".
  // No modo temático as fotos já chegam na ordem certa (sugeridas primeiro) — não regrupa.
  const galeria = tematicoId ? fotos : ORDEM.flatMap((m) => fotos.filter((f) => f.momento === m)).concat(fotos.filter((f) => !ORDEM.includes(f.momento)));
  const [sel, setSel] = useState<string[]>(inicial.filter((id) => fotos.some((f) => f.id === id)));
  const [salvando, setSalvando] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null); // foto sendo arrastada (PC ou alça)
  const [ampliada, setAmpliada] = useState<FotoView | null>(null); // foto aberta em tela cheia
  const [erroGerar, setErroGerar] = useState("");
  // foto escolhida pra CAPA (fotoId). "" = a 1ª foto vira capa automaticamente.
  const [capa, setCapa] = useState<string>(fotos.some((f) => f.id === capaInicial) ? capaInicial : "");
  const [moldura, setMoldura] = useState<string>(molduraInicial || "branca"); // moldura das fotos no vídeo
  const [textoFinal, setTextoFinal] = useState<string>(textoFinalInicial || ""); // mensagem do slide final
  const [gerandoTexto, setGerandoTexto] = useState(false); // a Bia escrevendo o texto final
  // LEGENDAS por foto (só no vídeo temático): a copy que aparece embaixo da imagem no vídeo.
  const [textos, setTextos] = useState<Record<string, string>>(textosIniciais);
  const [escrevendoCopy, setEscrevendoCopy] = useState(false); // a Bia escrevendo a copy do vídeo
  const [msgCopy, setMsgCopy] = useState("");
  const [biaNaFoto, setBiaNaFoto] = useState<string | null>(null); // id da foto onde a Bia está escrevendo
  // NARRAÇÃO: o briefing do dono → a Bia escreve o roteiro → escolhe a voz → OUVE → vai pro vídeo
  const [briefing, setBriefing] = useState("");
  const [roteiro, setRoteiro] = useState(narracao?.texto ?? "");
  const [voz, setVoz] = useState(narracao?.voz || VOZ_PADRAO);
  const [estilo, setEstilo] = useState(narracao?.estilo || DIRECAO_PADRAO); // COMO a voz fala
  const [audioUrl, setAudioUrl] = useState(narracao?.url ?? "");
  const [audioSeg, setAudioSeg] = useState(narracao?.segundos ?? 0);
  const [escrevendoRoteiro, setEscrevendoRoteiro] = useState(false);
  const [gerandoVoz, setGerandoVoz] = useState(false);
  const [msgVoz, setMsgVoz] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function definirCapa(id: string) {
    setCapa((c) => (c === id ? "" : id)); // clicar de novo na capa atual tira (volta pra automático)
  }
  // ---- REORDENAR por ID (estável mesmo enquanto a ordem muda) ----
  // PC: arraste o card com o MOUSE (HTML5 drag). CELULAR: a ALÇA (grip) de cada foto tem
  // touch-action:none → segurar+arrastar a alça reposiciona SEM rolar a tela (o resto da
  // lista rola normal, porque só a alça bloqueia o scroll). Sem long-press, sem lib.
  function moverFoto(deId: string, paraId: string) {
    if (deId === paraId) return;
    setSel((s) => {
      const from = s.indexOf(deId), to = s.indexOf(paraId);
      if (from < 0 || to < 0 || from === to) return s;
      const a = [...s];
      const [it] = a.splice(from, 1);
      a.splice(to, 0, it);
      return a;
    });
  }
  // toque arrastando a alça → acha a foto sob o dedo e reordena ao vivo
  function alcaMove(e: React.TouchEvent) {
    if (!dragId) return;
    const t = e.touches[0];
    if (!t) return;
    const alvo = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest("[data-id]");
    const alvoId = alvo?.getAttribute("data-id");
    if (alvoId) moverFoto(dragId, alvoId);
  }
  function sugerir() {
    // Temático: a galeria já chega na ordem sugerida pela IA — pega as primeiras.
    if (tematicoId) { setSel(galeria.slice(0, 26).map((f) => f.id)); return; }
    const sug: string[] = [];
    for (const m of ORDEM) sug.push(...fotos.filter((f) => f.momento === m).slice(0, 5).map((f) => f.id));
    setSel(sug.slice(0, 24));
  }
  // A Bia gera uma frase carinhosa de encerramento (festa: nome/idade/tema; temático: o tema).
  async function biaEscreve() {
    setGerandoTexto(true);
    try {
      const r = tematicoId ? await gerarTextoFinalVideoTematico(tematicoId) : await gerarTextoFinalVideo(festaId);
      if (r.ok && r.texto) setTextoFinal(r.texto);
    } catch {}
    setGerandoTexto(false);
  }
  // A Bia escreve a COPY do vídeo (frases em ~1 a cada 3 fotos, com começo-meio-fim).
  // Salva a seleção antes: a Bia escreve SOBRE as fotos que estão na sequência agora.
  async function biaEscreveCopy() {
    if (!tematicoId) return;
    setEscrevendoCopy(true);
    setMsgCopy("");
    try {
      await salvarFotosVideoTematico(tematicoId, sel, capa, moldura, textoFinal, textos);
      const r = await gerarTextosVideoTematico(tematicoId);
      if (!r.ok) setMsgCopy(r.erro || "Não consegui escrever agora.");
      else {
        setTextos(r.textos);
        setMsgCopy(`✓ A Bia escreveu a abertura${r.capa ? ` ("${r.capa}")` : ""} + ${Math.max(0, r.quantas - (r.capa ? 1 : 0))} legendas — dá pra editar em cada foto.`);
      }
    } catch {
      setMsgCopy("Não consegui escrever agora.");
    }
    setEscrevendoCopy(false);
  }
  // Legenda de UMA foto, editada na mão (vazio = a foto passa limpa, sem texto).
  function mudarTexto(fotoId: string, frase: string) {
    setTextos((t) => ({ ...t, [fotoId]: frase }));
  }
  async function salvarTextoFoto(fotoId: string) {
    if (!tematicoId) return;
    await editarTextoFotoVideo(tematicoId, fotoId, textos[fotoId] ?? "").catch(() => {});
  }
  // ✨ da FOTO: a Bia escreve (ou troca) a legenda daquela foto só. Clicar de novo traz outra.
  async function biaEscreveNaFoto(fotoId: string) {
    if (!tematicoId) return;
    setBiaNaFoto(fotoId);
    setMsgCopy("");
    const r = await gerarLegendaUmaFotoVideo(tematicoId, fotoId).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }));
    setBiaNaFoto(null);
    if (!r.ok) { setMsgCopy(r.erro || "Não consegui escrever agora."); return; }
    setTextos((t) => ({ ...t, [fotoId]: r.frase }));
  }

  // As LEGENDAS vão junto no salvar (não só no onBlur do campo): digitar a frase e clicar
  // direto em "Gerar" não pode perder o texto.
  // ---- NARRAÇÃO ----
  async function biaEscreveRoteiro() {
    if (!tematicoId) return;
    setEscrevendoRoteiro(true);
    setMsgVoz(null);
    const r = await gerarRoteiroNarracao(tematicoId, briefing, 25).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }));
    setEscrevendoRoteiro(false);
    if (!r.ok) { setMsgVoz({ tipo: "erro", txt: r.erro || "Não consegui escrever." }); return; }
    setRoteiro(r.roteiro);
    setMsgVoz({ tipo: "ok", txt: "✓ Roteiro pronto — leia, ajuste se quiser e clique em 🔊 Ouvir." });
  }
  async function ouvirNarracao() {
    if (!tematicoId) return;
    setGerandoVoz(true);
    setMsgVoz(null);
    const r = await gerarNarracaoVideo(tematicoId, roteiro, voz, estilo).catch(() => ({ ok: false as const, erro: "Não consegui gerar a voz agora." }));
    setGerandoVoz(false);
    if (!r.ok) { setMsgVoz({ tipo: "erro", txt: r.erro || "Não consegui gerar a voz." }); return; }
    setAudioUrl(r.url);
    setAudioSeg(r.segundos);
    setMsgVoz({ tipo: "ok", txt: `🔊 Narração de ${r.segundos}s pronta — o vídeo vai usar as ${r.fotos} primeiras fotos pra casar com a voz.` });
  }
  async function tirarNarracao() {
    if (!tematicoId) return;
    setGerandoVoz(true);
    await removerNarracaoVideo(tematicoId).catch(() => {});
    setGerandoVoz(false);
    setRoteiro(""); setAudioUrl(""); setAudioSeg(0); setBriefing("");
    setMsgVoz({ tipo: "ok", txt: "Narração removida — o vídeo volta a ser só imagens + jingle." });
  }

  async function salvarSelecao() {
    if (tematicoId) await salvarFotosVideoTematico(tematicoId, sel, capa, moldura, textoFinal, textos);
    else await salvarFotosVideo(festaId, sel, capa, moldura, textoFinal);
  }
  async function salvar() {
    setSalvando(true);
    try { await salvarSelecao(); } catch {}
    setSalvando(false);
    router.refresh();
    onFechar();
  }
  // Salva a seleção E dispara o motor de vídeo (o "Gerar" agora passa por aqui, depois de escolher).
  async function salvarEGerar() {
    setSalvando(true);
    setErroGerar("");
    try {
      await salvarSelecao();
      const r = await (tematicoId ? gerarVideoTematico(tematicoId) : gerarVideoDaFesta(festaId)).catch(() => ({ ok: false as const, erro: "Não consegui gerar agora." }));
      if (!r.ok) { setErroGerar(r.erro || "Não deu pra gerar."); setSalvando(false); return; }
      router.refresh();
      onFechar();
    } catch {
      setErroGerar("Não consegui gerar agora.");
      setSalvando(false);
    }
  }

  const segs = sel.length ? Math.round(sel.length * 2.3 + 6) : 0;
  const escolhidas = sel.map((id) => fotos.find((f) => f.id === id)).filter((f): f is FotoView => !!f);
  const disponiveis = galeria.filter((f) => !sel.includes(f.id));
  // foto de exemplo pro mini-preview da moldura (uma do slideshow, não a capa)
  const fotoPrevFV = escolhidas.find((f) => f.id !== capa) || escolhidas[0] || galeria[0];
  const fotoPrev = fotoPrevFV?.url;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm" onClick={onFechar}>
      <div className="flex flex-1 flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
          <p className="text-sm font-bold text-white">🎬 Fotos do vídeo — {nome}</p>
          <span className="text-xs text-muted">
            {sel.length} {sel.length === 1 ? "foto" : "fotos"}{segs > 0 ? ` · ≈ ${segs}s` : ""}
            {segs > 90 && <span className="ml-1 font-semibold text-vermelho">(passa de 90s!)</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={sugerir} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">✨ Sugerir</button>
            {sel.length > 0 && <button onClick={() => setSel([])} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-white">Limpar</button>}
            <button onClick={salvar} disabled={salvando} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho disabled:opacity-60">{salvando ? "…" : "Salvar"}</button>
            <button onClick={salvarEGerar} disabled={salvando || sel.length === 0} title={sel.length === 0 ? "Escolha as fotos primeiro" : "Salvar a seleção e gerar o vídeo"} className="rounded-lg bg-[#7c3aed] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-50">{jaTemVideo ? "🔄 Refazer vídeo" : "⚡ Gerar vídeo"}</button>
            <button onClick={onFechar} aria-label="Fechar" className="rounded-lg border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">✕</button>
          </div>
        </div>

        {erroGerar && <p className="border-b border-linha bg-vermelho/10 px-4 py-1.5 text-center text-xs text-vermelho">{erroGerar}</p>}

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <p className="pt-3 text-[11px] leading-relaxed text-amber-300/90">⭐ Toque na <strong className="text-amber-200">estrela</strong> de uma foto pra ela virar a <strong className="text-amber-200">capa</strong> do vídeo (entra nítida, com o título por cima). Sem escolher, a 1ª foto vira a capa.{capa && (<button type="button" onClick={() => setCapa("")} className="ml-1.5 rounded bg-white/10 px-2 py-0.5 font-semibold text-white transition hover:bg-vermelho">✕ tirar capa</button>)}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <span className="text-[11px] font-semibold text-muted">🖼️ Moldura das fotos:</span>
            {MOLDURAS_UI.map((m) => (
              <button key={m.id} type="button" onClick={() => setMoldura(m.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${moldura === m.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                {m.id === "marca" && <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: corMarca }} />}
                {m.label}
              </button>
            ))}
            {/* preview AO VIVO: como a foto fica com a moldura escolhida (atualiza no clique) — clica pra ampliar */}
            {fotoPrevFV && (
              <button type="button" onClick={() => setAmpliada(fotoPrevFV)} title="Clique pra ampliar a prévia" className="group/p ml-auto flex items-center gap-2">
                <span className="text-right text-[10px] leading-tight text-muted">como fica<br /><span className="text-[#c7b2ff] group-hover/p:underline">🔍 ampliar</span></span>
                <span className="flex items-center justify-center rounded-md bg-zinc-700/50 p-2 transition group-hover/p:bg-zinc-600/70">
                  <span className="block" style={estiloMoldura(moldura, corMarca)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoPrev} alt="" className="block h-20 w-20 object-cover" style={{ borderRadius: moldura === "nenhuma" ? 2 : 0 }} />
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* NARRAÇÃO (só no vídeo do buffet): a VOZ que fala no vídeo, com o jingle por baixo.
              Fluxo: você diz o que quer anunciar → a Bia escreve o roteiro → escolhe a voz →
              OUVE aqui mesmo → só então gera o vídeo. */}
          {tematicoId && (
            <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">🎙️ Narração <span className="font-normal text-muted">(uma voz falando no vídeo)</span></span>
                {audioUrl && (
                  <button type="button" onClick={tirarNarracao} disabled={gerandoVoz} className="shrink-0 rounded-md border border-red-900/60 px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">✕ tirar a voz</button>
                )}
              </div>

              {/* 1) o que você quer anunciar */}
              <div className="mt-2 flex flex-wrap items-end gap-1.5">
                <div className="min-w-[200px] flex-1">
                  <label className="block text-[10px] font-semibold text-muted">O que você quer anunciar?</label>
                  <input
                    type="text"
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    placeholder="Ex: promoção de julho — fechou até dia 20, ganha 10 pessoas grátis"
                    className="mt-1 w-full rounded-md border border-linha bg-preto px-2 py-2 text-[11px] text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <button type="button" onClick={biaEscreveRoteiro} disabled={escrevendoRoteiro || gerandoVoz} title="A Bia escreve o roteiro da locução (texto feito pra ser FALADO)" className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50">
                  {escrevendoRoteiro ? "✍️ escrevendo…" : "✨ Bia escreve o roteiro"}
                </button>
              </div>

              {/* 2) o roteiro (editável) */}
              <textarea
                value={roteiro}
                onChange={(e) => setRoteiro(e.target.value)}
                rows={4}
                maxLength={1200}
                placeholder="O roteiro da fala aparece aqui — dá pra editar cada palavra."
                className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[11px] leading-relaxed text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
              />

              {/* 3) COMO A VOZ FALA (a direção) — é isso que tira o tom robótico: a voz obedece
                  esse briefing de verdade. Os botões preenchem, mas dá pra escrever o que quiser. */}
              <div className="mt-2.5 rounded-md border border-linha bg-preto/40 px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-white">🎭 Como a voz deve falar</span>
                  {ESTILOS.map((e) => (
                    <button
                      key={e.nome}
                      type="button"
                      onClick={() => setEstilo(e.direcao)}
                      title={e.direcao}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${estilo === e.direcao ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}
                    >
                      {e.emoji} {e.nome}
                    </button>
                  ))}
                </div>
                <textarea
                  value={estilo}
                  onChange={(e) => setEstilo(e.target.value)}
                  rows={3}
                  maxLength={900}
                  placeholder="Descreva o jeito de falar: quem é a pessoa, a energia, o sotaque, o que NÃO quer…"
                  className="mt-1.5 w-full rounded-md border border-linha bg-preto px-2 py-1.5 text-[10px] leading-relaxed text-white/90 placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-[10px] leading-snug text-muted/70">Escreva como se estivesse dirigindo um locutor no estúdio — <strong className="text-white/70">a voz obedece de verdade</strong>. Ex: “paulista descontraído, energia de showman de circo, abertura explosiva, sem gritaria forçada”.</p>
              </div>

              {/* 4) voz + ouvir */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select value={voz} onChange={(e) => setVoz(e.target.value)} className="input-base flex-1 py-1.5 text-[11px]" aria-label="Voz da narração">
                  <optgroup label="⭐ As que você aprovou">
                    {VOZES.filter((v) => v.favorita).map((v) => (
                      <option key={v.id} value={v.id}>⭐ {v.nome} — {v.sexo === "f" ? "feminina" : "masculina"}, {v.nota}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Outras vozes">
                    {VOZES.filter((v) => !v.favorita).map((v) => (
                      <option key={v.id} value={v.id}>{v.nome} — {v.sexo === "f" ? "feminina" : "masculina"}, {v.nota}</option>
                    ))}
                  </optgroup>
                </select>
                <button type="button" onClick={ouvirNarracao} disabled={gerandoVoz || roteiro.trim().length < 20} title={roteiro.trim().length < 20 ? "Escreva o roteiro primeiro" : "Gera a voz com o jingle por baixo e toca aqui"} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                  {gerandoVoz ? "🎙️ gerando…" : audioUrl ? "🔊 Ouvir de novo" : "🔊 Ouvir"}
                </button>
              </div>

              {/* 4) o player + o aviso de quantas fotos o vídeo vai usar */}
              {audioUrl && (() => {
                const precisa = fotosParaDuracao(audioSeg);
                const temFotos = sel.length; // a capa sai da sequência, então sobra 1 a menos
                const faltam = precisa - (temFotos - 1);
                return (
                  <div className="mt-2">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio src={audioUrl} controls className="h-8 w-full" />
                    {faltam > 0 ? (
                      <p className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug font-semibold text-amber-300">
                        ⚠️ A voz tem <strong>{audioSeg}s</strong> e precisa de <strong>{precisa} fotos</strong> além da capa — faltam <strong>{faltam}</strong>. Adicione mais fotos (ou peça um roteiro mais curto), senão a fala é cortada no meio.
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] leading-snug text-emerald-300/90">
                        A voz tem <strong>{audioSeg}s</strong> → o vídeo usa <strong>{precisa} fotos</strong> (a fala e as imagens terminam juntas). As com legenda entram na frente.
                        {temFotos - 1 > precisa && <> As outras <strong>{temFotos - 1 - precisa}</strong> ficam de fora — quer todas? peça um roteiro mais longo.</>}
                      </p>
                    )}
                  </div>
                );
              })()}
              {msgVoz && <p className={`mt-1.5 text-[11px] font-semibold ${msgVoz.tipo === "ok" ? "text-emerald-400" : "text-vermelho"}`}>{msgVoz.txt}</p>}
              {!audioUrl && !msgVoz && <p className="mt-1.5 text-[10px] leading-snug text-muted/80">Sem narração, o vídeo sai com o <strong className="text-white/70">jingle do buffet</strong> como hoje. Com narração, a voz entra por cima do jingle.</p>}
            </div>
          )}

          {/* COPY DO VÍDEO (só no vídeo do buffet): frases que aparecem embaixo das fotos */}
          {tematicoId && (
            <div className="mt-2.5 rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">💬 Legendas nas fotos <span className="font-normal text-muted">(a copy que aparece no vídeo)</span></span>
                <button type="button" onClick={biaEscreveCopy} disabled={escrevendoCopy || sel.length < 2} title={sel.length < 2 ? "Escolha as fotos primeiro" : "A Bia escreve uma copy com começo, meio e fim — frases em algumas fotos-chave"} className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-50">{escrevendoCopy ? "✍️ escrevendo…" : "✨ Bia escreve a copy"}</button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-muted/80">
                O botão acima escreve o vídeo INTEIRO de uma vez: a <strong className="text-amber-200">frase de abertura</strong> (campo ⭐ da capa — o gancho que segura o dedo de quem rola o feed) + legendas em <strong className="text-white/70">algumas fotos-chave</strong> (as outras passam limpas).<br />
                Em cada foto você ainda pode <strong className="text-white/70">digitar na mão</strong> ou clicar no <strong className="text-[#d6c6ff]">✨</strong> ao lado do campo pra a <strong className="text-white/70">Bia escrever só daquela foto</strong> — clique de novo e ela traz outra opção. <strong className="text-white/70">Apagar o texto tira a legenda</strong> dali.
              </p>
              {msgCopy && <p className={`mt-1.5 text-[11px] font-semibold ${msgCopy.startsWith("✓") ? "text-green-400" : "text-vermelho"}`}>{msgCopy}</p>}
            </div>
          )}

          {/* mensagem do SLIDE FINAL (último quadro do vídeo) — o dono escreve ou a Bia gera */}
          <div className="mt-2.5 rounded-lg border border-linha bg-preto/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">✍️ Texto do final do vídeo</span>
              <button type="button" onClick={biaEscreve} disabled={gerandoTexto} title="A Bia cria uma frase carinhosa de encerramento (usa o nome, a idade e o tema)" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-60">{gerandoTexto ? "✍️ escrevendo…" : "✨ Bia escreve"}</button>
            </div>
            <input type="text" value={textoFinal} onChange={(e) => setTextoFinal(e.target.value)} maxLength={48} placeholder='Em branco = "Muito obrigado!"' className="mt-2 w-full rounded-lg border border-linha bg-preto px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:border-vermelho focus:outline-none" />
            <p className="mt-1.5 text-[10px] leading-snug text-muted/70">Essa frase aparece no <strong className="text-white/70">último quadro</strong> do vídeo, com o logo. Curtinha (até ~48 letras).</p>
          </div>

          {/* 1) SUA SEQUÊNCIA — fotos grandes, arraste pra reordenar, × pra tirar */}
          {escolhidas.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 text-[11px] text-muted">
                🎞️ <strong className="text-white/80">Sua sequência</strong> — segure a <strong className="text-white/80">alcinha ⠿</strong> da foto e arraste pra mudar a ordem (no celular também!), <strong className="text-white/80">×</strong> pra tirar.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {escolhidas.map((f, i) => {
                  const ehCapa = capa === f.id;
                  return (
                  <div key={f.id}>
                  <div
                    data-id={f.id}
                    draggable
                    onDragStart={() => setDragId(f.id)}
                    onDragEnter={() => { if (dragId && dragId !== f.id) moverFoto(dragId, f.id); }}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    className={`relative select-none overflow-hidden rounded-lg border-2 transition-transform ${dragId === f.id ? "z-30 scale-105 border-[#c7b2ff] opacity-90 shadow-xl" : ehCapa ? "border-amber-400" : "border-vermelho"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" draggable={false} className="aspect-square w-full select-none object-cover" />
                    {/* ALÇA de arrastar — segure aqui pra reordenar (no celular, sem rolar a tela) */}
                    <div
                      onTouchStart={(e) => { e.stopPropagation(); setDragId(f.id); if (typeof navigator !== "undefined" && navigator.vibrate) { try { navigator.vibrate(15); } catch {} } }}
                      onTouchMove={alcaMove}
                      onTouchEnd={() => setDragId(null)}
                      onTouchCancel={() => setDragId(null)}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: "none" }}
                      aria-label="Segure e arraste pra mudar a ordem"
                      className="absolute left-1/2 top-1/2 z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full bg-black/55 shadow-lg backdrop-blur-sm transition active:scale-95 active:bg-vermelho"
                    >
                      <span className="grid grid-cols-2 gap-[2.5px]">
                        {Array.from({ length: 6 }).map((_, k) => <span key={k} className="h-1 w-1 rounded-full bg-white/95" />)}
                      </span>
                    </div>
                    <span className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-vermelho text-xs font-bold text-white shadow">{i + 1}</span>
                    <button type="button" onClick={() => toggle(f.id)} aria-label="Tirar" className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/75 text-sm leading-none text-white transition hover:bg-vermelho">×</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); definirCapa(f.id); }} aria-label={ehCapa ? "Tirar capa" : "Definir como capa"} title={ehCapa ? "Tirar como capa (clique pra remover)" : "Usar esta foto como capa do vídeo"} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${ehCapa ? "bg-black/80 text-amber-300 ring-2 ring-amber-300 hover:bg-vermelho hover:text-white hover:ring-vermelho" : "bg-black/70 text-white hover:bg-black"}`}>⭐</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAmpliada(f); }} aria-label="Ampliar" className="absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition hover:bg-black">🔍</button>
                    <span className={`absolute bottom-0 left-0 right-0 px-8 py-0.5 text-center text-[9px] font-bold ${ehCapa ? "bg-amber-400/90 text-black" : "bg-black/65 font-semibold text-white/90"}`}>{ehCapa ? "⭐ CAPA" : (LABEL[f.momento] || f.momento)}</span>
                    </div>
                    {/* TEXTO da foto no vídeo. Na CAPA é a FRASE DE ABERTURA (o gancho que
                        segura o dedo de quem rola o feed); nas outras, a legenda embaixo da
                        imagem. Vazio = a foto passa limpa (na capa, cai no nome do tema). */}
                    {tematicoId && (
                      <div className="mt-1 flex items-stretch gap-1">
                        <input
                          type="text"
                          value={textos[f.id] ?? ""}
                          onChange={(e) => mudarTexto(f.id, e.target.value)}
                          onBlur={() => salvarTextoFoto(f.id)}
                          maxLength={ehCapa ? 48 : 80}
                          placeholder={ehCapa ? "⭐ frase de abertura do vídeo" : "sem legenda"}
                          title={ehCapa ? "Frase que ABRE o vídeo, sobre a foto de capa (curta e forte). Vazia = entra o nome do tema." : "Frase que aparece embaixo desta foto no vídeo (vazio = sem texto)"}
                          className={`min-w-0 flex-1 rounded-md border bg-preto px-2 py-1.5 text-[11px] text-white placeholder:text-muted/40 focus:outline-none ${ehCapa ? (textos[f.id]?.trim() ? "border-amber-400" : "border-amber-400/40") : textos[f.id]?.trim() ? "border-[#7c3aed]/60" : "border-linha"}`}
                        />
                        {/* ✨ a Bia escreve SÓ desta foto (ou troca a frase que está aí).
                            Clicar de novo traz outra opção — ela evita repetir as outras. */}
                        <button
                          type="button"
                          onClick={() => biaEscreveNaFoto(f.id)}
                          disabled={biaNaFoto !== null}
                          title={textos[f.id]?.trim() ? "A Bia escreve OUTRA frase pra esta foto" : ehCapa ? "A Bia escreve a frase de abertura" : "A Bia escreve a legenda desta foto"}
                          className="shrink-0 rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/30 disabled:opacity-40"
                        >
                          {biaNaFoto === f.id ? "…" : "✨"}
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2) ADICIONAR — toque na ordem que quiser e a foto sobe pra sequência */}
          {disponiveis.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-[11px] text-muted">
                {escolhidas.length > 0 ? "➕ Mais fotos" : "👆 Toque nas fotos na ordem que você quer"} — cada toque adiciona ao fim da sequência. Pra ~65s, escolha umas <strong className="text-white/80">25-28</strong>.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {disponiveis.map((f) => {
                  const ehCapa = capa === f.id;
                  return (
                  <div key={f.id} onClick={() => toggle(f.id)} title="Tocar pra adicionar" className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition ${ehCapa ? "border-amber-400" : "border-transparent hover:border-white/30"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className={`aspect-square w-full object-cover transition ${ehCapa ? "" : "opacity-60 group-hover:opacity-100"}`} />
                    <button type="button" onClick={(e) => { e.stopPropagation(); definirCapa(f.id); }} aria-label={ehCapa ? "Tirar capa" : "Definir como capa"} title={ehCapa ? "Tirar como capa (clique pra remover)" : "Usar esta foto como capa do vídeo"} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${ehCapa ? "bg-black/80 text-amber-300 ring-2 ring-amber-300 hover:bg-vermelho hover:text-white hover:ring-vermelho" : "bg-black/70 text-white hover:bg-black"}`}>⭐</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAmpliada(f); }} aria-label="Ampliar" className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition hover:bg-black">🔍</button>
                    <span className={`absolute bottom-0 left-0 right-0 px-8 py-0.5 text-center text-[9px] font-bold ${ehCapa ? "bg-amber-400/90 text-black" : "bg-black/65 font-semibold text-white/90"}`}>{ehCapa ? "⭐ CAPA" : (LABEL[f.momento] || f.momento)}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* foto ampliada — mostra COM a moldura escolhida (fundo borrado), igual vai ficar no vídeo.
            Abre pelo 🔍 de qualquer foto OU pelo mini-preview "como fica". */}
        {ampliada && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={() => setAmpliada(null)}>
            <p className="text-center text-xs font-semibold text-white/80">👇 Assim essa foto vai aparecer no vídeo{moldura !== "nenhuma" ? " (com a moldura)" : ""}</p>
            <div onClick={(e) => e.stopPropagation()} className="relative aspect-[9/16] h-[76vh] max-w-full overflow-hidden rounded-2xl border-[6px] border-zinc-800 bg-black shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ampliada.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50" />
              <div className="absolute inset-0 flex items-center justify-center p-5">
                <span className="block" style={estiloMoldura(moldura, corMarca, 4)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ampliada.url} alt="" className="block max-h-[58vh] w-auto max-w-full object-contain" style={{ borderRadius: moldura === "nenhuma" ? 4 : 0 }} />
                </span>
              </div>
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">{LABEL[ampliada.momento] || ampliada.momento}</span>
            </div>
            <button onClick={() => setAmpliada(null)} className="rounded-lg border border-white/20 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}
