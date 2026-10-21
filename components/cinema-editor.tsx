"use client";

// Editor do VÍDEO CINEMA: 4 passos — tema → roteiro da Bia → voz → montar. Mesmo jeitão do editor
// do vídeo anúncio (colagem): cada passo destrava o próximo e a tela acompanha o motor até o vídeo
// ficar pronto.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VOZES, ESTILOS, VOZ_PADRAO, DIRECAO_PADRAO } from "@/lib/vozes";
import { TEMA_VAZIO, COM_FOTO, type TemaCinema, type RoteiroCinema, type CenaCinema } from "@/lib/cinema";
import { dadosVideoCinema, salvarTemaCinema, gerarRoteiroCinema, editarFalaCinema, gerarVozCinema, sincronizarVozCinema, ajustarTamanhoCinema, montarVideoCinema, fotosParaCinema, salvarFotosCinema, trocarFotoCinema, salvarCapaCinema } from "@/app/actions/cinema";
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
  const [banco, setBanco] = useState<{ id: string; url: string; descricao: string }[] | null>(null);
  const [seletor, setSeletor] = useState<null | { modo: "varias" } | { modo: "trocar"; indice: number; atual: string } | { modo: "capa"; atual: string }>(null);
  const [capaTitulo, setCapaTitulo] = useState("");
  const [capaUrl, setCapaUrl] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);

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
    extras: extrasTxt.map((x) => x.trim()).filter(Boolean),
    depoimento: comDepoimento ? tema.depoimento : { nome: "", texto: "", fonte: "" },
  });

  async function escreverRoteiro() {
    setMsg(null);
    setOcupado("roteiro");
    const s = await salvarTemaCinema(videoId, temaAtual()).catch(() => null);
    if (!s || !s.ok) { setOcupado(""); setMsg({ tipo: "erro", txt: (s && "erro" in s && s.erro) || "Não consegui salvar." }); return; }
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
        setMsg({ tipo: "ok", txt: `✓ Roteiro pronto (${r.palavras} palavras, ${r.roteiro.cenas.length} cenas). Confira, mude o que quiser e gere a voz.` });
        return;
      }
      if (r && "reprovado" in r && r.reprovado) { correcao = { rascunho: r.rascunho, erros: r.erros }; continue; }
      setOcupado("");
      setMsg({ tipo: "erro", txt: (r && "erro" in r && r.erro) || "A Bia não conseguiu agora." });
      return;
    }
    setOcupado("");
    setMsg({ tipo: "erro", txt: `A Bia não fechou um roteiro que passasse na conferência. Problemas: ${correcao?.erros.slice(0, 3).join(" ")} — tente de novo.` });
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
      const r = await fotosParaCinema(videoId).catch(() => null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/85 p-0 sm:items-center sm:p-4" onClick={() => !ocupado && onFechar()}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-preto-card sm:rounded-2xl sm:border sm:border-linha">
        <div className="flex items-center justify-between gap-2 border-b border-linha px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">🎥 Vídeo cinema — {titulo}</p>
            <p className="text-[11px] text-muted">Comercial com fotos reais, legenda no ritmo da voz e telinhas animadas.</p>
          </div>
          <button type="button" onClick={onFechar} disabled={!!ocupado} className="rounded-full border border-linha px-3 py-1 text-sm text-muted hover:text-white disabled:opacity-40">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {carregando ? <p className="text-sm text-muted">Carregando…</p> : (<>
          {/* 1. TEMA */}
          <section className="rounded-xl border border-linha bg-preto/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">1 · 💡 Sobre o que é o vídeo</p>
            <input value={tema.tema} onChange={(e) => setTema({ ...tema, tema: e.target.value })} maxLength={160} placeholder="Ex: últimas datas de dezembro / festa completa sem dor de cabeça" className="input-base mt-2 w-full text-sm" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-muted">Oferta (opcional)</label>
                <input value={tema.principal} onChange={(e) => setTema({ ...tema, principal: e.target.value })} maxLength={60} placeholder="Ex: +10 convidados grátis" className="input-base mt-1 w-full text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted">Prazo da oferta (opcional)</label>
                <input type="date" value={tema.prazo} onChange={(e) => setTema({ ...tema, prazo: e.target.value })} className="input-base mt-1 w-full text-sm" />
              </div>
            </div>
            {tema.principal.trim() && (
              <>
                <label className="mt-2 block text-[11px] font-semibold text-muted">Extras da oferta (opcional)</label>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
                  {extrasTxt.map((x, i) => <input key={i} value={x} onChange={(e) => setExtrasTxt((l) => l.map((y, k) => (k === i ? e.target.value : y)))} maxLength={40} placeholder={i === 0 ? "Ex: 10x sem juros" : "Outro extra"} className="input-base w-full text-sm" />)}
                </div>
                <label className="mt-2 flex items-center gap-2 text-[12px] text-white">
                  <input type="checkbox" checked={tema.condicoes} onChange={(e) => setTema({ ...tema, condicoes: e.target.checked })} /> Mostrar &quot;Consulte condições&quot;
                </label>
              </>
            )}
            <div className="mt-2">
              <label className="block text-[11px] font-semibold text-muted">Texto do botão no final</label>
              <input value={tema.botao} onChange={(e) => setTema({ ...tema, botao: e.target.value })} maxLength={26} className="input-base mt-1 w-full text-sm sm:w-64" />
            </div>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-white">
              <input type="checkbox" checked={comDepoimento} onChange={(e) => setComDepoimento(e.target.checked)} /> ⭐ Incluir um depoimento REAL de cliente
            </label>
            {comDepoimento && (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                <input value={tema.depoimento.nome} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, nome: e.target.value } })} maxLength={30} placeholder="Nome (ex: Thati B.)" className="input-base w-full text-sm" />
                <input value={tema.depoimento.fonte} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, fonte: e.target.value } })} maxLength={30} placeholder="Onde (ex: Avaliação no Google)" className="input-base w-full text-sm sm:col-span-2" />
                <textarea value={tema.depoimento.texto} onChange={(e) => setTema({ ...tema, depoimento: { ...tema.depoimento, texto: e.target.value } })} maxLength={160} rows={2} placeholder="Cole o que o cliente escreveu (até 160 letras)" className="input-base w-full text-sm sm:col-span-3" />
              </div>
            )}
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-white">📸 Fotos do vídeo <span className="font-normal text-muted">(opcional — vazio = a Bia escolhe; com 4 ou mais, ela usa só as suas)</span></p>
                <button type="button" onClick={() => abrirSeletor({ modo: "varias" })} disabled={!!ocupado} className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40">
                  {fotosEscolhidas.length ? `Mudar (${fotosEscolhidas.length})` : "Escolher fotos"}
                </button>
              </div>
              {fotosEscolhidas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {fotosEscolhidas.map((id) => fotos[id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={id} src={fotos[id]} alt="" className="h-10 w-10 rounded object-cover ring-1 ring-white/40" />
                  ) : null)}
                </div>
              )}
            </div>
          </section>

          {/* 2. ROTEIRO */}
          <section className="rounded-xl border border-linha bg-preto/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">2 · ✍️ Roteiro da Bia</p>
              <button type="button" onClick={escreverRoteiro} disabled={!passoTema || travado} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40">
                {ocupado === "roteiro" ? "✍️ escrevendo e conferindo… (até 1 min)" : roteiro ? "🔄 Pedir outro roteiro" : "✨ Bia monta o roteiro"}
              </button>
            </div>
            {!passoTema && <p className="mt-2 text-[11px] text-amber-300/90">Conte do que é o vídeo pra liberar.</p>}
            {roteiro && (
              <div className="mt-3 space-y-2">
                {roteiro.cenas.map((c, i) => {
                  const a = NOME_TIPO[c.tipo] || { emoji: "•", nome: c.tipo, cor: "#888" };
                  const ed = editando?.i === i ? editando : null;
                  return (
                    <div key={i} className="flex gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      {COM_FOTO.has(c.tipo) && c.foto && fotos[c.foto] && (
                        <button type="button" disabled={travado} onClick={() => abrirSeletor({ modo: "trocar", indice: i, atual: c.foto || "" })} className="relative shrink-0" title="Trocar esta foto">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fotos[c.foto]} alt="" className="h-16 w-12 rounded object-cover ring-2 ring-white" />
                          <span className="absolute inset-x-0 bottom-0 rounded-b bg-black/70 text-center text-[9px] font-bold text-white">🔄</span>
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: a.cor }}>{a.emoji} {a.nome}</span>
                          {!ed && <button type="button" disabled={travado} onClick={() => setEditando({ i, fala: c.fala, destaques: c.destaques.join(", ") })} className="text-[10px] font-semibold text-sky-300 hover:underline disabled:opacity-40">✏️ editar fala</button>}
                        </div>
                        {ed ? (
                          <div className="mt-1.5 space-y-1.5">
                            <textarea value={ed.fala} onChange={(e) => setEditando({ ...ed, fala: e.target.value })} rows={2} maxLength={220} className="input-base w-full text-[12px]" />
                            <input value={ed.destaques} onChange={(e) => setEditando({ ...ed, destaques: e.target.value })} placeholder="Palavras em destaque (até 2, separadas por vírgula)" className="input-base w-full text-[11px]" />
                            <div className="flex gap-2">
                              <button type="button" onClick={salvarFala} disabled={ocupado === "fala"} className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40">Salvar</button>
                              <button type="button" onClick={() => setEditando(null)} className="rounded-md border border-linha px-2.5 py-1 text-[11px] text-muted">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1.5 text-[12px] leading-snug text-white">
                            “{c.fala.split(/\s+/).map((w, k) => <span key={k} className={c.destaques.some((d) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").startsWith(d.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")) && d) ? "font-bold italic text-amber-300" : ""}>{w} </span>)}”
                          </p>
                        )}
                        {resumoDados(c) && <p className="mt-1 text-[10px] text-muted">{resumoDados(c)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* CAPA */}
          {roteiro && (
            <section className="rounded-xl border border-linha bg-preto/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">🖼️ Capa <span className="font-normal normal-case text-muted">(miniatura e capa do Reels no perfil)</span></p>
              <div className="mt-2 flex gap-3">
                {capaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capaUrl} alt="" className="h-40 w-[90px] shrink-0 rounded-lg object-cover ring-1 ring-white/30" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={capaTitulo} onChange={(e) => setCapaTitulo(e.target.value)} maxLength={60} placeholder="Ex: Últimas datas de *dezembro*" className="input-base w-full text-sm" />
                  <p className="text-[10px] text-muted">Coloque a palavra de destaque entre asteriscos: <span className="text-white/80">*dezembro*</span> sai em itálico amarelo, sublinhada.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={salvarCapa} disabled={travado || capaTitulo.trim().length < 2} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Salvar capa</button>
                    <button type="button" onClick={() => abrirSeletor({ modo: "capa", atual: roteiro.capa?.foto || "" })} disabled={travado} className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 disabled:opacity-40">🔄 Trocar foto da capa</button>
                  </div>
                </div>
              </div>
            </section>
          )}

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
              <button type="button" onClick={gerarVoz} disabled={!roteiro || travado} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
                {ocupado === "voz" ? "🎙️ gerando e marcando cada palavra…" : audio ? "🔊 Gerar voz de novo" : "🔊 Gerar voz"}
              </button>
            </div>
            {audio && <audio key={audio.url} src={audio.url} controls className="mt-2 h-9 w-full" />}
          </section>

          {/* 4. MONTAR */}
          <section className={`rounded-xl border border-linha bg-preto/40 p-3 ${temTempos ? "" : "opacity-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">4 · 🎬 Montar o vídeo</p>
              <button type="button" onClick={montar} disabled={!temTempos || travado} className="rounded-lg bg-gradient-to-r from-amber-500 to-sky-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                {videoUrl === "gerando" ? "⏳ Montando…" : ocupado === "montar" ? "Enviando…" : videoUrl.startsWith("http") ? "🔄 Montar de novo" : "⚡ Montar vídeo"}
              </button>
            </div>
            {videoUrl.startsWith("http") && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoUrl} controls playsInline className="mx-auto mt-3 aspect-[9/16] w-full max-w-xs rounded-xl bg-black" />
            )}
          </section>
          </>)}
        </div>

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
                {!banco ? <p className="text-sm text-muted">Carregando o banco de imagens…</p> : !banco.length ? <p className="text-sm text-muted">Nenhuma foto liberada pra divulgação no banco de imagens.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {banco.map((f) => {
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
                )}
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div className={`border-t border-linha px-4 py-2.5 text-[12px] font-semibold ${msg.tipo === "ok" ? "text-green-400" : msg.tipo === "aviso" ? "text-amber-300" : "text-vermelho"}`}>{msg.txt}</div>
        )}
      </div>
    </div>
  );
}
