"use client";

// Editor do VÍDEO CINEMA: 4 passos — tema → roteiro da Bia → voz → montar. Mesmo jeitão do editor
// do vídeo anúncio (colagem): cada passo destrava o próximo e a tela acompanha o motor até o vídeo
// ficar pronto.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VOZES, ESTILOS, VOZ_PADRAO, DIRECAO_PADRAO } from "@/lib/vozes";
import { TEMA_VAZIO, COM_FOTO, FOCOS, type TemaCinema, type RoteiroCinema, type CenaCinema } from "@/lib/cinema";
import { dadosVideoCinema, salvarTemaCinema, gerarRoteiroCinema, editarFalaCinema, gerarVozCinema, sincronizarVozCinema, ajustarTamanhoCinema, montarVideoCinema, fotosParaCinema, salvarFotosCinema, trocarFotoCinema, salvarCapaCinema, avaliacoesGoogleCinema } from "@/app/actions/cinema";
import { statusVideoTematico } from "@/app/actions/videos-tematicos";

const NOME_TIPO: Record<string, { emoji: string; nome: string; cor: string }> = {
  notificacao: { emoji: "🔔", nome: "Notificação", cor: "#f59e0b" },
  foto: { emoji: "📸", nome: "Foto", cor: "#3b82f6" },
  conversa: { emoji: "💬", nome: "Conversa", cor: "#22c55e" },
  etiquetas: { emoji: "🏷️", nome: "Etiquetas", cor: "#ec4899" },
  checklist: { emoji: "✅", nome: "Lista", cor: "#14b8a6" },
  oferta: { emoji: "🎁", nome: "Oferta", cor: "#ef4444" },
  prazo: { emoji: "📅", nome: "Prazo", cor: "#f97316" },
  depoimento: { emoji: "⭐", nome: "Depoimento", cor: "#eab308" },
  final: { emoji: "🏁", nome: "Final", cor: "#a855f7" },
};

function resumoDados(c: CenaCinema): string {
  const d = (c.dados || {}) as Record<string, unknown>;
  if (c.tipo === "notificacao") return `${String(d.remetente || "")}: “${String(d.mensagem || "")}”`;
  if (c.tipo === "conversa") return (Array.isArray(d.mensagens) ? (d.mensagens as { de?: string; texto?: string }[]) : []).map((m) => `${m.de === "marca" ? "🏰" : "👤"} ${m.texto}`).join("  ·  ");
  if (c.tipo === "etiquetas" || c.tipo === "checklist") return `${d.titulo ? `${String(d.titulo)}: ` : ""}${(Array.isArray(d.itens) ? d.itens : []).join(" · ")}`;
  if (c.tipo === "oferta") return `${String(d.principal || "")}${Array.isArray(d.extras) && d.extras.length ? ` + ${d.extras.join(" + ")}` : ""}`;
  if (c.tipo === "prazo") return `até ${String(d.prazo || "").split("-").reverse().slice(0, 2).join("/")}`;
  if (c.tipo === "depoimento") return `${String(d.nome || "")}: “${String(d.texto || "")}”`;
  if (c.tipo === "final") return `botão “${String(d.botao || "")}”`;
  return "";
}

