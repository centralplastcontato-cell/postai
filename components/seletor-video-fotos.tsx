"use client";

// Modal pra ESCOLHER as fotos do vídeo da festa, NA ORDEM, em DUAS grades de fotos GRANDES:
//  1) "Sua sequência" — as escolhidas, numeradas, ARRASTÁVEIS pra reordenar (× pra tirar);
//  2) "Adicionar" — as disponíveis, toque na ordem que quiser e elas sobem pra sequência.
// Arrastar acontece nas próprias fotos grandes (não numa tira pequena). Vazio = automático.

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { salvarFotosVideo, gerarVideoDaFesta, gerarTextoFinalVideo, gerarTituloCapaVideo, listarMusicasDaMarca, adicionarMusicaAoBanco } from "@/app/actions/festas";
import { salvarFotosVideoTematico, gerarVideoTematico, gerarTextoFinalVideoTematico, gerarTextosVideoTematico, editarTextoFotoVideo, gerarLegendaUmaFotoVideo, gerarRoteiroNarracao, gerarCtaNarracao, gerarNarracaoVideo, removerNarracaoVideo } from "@/app/actions/videos-tematicos";
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

export function SeletorVideoFotos({ festaId, tematicoId, nome, fotos, inicial, capaInicial = "", molduraInicial = "branca", textoFinalInicial = "", tituloCapaInicial = "", tituloCapaAuto = "", textosIniciais = {}, narracao, musicaInicial = "", musicasBanco = [], corMarca = "#E11D2A", jaTemVideo = false, onFechar }: {
  festaId: string;
  tematicoId?: string; // modo TEMÁTICO: salva/gera no VideoTematico (fotos vêm do acervo)
  nome: string;
  fotos: FotoView[];
  inicial: string[];
  capaInicial?: string;
  molduraInicial?: string;
  textoFinalInicial?: string;
  tituloCapaInicial?: string; // título da capa escrito à mão (só no vídeo de FESTA); "" = automático
  tituloCapaAuto?: string; // o título automático ("Fulano fez X aninhos") — vira o placeholder
  textosIniciais?: Record<string, string>; // legendas por foto (só no modo temático)
  narracao?: { texto: string; voz: string; estilo: string; url: string; segundos: number }; // a voz do vídeo
  musicaInicial?: string;
  musicasBanco?: { url: string; nome: string }[];
  corMarca?: string;
  jaTemVideo?: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  // galeria ordenada por momento (narrativa) — base pra parte "disponíveis".
  // No modo temático as fotos já chegam na ordem certa (sugeridas primeiro) — não regrupa.
  const galeria = tematicoId ? fotos : ORDEM.flatMap((m) => fotos.filter((f) => f.momento === m)).concat(fotos.filter((f) => !ORDEM.includes(f.momento)));
  // Sugestão AUTOMÁTICA da sequência (narrativa): salão → brinquedos → aniversariante → parabéns
  // → momentos, ~6 por etapa (até 28). É a mesma lógica do botão "✨ Sugerir".
  function montarSugestao(): string[] {
    if (tematicoId) return galeria.slice(0, 26).map((f) => f.id);
    const sug: string[] = [];
    for (const m of ORDEM) sug.push(...fotos.filter((f) => f.momento === m).slice(0, 6).map((f) => f.id));
    return sug.slice(0, 28);
  }
  const salvas = inicial.filter((id) => fotos.some((f) => f.id === id));
  // Sem seleção salva → já abre com a sequência sugerida (pronta pra gerar). Com seleção salva, mantém a do dono.
  const [sel, setSel] = useState<string[]>(salvas.length ? salvas : montarSugestao());
  const [salvando, setSalvando] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null); // foto sendo arrastada (PC ou alça)
  const [ampliada, setAmpliada] = useState<FotoView | null>(null); // foto aberta em tela cheia
  const [erroGerar, setErroGerar] = useState("");
  // foto escolhida pra CAPA (fotoId). "" = a 1ª foto vira capa automaticamente.
  const [capa, setCapa] = useState<string>(fotos.some((f) => f.id === capaInicial) ? capaInicial : "");
  const [moldura, setMoldura] = useState<string>(molduraInicial || "branca"); // moldura das fotos no vídeo
  const [filtroCat, setFiltroCat] = useState<string>(""); // filtro por tipo de foto na hora de ADICIONAR ("" = todas)
  const [textoFinal, setTextoFinal] = useState<string>(textoFinalInicial || ""); // mensagem do slide final
  const [tituloCapa, setTituloCapa] = useState<string>(tituloCapaInicial || ""); // título da capa (vídeo de festa)
  const [gerandoTitulo, setGerandoTitulo] = useState(false); // a Bia sugerindo o título da capa
  const [gerandoTexto, setGerandoTexto] = useState(false); // a Bia escrevendo o texto final
  // LEGENDAS por foto (só no vídeo temático): a copy que aparece embaixo da imagem no vídeo.
  const [textos, setTextos] = useState<Record<string, string>>(textosIniciais);
  const [escrevendoCopy, setEscrevendoCopy] = useState(false); // a Bia escrevendo a copy do vídeo
  const [msgCopy, setMsgCopy] = useState("");
  const [biaNaFoto, setBiaNaFoto] = useState<string | null>(null); // id da foto onde a Bia está escrevendo
  // NARRAÇÃO: o briefing do dono → a Bia escreve o roteiro → escolhe a voz → OUVE → vai pro vídeo
  const [briefing, setBriefing] = useState("");
  const [roteiro, setRoteiro] = useState(narracao?.texto ?? "");
  const [roteiro2, setRoteiro2] = useState(""); // 2ª fala (CTA no fim) — opcional; não persiste
  const [voz, setVoz] = useState(narracao?.voz || VOZ_PADRAO);
  const [estilo, setEstilo] = useState(narracao?.estilo || DIRECAO_PADRAO); // COMO a voz fala
  const [volMusica, setVolMusica] = useState(50); // volume da MÚSICA de fundo (0-100; 50 = padrão)
  const [audioUrl, setAudioUrl] = useState(narracao?.url ?? "");
  const [audioSeg, setAudioSeg] = useState(narracao?.segundos ?? 0);
  const [escrevendoRoteiro, setEscrevendoRoteiro] = useState(false);
  const [escrevendoCta, setEscrevendoCta] = useState(false); // a Bia escrevendo a 2ª fala
  const [gerandoVoz, setGerandoVoz] = useState(false);
  const [msgVoz, setMsgVoz] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [musica, setMusica] = useState<string>(musicaInicial || ""); // trilha da festa ("" = música do buffet)
  const [subindoMusica, setSubindoMusica] = useState(false); // enviando o MP3
  const [banco, setBanco] = useState<{ url: string; nome: string }[]>(musicasBanco); // biblioteca de trilhas da marca
  const [tocando, setTocando] = useState<string>(""); // URL da música tocando agora ("" = nenhuma)
  const [buffetUrl, setBuffetUrl] = useState<string>(""); // link da música padrão do buffet (pra dar play)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Ao abrir (vídeo de FESTA), busca a biblioteca de músicas da marca + o link da do buffet.
  useEffect(() => {
    if (tematicoId) return;
    listarMusicasDaMarca(festaId).then((r) => { if (r.ok) { if (r.musicas.length) setBanco(r.musicas); setBuffetUrl(r.buffetUrl || ""); } }).catch(() => {});
  }, [festaId, tematicoId]);
  // Toca/pausa uma trilha pra ouvir antes de escolher (um player só; tocar outra troca a fonte).
  function ouvir(url: string) {
    const a = audioRef.current;
    if (!a) return;
    if (tocando === url) { a.pause(); setTocando(""); return; }
    a.src = url; a.currentTime = 0; a.play().catch(() => {}); setTocando(url);
  }

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function definirCapa(id: string) {
    setCapa((antiga) => {
      const nova = antiga === id ? "" : id; // clicar de novo na capa atual tira (volta pra automático)
      // A FRASE DE ABERTURA pertence à CAPA, não à foto: trocar a foto de capa leva a frase
      // junto. Sem isso, a frase ficava órfã na foto antiga e o vídeo abria sem gancho.
      if (tematicoId && antiga && nova && antiga !== nova) {
        setTextos((t) => {
          const frase = (t[antiga] || "").trim();
          if (!frase || (t[nova] || "").trim()) return t; // nada pra mover, ou a nova já tem texto
          const novo = { ...t, [nova]: frase };
          delete novo[antiga];
          return novo;
        });
      }
      return nova;
    });
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
    setSel(montarSugestao());
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
  // A Bia sugere o TÍTULO DA CAPA (o gancho da 1ª tela) — só no vídeo de festa.
  async function biaEscreveTitulo() {
    if (tematicoId) return;
    setGerandoTitulo(true);
    try {
      const r = await gerarTituloCapaVideo(festaId);
      if (r.ok && r.texto) setTituloCapa(r.texto);
    } catch {}
    setGerandoTitulo(false);
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
  // A Bia escreve a 2ª FALA (o CTA do fim — "acesse o site e faça seu orçamento…").
  async function biaEscreveCta() {
    if (!tematicoId) return;
    setEscrevendoCta(true);
    const r = await gerarCtaNarracao(tematicoId).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }));
    setEscrevendoCta(false);
    if (r.ok && r.cta) setRoteiro2(r.cta);
  }
  async function ouvirNarracao() {
    if (!tematicoId) return;
    setGerandoVoz(true);
    setMsgVoz(null);
    // slider 0-100 → volume do jingle na mistura (50 = 0,16 padrão; 100 = 0,32; 0 = sem música).
    const musicaVol = Math.round((volMusica / 100) * 0.32 * 100) / 100;
    // duração ALVO = o vídeo com TODAS as fotos (uma vira a capa) — a música estica até lá, e
    // com a 2ª fala a voz volta no fim. ~2,3s por foto + 6s fixos (capa + slide final).
    const nSlide = Math.max(1, sel.length - 1);
    const alvoSegundos = Math.round(nSlide * 2.3 + 6);
    const r = await gerarNarracaoVideo(tematicoId, roteiro, voz, estilo, musicaVol, roteiro2, alvoSegundos).catch(() => ({ ok: false as const, erro: "Não consegui gerar a voz agora." }));
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
    else await salvarFotosVideo(festaId, sel, capa, moldura, textoFinal, tituloCapa, musica);
  }
  // Envia o MP3 (áudio) pro Blob e guarda a URL como a trilha desta festa.
  async function enviarMusica(file?: File) {
    if (!file) return;
    setSubindoMusica(true);
    setErroGerar("");
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload?tipo=musica", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok && data.url) {
        setMusica(data.url); // já deixa a nova música escolhida
        // Guarda na BIBLIOTECA da marca pra reusar nos próximos vídeos (e mostra já na lista).
        const nome = data.nome || file.name;
        const r = await adicionarMusicaAoBanco(festaId, data.url, nome).catch(() => null);
        if (r?.ok) setBanco(r.musicas);
        else setBanco((b) => (b.some((m) => m.url === data.url) ? b : [{ url: data.url, nome }, ...b]));
      } else setErroGerar(data.erro || "Não consegui enviar a música.");
    } catch { setErroGerar("Não consegui enviar a música."); }
    setSubindoMusica(false);
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
  // FILTRO por tipo de foto (Festa, Espaço, Comida…): quais categorias existem entre as
  // disponíveis, com contagem — pro dono achar rápido o tipo de foto que quer no vídeo.
  const contagemCat = new Map<string, number>();
  for (const f of disponiveis) contagemCat.set(f.momento, (contagemCat.get(f.momento) || 0) + 1);
  const ordemCat = ["festa", "espaco", "brinquedos", "comida", "geral", "salao", "aniversariante", "parabens", "momentos"];
  const catsDisponiveis = [...contagemCat.keys()].sort((a, b) => {
    const ia = ordemCat.indexOf(a), ib = ordemCat.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const disponiveisFiltradas = filtroCat ? disponiveis.filter((f) => f.momento === filtroCat) : disponiveis;
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
          {/* TÍTULO DA CAPA (só no vídeo de FESTA — no temático a abertura é a frase da foto-capa).
              Vazio = usa o automático ("Fulano fez X aninhos"). O texto quebra linha sozinho. */}
          {!tematicoId && (
            <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">✍️ Título da capa <span className="font-normal text-muted">(a frase grande na 1ª tela do vídeo)</span></span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {tituloCapa.trim() && (
                    <button type="button" onClick={() => setTituloCapa("")} title="Voltar pro título automático" className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-vermelho">✕ usar o automático</button>
                  )}
                  <button type="button" onClick={biaEscreveTitulo} disabled={gerandoTitulo} title="A Bia sugere um título pra capa (usa os nomes, a idade e o tema)" className="rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-60">{gerandoTitulo ? "✍️ escrevendo…" : "✨ Bia escreve"}</button>
                </div>
              </div>
              <input
                type="text"
                value={tituloCapa}
                onChange={(e) => setTituloCapa(e.target.value)}
                maxLength={60}
                placeholder={tituloCapaAuto ? `Em branco = "${tituloCapaAuto}"` : "Escreva o título da capa"}
                className="mt-2 w-full rounded-lg border border-linha bg-preto px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:border-amber-400 focus:outline-none"
              />
              <p className="mt-1.5 text-[10px] leading-snug text-muted/70">Aparece <strong className="text-white/70">grande na capa</strong>. Deixe em branco pra usar o automático{tituloCapaAuto ? <> (<span className="text-white/70">{tituloCapaAuto}</span>)</> : ""}. Pode escrever à vontade — o texto <strong className="text-white/70">quebra a linha sozinho</strong>, não precisa caber numa linha só.</p>
            </div>
          )}

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

              {/* 2) o roteiro (editável) — a 1ª FALA, do começo do vídeo */}
              <textarea
                value={roteiro}
                onChange={(e) => setRoteiro(e.target.value)}
                rows={4}
                maxLength={1200}
                placeholder="O roteiro da fala aparece aqui — dá pra editar cada palavra."
                className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[11px] leading-relaxed text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
              />

              {/* 2b) a 2ª FALA (CTA no fim) — opcional. Com ela, TODAS as fotos entram: a voz fala no
                   começo, a música carrega o meio, e a voz VOLTA no fim pra o convite. */}
              <div className="mt-2.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold text-white">🔁 Fala do final <span className="font-normal text-muted">(o convite — a voz volta no fim)</span></span>
                  <button type="button" onClick={biaEscreveCta} disabled={escrevendoCta || gerandoVoz} title="A Bia escreve a fala final (CTA) — ex: acesse o site e faça seu orçamento" className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50">
                    {escrevendoCta ? "✍️ escrevendo…" : "✨ Bia escreve o final"}
                  </button>
                </div>
                <textarea
                  value={roteiro2}
                  onChange={(e) => setRoteiro2(e.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder="Ex: Acesse www.castelodadiversao.com.br e faça seu orçamento agora mesmo!"
                  className="mt-1.5 w-full rounded-md border border-linha bg-preto px-2 py-1.5 text-[11px] leading-relaxed text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-[10px] leading-snug text-muted/70">Deixe em branco = a voz fala só no começo e a música leva até o fim. Com uma fala aqui, a voz <strong className="text-white/70">volta no fim</strong> pra o convite — e <strong className="text-white/70">todas as fotos aparecem</strong>.</p>
              </div>

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

              {/* 4) VOLUME da música de fundo (entra por baixo da voz). 0 = voz limpa; 50 = padrão. */}
              <div className="mt-2.5 rounded-md border border-linha bg-preto/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white">🎵 Volume da música de fundo</span>
                  <span className="text-[10px] font-semibold text-emerald-300">{volMusica === 0 ? "sem música" : volMusica === 50 ? "padrão" : `${volMusica}%`}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-muted">🔈</span>
                  <input type="range" min={0} max={100} step={5} value={volMusica} onChange={(e) => setVolMusica(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-emerald-500" aria-label="Volume da música de fundo" />
                  <span className="text-[10px] text-muted">🔊</span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted/70">Arraste pra deixar a <strong className="text-white/70">música mais baixa ou mais alta</strong> por trás da voz. Tudo à esquerda = <strong className="text-white/70">só a voz</strong>, sem música. Vale ao clicar em <strong className="text-white/70">🔊 Ouvir</strong>.</p>
              </div>

              {/* 5) voz + ouvir */}
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
                        ⚠️ As falas somam <strong>{audioSeg}s</strong> e não cabem nas fotos escolhidas — faltam <strong>{faltam}</strong>. Adicione mais fotos (ou encurte as falas), senão o convite do fim é cortado.
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] leading-snug text-emerald-300/90">
                        🎵 Trilha de <strong>{audioSeg}s</strong> pronta — <strong>todas as suas fotos entram</strong> no vídeo (a voz fala no começo{roteiro2.trim() ? " e volta no fim pro convite" : ""}, e a música leva o meio). As com legenda entram na frente.
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

          {/* MÚSICA do vídeo (só no vídeo de FESTA) — o dono envia o MP3, OUVE (▶️) e ESCOLHE numa
              lista. As trilhas enviadas ficam na BIBLIOTECA da marca pra reusar em qualquer vídeo. */}
          {!tematicoId && (
          <div className="mt-2.5 rounded-lg border border-linha bg-preto/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">🎵 Música do vídeo</span>
              <label className={`shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 ${subindoMusica ? "opacity-60" : "cursor-pointer"}`}>
                {subindoMusica ? "🎵 enviando…" : "➕ Enviar música"}
                {/* SEM accept="audio/*": no iPad esse filtro TRAVA os MP3 no seletor (bug do iOS).
                    Sem filtro, o arquivo fica selecionável; o servidor valida que é áudio de verdade. */}
                <input type="file" className="hidden" disabled={subindoMusica} onChange={(e) => enviarMusica(e.target.files?.[0])} />
              </label>
            </div>

            {/* Lista pra ESCOLHER: 1ª opção é a do buffet; depois as enviadas (▶️ pra ouvir antes). */}
            <div className="mt-2 flex flex-col gap-1.5">
              <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${!musica ? "border-[#7c3aed] bg-[#7c3aed]/15" : "border-linha"}`}>
                {buffetUrl ? (
                  <button type="button" onClick={() => ouvir(buffetUrl)} aria-label={tocando === buffetUrl ? "Pausar" : "Ouvir"} title={tocando === buffetUrl ? "Pausar" : "Ouvir a música do buffet"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/50 text-sm text-white transition hover:bg-[#7c3aed]">{tocando === buffetUrl ? "⏸" : "▶️"}</button>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center text-base">🏰</span>
                )}
                <button type="button" onClick={() => setMusica("")} className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-white">🏰 Música padrão do buffet</button>
                {!musica && <span className="shrink-0 text-[10px] font-bold text-[#c7b2ff]">✓ escolhida</span>}
              </div>
              {banco.map((m) => {
                const escolhida = musica === m.url;
                const play = tocando === m.url;
                return (
                  <div key={m.url} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${escolhida ? "border-[#7c3aed] bg-[#7c3aed]/15" : "border-linha"}`}>
                    <button type="button" onClick={() => ouvir(m.url)} aria-label={play ? "Pausar" : "Ouvir"} title={play ? "Pausar" : "Ouvir esta música"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/50 text-sm text-white transition hover:bg-[#7c3aed]">{play ? "⏸" : "▶️"}</button>
                    <button type="button" onClick={() => setMusica(m.url)} className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-white">🎵 {m.nome}</button>
                    {escolhida && <span className="shrink-0 text-[10px] font-bold text-[#c7b2ff]">✓ escolhida</span>}
                  </div>
                );
              })}
            </div>

            {/* player ÚNICO (escondido) que o ▶️/⏸ de cada trilha controla */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} onEnded={() => setTocando("")} className="hidden" />

            <p className="mt-2 text-[10px] leading-snug text-muted/70">Baixe trilhas grátis (ex: <strong className="text-white/70">Pixabay Music</strong>) e toque em <strong className="text-white/70">➕ Enviar música</strong>. Use o <strong className="text-white/70">▶️</strong> pra ouvir antes de escolher — as enviadas ficam guardadas aqui pra reusar.</p>
          </div>
          )}

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

              {/* FILTRO por tipo de foto (Festa, Espaço, Comida…) — só aparece se houver 2+ tipos. */}
              {catsDisponiveis.length >= 2 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted">🔎 Mostrar:</span>
                  <button type="button" onClick={() => setFiltroCat("")} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${filtroCat === "" ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                    Todas ({disponiveis.length})
                  </button>
                  {catsDisponiveis.map((c) => (
                    <button key={c} type="button" onClick={() => setFiltroCat(c)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${filtroCat === c ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                      {LABEL[c] || c} ({contagemCat.get(c)})
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {disponiveisFiltradas.map((f) => {
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
              {filtroCat && disponiveisFiltradas.length === 0 && (
                <p className="py-4 text-center text-[11px] text-muted">Todas as fotos de <strong className="text-white/80">{LABEL[filtroCat] || filtroCat}</strong> já entraram na sequência. <button type="button" onClick={() => setFiltroCat("")} className="font-semibold text-[#c7b2ff] underline">Ver todas</button></p>
              )}
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