export function CinemaEditor({ videoId, onFechar }: { videoId: string; onFechar: () => void }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [tema, setTema] = useState<TemaCinema>({ ...TEMA_VAZIO, depoimento: { ...TEMA_VAZIO.depoimento } });
  const [extrasTxt, setExtrasTxt] = useState(["", "", ""]);
  const [comDepoimento, setComDepoimento] = useState(false);
  const [roteiro, setRoteiro] = useState<RoteiroCinema | null>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [voz, setVoz] = useState(VOZ_PADRAO);
  const [estilo, setEstilo] = useState(DIRECAO_PADRAO);
  const [audio, setAudio] = useState<{ url: string; segundos: number } | null>(null);
  const [temTempos, setTemTempos] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [ocupado, setOcupado] = useState<"" | "roteiro" | "voz" | "montar" | "fala">("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; txt: string } | null>(null);
  const [editando, setEditando] = useState<{ i: number; fala: string; destaques: string } | null>(null);
  const [fotosEscolhidas, setFotosEscolhidas] = useState<string[]>([]);
  const [banco, setBanco] = useState<{ id: string; url: string; descricao: string; categoria: string; foco: boolean }[] | null>(null);
  const [filtroBanco, setFiltroBanco] = useState<"foco" | "espaco" | "brinquedos" | "festa" | "comida" | "todas">("foco");
  const [qtdBanco, setQtdBanco] = useState(60); // mostra aos poucos (acervo pode ter milhares)
  const [seletor, setSeletor] = useState<null | { modo: "varias" } | { modo: "trocar"; indice: number; atual: string } | { modo: "capa"; atual: string }>(null);
  const [capaTitulo, setCapaTitulo] = useState("");
  const [avaliacoes, setAvaliacoes] = useState<{ nota: number; total: number; lista: { nome: string; texto: string; trecho: string }[] } | null>(null);
  const [buscandoAval, setBuscandoAval] = useState(false);
  const [erroAval, setErroAval] = useState("");
  async function carregarAvaliacoes(forcar: boolean) {
    setBuscandoAval(true); setErroAval("");
    const r = await avaliacoesGoogleCinema(videoId, forcar).catch(() => null);
    setBuscandoAval(false);
    if (!r || !r.ok) { setErroAval((r && "erro" in r && r.erro) || "Não consegui buscar as avaliações agora."); return; }
    setAvaliacoes({ nota: r.nota, total: r.total, lista: r.lista });
  }
  const [capaUrl, setCapaUrl] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [vendo, setVendo] = useState<{ url: string; indice: number; atual: string } | null>(null); // foto ampliada
  const [passo, setPasso] = useState(1); // etapa do passo a passo (1 Ideia … 5 Vídeo)
  const [comOferta, setComOferta] = useState(false);

  async function recarregar() {
    const d = await dadosVideoCinema(videoId).catch(() => null);
    setCarregando(false);
    if (!d || !d.ok) { setMsg({ tipo: "erro", txt: (d && "erro" in d && d.erro) || "Não consegui abrir esse vídeo." }); return; }
    setTitulo(d.titulo);
    setTema(d.tema);
    setExtrasTxt([0, 1, 2].map((i) => d.tema.extras[i] || ""));
    setComDepoimento(!!d.tema.depoimento.texto);
    setRoteiro(d.roteiro);
    setFotos(d.fotos);
    setFotosEscolhidas(d.fotosEscolhidas);
    setVoz(d.narracao.voz || VOZ_PADRAO);
    setEstilo(d.narracao.estilo || DIRECAO_PADRAO);
    setAudio(d.narracao.url.startsWith("http") ? { url: d.narracao.url, segundos: d.narracao.segundos } : null);
    setTemTempos(d.temTempos);
    setVideoUrl(d.videoUrl);
    setCapaTitulo(d.roteiro?.capa?.titulo || "");
    setCapaUrl(d.capaUrl);
    setComOferta(!!d.tema.principal);
    // abre na etapa onde o vídeo parou
    setPasso(d.videoUrl === "gerando" || d.videoUrl.startsWith("http") ? 5 : d.temTempos ? 4 : d.roteiro ? 2 : 1);
  }
  useEffect(() => { recarregar(); }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (videoUrl !== "gerando") return;
    const t = setInterval(async () => {
      const r = await statusVideoTematico(videoId).catch(() => null);
      if (r?.ok && r.videoUrl !== "gerando") {
        setVideoUrl(r.videoUrl);
        setMsg(r.videoUrl.startsWith("http") ? { tipo: "ok", txt: "🎬 Vídeo pronto! Assista abaixo." } : { tipo: "erro", txt: "O motor não conseguiu montar o vídeo. Tente de novo." });
        router.refresh();
      }
    }, 6000);
    return () => clearInterval(t);
  }, [videoUrl, videoId, router]);

  const temaAtual = (): TemaCinema => ({
    ...tema,
    principal: comOferta ? tema.principal : "",
    prazo: comOferta ? tema.prazo : "",
    extras: comOferta ? extrasTxt.map((x) => x.trim()).filter(Boolean) : [],
    depoimento: comDepoimento && !tema.depoimentoAuto ? tema.depoimento : { nome: "", texto: "", fonte: "" },
  });

  async function escreverRoteiro() {
    setMsg(null);
    setOcupado("roteiro");
    const s = await salvarTemaCinema(videoId, temaAtual()).catch(() => null);
    if (!s || !s.ok) { setOcupado(""); setMsg({ tipo: "erro", txt: (s && "erro" in s && s.erro) || "Não consegui salvar." }); return; }
    // mudou a ideia/oferta/fotos → o roteiro antigo foi descartado no servidor; some da tela também
    if (s.roteiroZerado) { setRoteiro(null); setAudio(null); setTemTempos(false); setPasso(1); }
    let correcao: { rascunho: string; erros: string[] } | undefined;
    let quedas = 0;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (tentativa > 1) setMsg({ tipo: "aviso", txt: `🔁 A conferência pediu ajustes — a Bia está corrigindo (tentativa ${tentativa} de 3)…` });
      const r = await gerarRoteiroCinema(videoId, correcao, tentativa === 3).catch(() => null);
      if (!r && quedas < 2) { quedas++; tentativa--; setMsg({ tipo: "aviso", txt: "⏳ A Bia demorou demais pra responder — pedindo de novo…" }); continue; }
      if (r?.ok) {
        setOcupado("");
        setRoteiro(r.roteiro);
        setAudio(null);
        setTemTempos(false);
        const d = await dadosVideoCinema(videoId).catch(() => null);
        if (d?.ok) { setFotos(d.fotos); setCapaTitulo(d.roteiro?.capa?.titulo || ""); setCapaUrl(d.capaUrl); }
        setPasso(2);
        setMsg({ tipo: "ok", txt: `✓ Roteiro pronto (${r.roteiro.cenas.length} cenas). Confira e mude o que quiser.` });
        return;
      }
      if (r && "reprovado" in r && r.reprovado) { correcao = { rascunho: r.rascunho, erros: r.erros }; continue; }
      setOcupado("");
      setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "A Bia não conseguiu agora." });
      return;
    }
    setOcupado("");
    setMsg({ tipo: "erro", txt: `A Bia não fechou um roteiro que passasse na conferência (${correcao?.erros.slice(0, 2).join(" ")}). Toque de novo em "Bia, escreve o roteiro".` });
  }

  async function salvarFala() {
    if (!editando) return;
    setOcupado("fala");
    const r = await editarFalaCinema(videoId, editando.i, editando.fala, editando.destaques.split(",")).catch(() => null);
    setOcupado("");
    if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui salvar a fala." }); return; }
    setRoteiro(r.roteiro);
    setEditando(null);
    setTemTempos(false);
    setMsg({ tipo: "aviso", txt: "✏️ Fala alterada — gere a voz de novo pra valer no vídeo." });
  }

  async function vozCompleta() {
    let g = await gerarVozCinema(videoId, voz, estilo).catch(() => null);
    if (!g) g = await gerarVozCinema(videoId, voz, estilo).catch(() => null);
    if (!g || !g.ok) return g;
    setMsg({ tipo: "aviso", txt: `🎙️ Voz gerada (${g.segundos}s) — marcando o tempo de cada palavra pra legenda…` });
    let s = await sincronizarVozCinema(videoId).catch(() => null);
    if (!s) s = await sincronizarVozCinema(videoId).catch(() => null);
    const sinc = s && s.ok ? s : null;
    return { ...g, sincronizado: !!sinc?.sincronizado, repetiu: !!sinc?.repetiu, palavrasFaladas: sinc?.palavrasFaladas ?? 0 };
  }
  async function gerarVoz() {
    setMsg(null);
    setOcupado("voz");
    let r = await vozCompleta();
    let boa = r?.ok ? r : null;
    for (let i = 0; i < 2 && r?.ok && r.repetiu; i++) {
      setMsg({ tipo: "aviso", txt: `🔁 A voz repetiu trechos — gerando de novo…` });
      r = await vozCompleta();
      if (r?.ok) boa = r;
    }
    for (let rodada = 1; rodada <= 2 && r?.ok && r.foraDoTempo; rodada++) {
      setMsg({ tipo: "aviso", txt: `⏱️ A fala ficou com ${r.segundos}s — a Bia está ${r.foraDoTempo === "longo" ? "encurtando" : "alongando"} o texto (rodada ${rodada} de 2)…` });
      const aj = await ajustarTamanhoCinema(videoId, r.segundosExatos).catch(() => null);
      if (!aj?.ok) break;
      setRoteiro(aj.roteiro);
      r = await vozCompleta();
      if (r?.ok) boa = r;
    }
    setOcupado("");
    const fim = r?.ok ? r : boa;
    if (!fim) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui gerar a voz. Tente de novo em instantes." }); return; }
    const d = await dadosVideoCinema(videoId).catch(() => null);
    if (d?.ok && d.roteiro) setRoteiro(d.roteiro);
    setTemTempos(d?.ok ? d.temTempos : true);
    setAudio({ url: d?.ok && d.narracao.url.startsWith("http") ? d.narracao.url : fim.url, segundos: d?.ok ? d.narracao.segundos : fim.segundos });
    setMsg({ tipo: "ok", txt: `🔊 Voz pronta (${fim.segundos}s)${fim.sincronizado ? " — legenda sincronizada palavra por palavra." : " — não consegui marcar cada palavra; a legenda vai no tempo estimado."}` });
  }

  async function abrirSeletor(s: NonNullable<typeof seletor>) {
    setSeletor(s);
    setMarcadas(s.modo === "varias" ? fotosEscolhidas : []);
    if (!banco) {
      const r = await fotosParaCinema(videoId, tema.foco).catch(() => null);
      if (r?.ok) setBanco(r.fotos);
      else { setSeletor(null); setMsg({ tipo: "erro", txt: "Não consegui abrir o banco de imagens." }); }
    }
  }
  async function confirmarSeletor(idUnico?: string) {
    if (!seletor) return;
    if (seletor.modo === "varias") {
      const r = await salvarFotosCinema(videoId, marcadas).catch(() => null);
      if (!r?.ok) { setMsg({ tipo: "erro", txt: "Não consegui salvar as fotos escolhidas." }); return; }
      setFotosEscolhidas(r.ids);
      setFotos((f) => ({ ...f, ...Object.fromEntries((banco || []).filter((b) => r.ids.includes(b.id)).map((b) => [b.id, b.url])) }));
      setMsg({ tipo: "ok", txt: r.ids.length ? `📸 ${r.ids.length} foto(s) escolhida(s). ${r.ids.length >= 4 ? "A Bia vai usar só essas." : "A Bia usa essas e completa com o banco."}` : "Sem fotos escolhidas: a Bia escolhe sozinha." });
    } else if (seletor.modo === "capa" && idUnico) {
      const r = await salvarCapaCinema(videoId, capaTitulo, idUnico).catch(() => null);
      if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui trocar a foto da capa." }); return; }
      setRoteiro(r.roteiro);
      setCapaUrl(r.capaUrl);
      setFotos((f) => ({ ...f, ...Object.fromEntries((banco || []).filter((b) => b.id === idUnico).map((b) => [b.id, b.url])) }));
      setMsg({ tipo: "ok", txt: "🖼️ Foto da capa trocada." });
    } else if (seletor.modo === "trocar" && idUnico) {
      const r = await trocarFotoCinema(videoId, seletor.indice, idUnico).catch(() => null);
      if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui trocar a foto." }); return; }
      setRoteiro(r.roteiro);
      setFotos((f) => ({ ...f, [idUnico]: r.url }));
      setMsg({ tipo: "ok", txt: `📸 Foto trocada.${videoUrl.startsWith("http") ? " Clique em \"Montar de novo\" pra ver no vídeo." : ""}` });
    }
    setSeletor(null);
  }

  async function salvarCapa() {
    setOcupado("fala");
    const r = await salvarCapaCinema(videoId, capaTitulo).catch(() => null);
    setOcupado("");
    if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui salvar a capa." }); return; }
    setRoteiro(r.roteiro);
    setCapaUrl(r.capaUrl);
    setMsg({ tipo: "ok", txt: "🖼️ Capa atualizada — ela vira a miniatura e a capa do Reels no Instagram." });
  }

  async function montar() {
    setMsg(null);
    setOcupado("montar");
    const r = await montarVideoCinema(videoId).catch(() => null);
    setOcupado("");
    if (!r || !r.ok) { setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "Não consegui mandar pro motor." }); return; }
    setVideoUrl("gerando");
    setMsg({ tipo: "ok", txt: "⏳ Montando o vídeo no motor… leva uns 3 a 6 minutos. Pode fechar e voltar depois." });
  }

  const passoTema = tema.tema.trim().length >= 5;
  const travado = !!ocupado || videoUrl === "gerando";
  // até onde dá pra ir no passo a passo (cada etapa destrava a próxima)
  const liberado = [true, !!roteiro, !!roteiro, !!roteiro && temTempos, !!roteiro && temTempos];
  const ETAPAS = [
    { n: 1, nome: "Ideia", emoji: "💡" },
    { n: 2, nome: "Roteiro", emoji: "✍️" },
    { n: 3, nome: "Voz", emoji: "🎙️" },
    { n: 4, nome: "Capa", emoji: "🖼️" },
    { n: 5, nome: "Vídeo", emoji: "🎬" },
  ];
  const depoModo = tema.depoimentoAuto ? "auto" : comDepoimento ? "eu" : "nao";
  const chip = (ativo: boolean) => `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${ativo ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-linha text-muted hover:border-white/30 hover:text-white"}`;
  const cartao = "rounded-2xl border border-linha bg-white/[0.02] p-4";
  const titulo2 = "text-sm font-bold text-white";
  const ajuda = "mt-0.5 text-xs text-muted";

  async function proximoDaIdeia() {
    if (roteiro) { setPasso(2); return; }
    await escreverRoteiro();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/85 p-0 sm:items-center sm:p-4" onClick={() => !ocupado && onFechar()}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden bg-preto-card sm:rounded-2xl sm:border sm:border-linha">
        {/* topo: título + etapas */}
        <div className="border-b border-linha px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-white">🎥 {titulo || "Vídeo cinema"}</p>
            <button type="button" onClick={onFechar} disabled={!!ocupado} className="rounded-full border border-linha px-3 py-1 text-sm text-muted hover:text-white disabled:opacity-40">✕</button>
          </div>
          <div className="mt-3 flex items-center gap-1">
            {ETAPAS.map((e, i) => {
              const atual = passo === e.n;
              const feito = passo > e.n;
              return (
                <div key={e.n} className="flex flex-1 items-center gap-1">
                  <button type="button" disabled={!liberado[i] || travado} onClick={() => setPasso(e.n)}
                    className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition disabled:opacity-35 ${atual ? "bg-amber-500/15 text-amber-200" : feito ? "text-emerald-300 hover:bg-white/5" : "text-muted hover:bg-white/5"}`}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${atual ? "bg-amber-400 text-black" : feito ? "bg-emerald-500/25" : "bg-white/10"}`}>{feito ? "✓" : e.emoji}</span>
                    <span className="truncate">{e.nome}</span>
                  </button>
                  {i < ETAPAS.length - 1 && <span className={`h-px w-3 shrink-0 ${passo > e.n ? "bg-emerald-400/60" : "bg-white/15"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {carregando ? <p className="text-sm text-muted">Carregando…</p> : (<>

          {/* ===== 1. IDEIA ===== */}
          {passo === 1 && (<>
            <div className={cartao}>
              <p className={titulo2}>Sobre o que é o vídeo?</p>
              <p className={ajuda}>Uma frase basta — a Bia cria a história a partir dela.</p>
              <input value={tema.tema} onChange={(e) => setTema({ ...tema, tema: e.target.value })} maxLength={160} placeholder="Ex: últimas datas de dezembro" className="input-base mt-3 w-full text-base" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Últimas datas do ano", "Festa completa sem estresse", "Conheça nosso espaço", "Diversão garantida pras crianças"].map((x) => (
                  <button key={x} type="button" onClick={() => setTema({ ...tema, tema: x })} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:text-white">{x}</button>
                ))}
              </div>
            </div>

            <div className={cartao}>
              <p className={titulo2}>Que fotos usar?</p>
              <p className={ajuda}>Foto de família posando nunca entra.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FOCOS.map((f) => (
                  <button key={f.id} type="button" onClick={() => { setTema({ ...tema, foco: f.id }); setBanco(null); }}
                    className={`rounded-xl border p-2.5 text-left transition ${tema.foco === f.id ? "border-amber-400 bg-amber-500/10" : "border-linha hover:border-white/30"}`}>
                    <span className="block text-lg">{f.emoji}</span>
                    <span className="block text-xs font-bold text-white">{f.nome}</span>
                    <span className="block text-[10px] leading-snug text-muted">{f.desc}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                <button type="button" onClick={() => abrirSeletor({ modo: "varias" })} disabled={!!ocupado} className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40">
                  📸 {fotosEscolhidas.length ? `Minhas fotos (${fotosEscolhidas.length})` : "Prefiro escolher as fotos"}
                </button>
                {fotosEscolhidas.slice(0, 8).map((id) => fotos[id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={id} src={fotos[id]} alt="" className="h-9 w-9 rounded object-cover ring-1 ring-white/30" />
                ) : null)}
              </div>
            </div>

            {/* OFERTA (liga/desliga) */}
            <div className={cartao}>
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span><span className={titulo2}>🎁 Tem uma oferta?</span><span className={`block ${ajuda}`}>Aparece num cartão animado e a Bia fala dela.</span></span>
                <input type="checkbox" checked={comOferta} onChange={(e) => setComOferta(e.target.checked)} className="h-5 w-5 accent-amber-400" />
              </label>
              {comOferta && (
                <div className="mt-3 space-y-2">
                  <input value={tema.principal} onChange={(e) => setTema({ ...tema, principal: e.target.value })} maxLength={60} placeholder="A oferta (ex: +10 convidados grátis)" className="input-base w-full text-sm" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {extrasTxt.slice(0, 2).map((x, i) => <input key={i} value={x} onChange={(e) => setExtrasTxt((l) => l.map((y, k) => (k === i ? e.target.value : y)))} maxLength={40} placeholder={i === 0 ? "Extra (ex: 10x sem juros)" : "Outro extra (opcional)"} className="input-base w-full text-sm" />)}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs text-muted">Vale até <input type="date" value={tema.prazo} onChange={(e) => setTema({ ...tema, prazo: e.target.value })} className="input-base ml-1 text-sm" /></label>
                    <label className="flex items-center gap-1.5 text-xs text-white/80"><input type="checkbox" checked={tema.condicoes} onChange={(e) => setTema({ ...tema, condicoes: e.target.checked })} /> &quot;Consulte condições&quot;</label>
                  </div>
                </div>
              )}
            </div>

            {/* DEPOIMENTO */}
            <div className={cartao}>
              <p className={titulo2}>⭐ Depoimento de cliente</p>
              <p className={ajuda}>Avaliação 5★ de verdade do Google, com o texto como o cliente escreveu.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([["nao", "Sem depoimento"], ["auto", "✨ Escolher sozinho"], ["eu", "Eu escolho"]] as const).map(([id, nome]) => (
                  <button key={id} type="button" onClick={() => { setComDepoimento(id === "eu"); setTema({ ...tema, depoimentoAuto: id === "auto" }); if (id === "eu" && !avaliacoes) carregarAvaliacoes(false); }} className={chip(depoModo === id)}>{nome}</button>
                ))}
              </div>
              {depoModo === "eu" && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted">{avaliacoes?.nota ? `Nota ${String(avaliacoes.nota).replace(".", ",")} no Google · ${avaliacoes.total} avaliações` : "Avaliações 5★ do Google"}</p>
                    <button type="button" onClick={() => carregarAvaliacoes(true)} disabled={buscandoAval} className="text-[11px] font-semibold text-sky-300 hover:underline disabled:opacity-40">{buscandoAval ? "buscando…" : "↻ buscar novas"}</button>
                  </div>
                  {erroAval && <p className="text-[11px] text-amber-300">{erroAval}</p>}
                  {avaliacoes && (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {avaliacoes.lista.map((a, k) => (
                        <button key={k} type="button" onClick={() => setTema({ ...tema, depoimento: { nome: a.nome, texto: a.trecho, fonte: avaliacoes.nota ? `Google · nota ${String(avaliacoes.nota).replace(".", ",")}` : "Avaliação no Google" } })}
                          className={`block w-full rounded-xl border p-2.5 text-left text-xs ${tema.depoimento.texto === a.trecho ? "border-amber-400 bg-amber-500/10" : "border-white/10 hover:border-white/30"}`}>
                          <span className="font-bold text-white">{a.nome}</span> <span className="text-amber-300">★★★★★</span>{tema.depoimento.texto === a.trecho && <span className="ml-1 text-amber-300">✓ escolhida</span>}
                          <span className="mt-1 block leading-snug text-white/80">“{a.trecho}”</span>
                        </button>
                      ))}
                      {!avaliacoes.lista.length && <p className="text-[11px] text-muted">Nenhuma avaliação 5★ com texto encontrada ainda.</p>}
                    </div>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted hover:text-white">Colar outro depoimento (WhatsApp, Instagram…)</summary>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      <input value={tema.depoimento.nome} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, nome: e.target.value } })} maxLength={30} placeholder="Nome (ex: Thati B.)" className="input-base w-full text-sm" />
                      <input value={tema.depoimento.fonte} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, fonte: e.target.value } })} maxLength={30} placeholder="Onde (ex: WhatsApp)" className="input-base w-full text-sm" />
                      <textarea value={tema.depoimento.texto} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, texto: e.target.value } })} maxLength={160} rows={2} placeholder="O que o cliente escreveu (até 160 letras)" className="input-base w-full text-sm sm:col-span-2" />
                    </div>
                  </details>
                </div>
              )}
            </div>

            <details className={cartao}>
              <summary className="cursor-pointer text-sm font-bold text-white/80">⚙️ Ajustes finos</summary>
              <label className="mt-3 block text-xs text-muted">Texto do botão no final do vídeo</label>
              <input value={tema.botao} onChange={(e) => setTema({ ...tema, botao: e.target.value })} maxLength={26} className="input-base mt-1 w-full text-sm sm:w-72" />
            </details>
          </>)}

          {/* ===== 2. ROTEIRO ===== */}
          {passo === 2 && roteiro && (<>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className={titulo2}>O roteiro da Bia</p>
                <p className={ajuda}>{roteiro.cenas.length} cenas · toque em ✏️ pra mudar uma fala ou na foto pra trocar.</p>
              </div>
              <button type="button" onClick={escreverRoteiro} disabled={travado || !passoTema} className="shrink-0 rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white hover:border-white/30 disabled:opacity-40">{ocupado === "roteiro" ? "✍️ escrevendo…" : "🔄 Outro roteiro"}</button>
            </div>
            {roteiro.cenas.map((c, i) => {
              const a = NOME_TIPO[c.tipo] || { emoji: "•", nome: c.tipo, cor: "#888" };
              const ed = editando?.i === i ? editando : null;
              return (
                <div key={i} className="flex gap-3 rounded-2xl border border-linha bg-white/[0.02] p-3">
                  <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-muted">{i + 1}</span>
                    {COM_FOTO.has(c.tipo) && c.foto && fotos[c.foto] ? (
                      <button type="button" onClick={() => setVendo({ url: fotos[c.foto || ""], indice: i, atual: c.foto || "" })} className="relative" title="Ver a foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotos[c.foto]} alt="" className="h-20 w-12 rounded-lg object-cover ring-1 ring-white/40" />
                        <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/70 text-center text-[9px] font-bold text-white">🔍 ver</span>
                      </button>
                    ) : (
                      <span className="flex h-20 w-12 items-center justify-center rounded-lg text-xl" style={{ background: `${a.cor}22` }}>{a.emoji}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: a.cor }}>{a.emoji} {a.nome}</span>
                      {!ed && <button type="button" disabled={travado} onClick={() => setEditando({ i, fala: c.fala, destaques: c.destaques.join(", ") })} className="text-[11px] font-semibold text-sky-300 hover:underline disabled:opacity-40">✏️ editar</button>}
                    </div>
                    {ed ? (
                      <div className="mt-2 space-y-1.5">
                        <textarea value={ed.fala} onChange={(e) => setEditando({ ...ed, fala: e.target.value })} rows={3} maxLength={220} className="input-base w-full text-sm" />
                        <input value={ed.destaques} onChange={(e) => setEditando({ ...ed, destaques: e.target.value })} placeholder="Palavras em destaque (até 2, separadas por vírgula)" className="input-base w-full text-xs" />
                        <div className="flex gap-2">
                          <button type="button" onClick={salvarFala} disabled={ocupado === "fala"} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40">Salvar</button>
                          <button type="button" onClick={() => setEditando(null)} className="rounded-md border border-linha px-3 py-1 text-xs text-muted">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-sm leading-snug text-white">
                        {c.fala.replace(/\*/g, "").split(/\s+/).map((w, k) => <span key={k} className={c.destaques.some((d) => d && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").startsWith(d.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))) ? "font-bold italic text-amber-300" : ""}>{w} </span>)}
                      </p>
                    )}
                    {resumoDados(c) && <p className="mt-1 line-clamp-2 text-[11px] text-muted">{resumoDados(c)}</p>}
                  </div>
                </div>
              );
            })}
          </>)}

          {/* ===== 3. VOZ ===== */}
          {passo === 3 && roteiro && (<>
            <div className={cartao}>
              <p className={titulo2}>O que a voz vai falar</p>
              <p className={ajuda}>É também a legenda do vídeo. Toque em ✏️ pra mudar — depois gere a voz de novo.</p>
              <div className="mt-3 space-y-2">
                {roteiro.cenas.map((c, i) => {
                  const ed = editando?.i === i ? editando : null;
                  return (
                    <div key={i} className="flex gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/70">{i + 1}</span>
                      {ed ? (
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <textarea value={ed.fala} onChange={(e) => setEditando({ ...ed, fala: e.target.value })} rows={3} maxLength={220} className="input-base w-full text-sm" />
                          <input value={ed.destaques} onChange={(e) => setEditando({ ...ed, destaques: e.target.value })} placeholder="Palavras em destaque (até 2, separadas por vírgula)" className="input-base w-full text-xs" />
                          <div className="flex gap-2">
                            <button type="button" onClick={salvarFala} disabled={ocupado === "fala"} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40">Salvar</button>
                            <button type="button" onClick={() => setEditando(null)} className="rounded-md border border-linha px-3 py-1 text-xs text-muted">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="min-w-0 flex-1 text-sm leading-snug text-white">
                            {c.fala.replace(/\*/g, "").split(/\s+/).map((w, k) => <span key={k} className={c.destaques.some((d) => d && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").startsWith(d.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))) ? "font-bold italic text-amber-300" : ""}>{w} </span>)}
                          </p>
                          <button type="button" disabled={travado} onClick={() => setEditando({ i, fala: c.fala, destaques: c.destaques.join(", ") })} className="shrink-0 self-start text-sm disabled:opacity-40" title="Editar">✏️</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={cartao}>
              <p className={titulo2}>Jeito de falar</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ESTILOS.map((s) => <button key={s.nome} type="button" onClick={() => setEstilo(s.direcao)} className={chip(estilo === s.direcao)}>{s.emoji} {s.nome}</button>)}
              </div>
              <p className={`mt-4 ${titulo2}`}>Voz</p>
              <select value={voz} onChange={(e) => setVoz(e.target.value)} className="input-base mt-2 w-full text-sm">
                {VOZES.map((v) => <option key={v.id} value={v.id}>{v.favorita ? "⭐ " : ""}{v.nome} — {v.sexo === "m" ? "masculina" : "feminina"}, {v.nota}</option>)}
              </select>
            </div>
            <div className={cartao}>
              <button type="button" onClick={gerarVoz} disabled={travado} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
                {ocupado === "voz" ? "🎙️ Gerando e marcando cada palavra…" : audio ? "🔊 Gerar a voz de novo" : "🔊 Gerar a voz"}
              </button>
              {audio && <audio key={audio.url} src={audio.url} controls className="mt-3 h-10 w-full" />}
              {audio && <p className="mt-1 text-center text-[11px] text-muted">{audio.segundos}s de narração{temTempos ? " · legenda sincronizada ✓" : ""}</p>}
            </div>
          </>)}

          {/* ===== 4. CAPA ===== */}
          {passo === 4 && roteiro && (
            <div className={`${cartao} flex flex-col gap-4 sm:flex-row`}>
              {capaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capaUrl} alt="" className="mx-auto h-72 w-[162px] shrink-0 rounded-xl object-cover ring-1 ring-white/30" />
              ) : (
                <div className="mx-auto flex h-72 w-[162px] shrink-0 items-center justify-center rounded-xl bg-white/5 text-center text-xs text-muted">Escreva o título<br />pra ver a capa</div>
              )}
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className={titulo2}>Título da capa</p>
                  <p className={ajuda}>Aparece na miniatura e na capa do Reels no perfil. Coloque a palavra de destaque entre asteriscos: <span className="text-amber-300">*dezembro*</span>.</p>
                  <input value={capaTitulo} onChange={(e) => setCapaTitulo(e.target.value)} maxLength={60} placeholder="Ex: Últimas datas de *dezembro*" className="input-base mt-2 w-full text-base" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={salvarCapa} disabled={travado || capaTitulo.trim().length < 2} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{ocupado === "fala" ? "Salvando…" : "Atualizar capa"}</button>
                  <button type="button" onClick={() => abrirSeletor({ modo: "capa", atual: roteiro.capa?.foto || "" })} disabled={travado} className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-40">🔄 Trocar foto</button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 5. VÍDEO ===== */}
          {passo === 5 && roteiro && (
            <div className={`${cartao} text-center`}>
              {videoUrl === "gerando" ? (
                <div className="py-8">
                  <p className="text-3xl">🎬</p>
                  <p className="mt-2 text-sm font-bold text-white">Montando o vídeo…</p>
                  <p className={ajuda}>Leva uns 4 a 6 minutos. Pode fechar e voltar depois — ele fica guardado em Vídeos.</p>
                </div>
              ) : videoUrl.startsWith("http") ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={videoUrl} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[260px] rounded-xl bg-black" />
                  <p className="mt-2 text-xs text-muted">Pronto! Pra postar ou agendar: 📱 Redes Sociais → 🎬 Reels.</p>
                </>
              ) : (
                <div className="py-8">
                  <p className="text-3xl">🎬</p>
                  <p className="mt-2 text-sm font-bold text-white">Tudo pronto pra montar</p>
                  <p className={ajuda}>Roteiro, voz e capa conferidos. O vídeo sai em uns 4 a 6 minutos.</p>
                </div>
              )}
            </div>
          )}
          </>)}
        </div>

        {/* rodapé fixo: mensagem + ação principal da etapa */}
        <div className="border-t border-linha px-4 py-3">
          {msg && <p className={`mb-2 text-xs font-semibold ${msg.tipo === "ok" ? "text-green-400" : msg.tipo === "aviso" ? "text-amber-300" : "text-vermelho"}`}>{msg.txt}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setPasso((p) => Math.max(1, p - 1))} disabled={passo === 1 || travado} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-white disabled:invisible">← Voltar</button>
            {passo === 1 && roteiro && (
              <button type="button" onClick={escreverRoteiro} disabled={!passoTema || travado} className="ml-auto rounded-xl border border-linha px-3 py-2.5 text-xs font-semibold text-white hover:border-white/30 disabled:opacity-40">🔄 Novo roteiro</button>
            )}
            {passo === 1 && (
              <button type="button" onClick={proximoDaIdeia} disabled={!passoTema || travado} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-40">
                {ocupado === "roteiro" ? "✍️ A Bia está escrevendo…" : roteiro ? "Ver o roteiro →" : "✨ Bia, escreve o roteiro"}
              </button>
            )}
            {passo === 2 && <button type="button" onClick={() => setPasso(3)} disabled={travado || !!editando} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-40">Gostei → Voz</button>}
            {passo === 3 && <button type="button" onClick={() => setPasso(4)} disabled={travado || !temTempos} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-40">{temTempos ? "Próximo → Capa" : "Gere a voz pra seguir"}</button>}
            {passo === 4 && <button type="button" onClick={() => setPasso(5)} disabled={travado} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-40">Próximo → Vídeo</button>}
            {passo === 5 && (
              videoUrl.startsWith("http") && ocupado !== "montar"
                ? <div className="flex gap-2"><button type="button" onClick={montar} disabled={travado} className="rounded-xl border border-linha px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">🔄 Montar de novo</button><button type="button" onClick={onFechar} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black">Concluir</button></div>
                : <button type="button" onClick={montar} disabled={travado || !temTempos} className="rounded-xl bg-gradient-to-r from-amber-400 to-sky-400 px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40">{videoUrl === "gerando" ? "⏳ Montando…" : ocupado === "montar" ? "Enviando…" : "⚡ Montar o vídeo"}</button>
            )}
          </div>
        </div>

        {vendo && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/95 p-4" onClick={() => setVendo(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vendo.url} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[78vh] max-w-full rounded-xl object-contain" />
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" disabled={travado} onClick={() => { const v = vendo; setVendo(null); abrirSeletor({ modo: "trocar", indice: v.indice, atual: v.atual }); }} className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">🔄 Trocar esta foto</button>
              <button type="button" onClick={() => setVendo(null)} className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-white">Fechar</button>
            </div>
          </div>
        )}
        {seletor && (
          <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/90 sm:items-center sm:p-4" onClick={() => setSeletor(null)}>
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-preto-card sm:rounded-2xl sm:border sm:border-linha">
              <div className="flex items-center justify-between gap-2 border-b border-linha px-4 py-3">
                <p className="text-sm font-bold text-white">{seletor.modo === "varias" ? `📸 Escolha as fotos do vídeo (${marcadas.length})` : seletor.modo === "capa" ? "🖼️ Escolha a foto da capa" : "🔄 Escolha a nova foto"}</p>
                <div className="flex gap-2">
                  {seletor.modo === "varias" && <button type="button" onClick={() => confirmarSeletor()} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500">Salvar</button>}
                  <button type="button" onClick={() => setSeletor(null)} className="rounded-full border border-linha px-3 py-1 text-sm text-muted hover:text-white">✕</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {banco && banco.length > 0 && (() => {
                  const conta = (id: typeof filtroBanco) => banco.filter((f) => id === "todas" || (id === "foco" ? f.foco : f.categoria === id)).length;
                  return (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {([["foco", `🎯 Combina com o foco`], ["brinquedos", "🎢 Brinquedos"], ["espaco", "🏰 Espaço"], ["festa", "🎉 Festas"], ["comida", "🍰 Comida"], ["todas", "Todas"]] as const).map(([id, nome]) => (
                        <button key={id} type="button" onClick={() => { setFiltroBanco(id); setQtdBanco(60); }} className={chip(filtroBanco === id)}>{nome} ({conta(id)})</button>
                      ))}
                    </div>
                  );
                })()}
                {!banco ? <p className="text-sm text-muted">Carregando o banco de imagens…</p> : !banco.length ? <p className="text-sm text-muted">Nenhuma foto liberada pra divulgação no banco de imagens.</p> : (<>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {banco.filter((f) => filtroBanco === "todas" || (filtroBanco === "foco" ? f.foco : f.categoria === filtroBanco)).slice(0, qtdBanco).map((f) => {
                      const sel = seletor.modo === "varias" ? marcadas.includes(f.id) : seletor.atual === f.id; // trocar/capa: a atual
                      return (
                        <button key={f.id} type="button" title={f.descricao || ""}
                          onClick={() => seletor.modo === "varias" ? setMarcadas((m) => (m.includes(f.id) ? m.filter((x) => x !== f.id) : [...m, f.id].slice(0, 20))) : confirmarSeletor(f.id)}
                          className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${sel ? "ring-emerald-400" : "ring-transparent hover:ring-white/40"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          {sel && <span className="absolute right-1 top-1 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {banco.filter((f) => filtroBanco === "todas" || (filtroBanco === "foco" ? f.foco : f.categoria === filtroBanco)).length > qtdBanco && (
                    <button type="button" onClick={() => setQtdBanco((q) => q + 60)} className="mx-auto mt-3 block rounded-lg border border-linha px-4 py-2 text-xs font-semibold text-white hover:border-white/30">Mostrar mais fotos (mais antigas)</button>
                  )}
                </>)}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
