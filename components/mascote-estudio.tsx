"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { gerarMascote, definirMascote, removerMascote, excluirMascoteArte, usarImagemComoMascote, removerFundoMascote, gerarFicha3d, gerarClipeMascote, statusClipeMascote, excluirClipeMascote, prepararPostClipe, concluirPostClipe, definirVozMascote } from "@/app/actions/mascote";
import { imagensDoBanco } from "@/app/actions/imagens";

// Ações prontas pro clipe do mascote (1 toque preenche a descrição, sem digitar).
const ACOES_CLIPE = [
  { emoji: "👋", nome: "Acenar", desc: "acenando feliz com as duas mãos, dando boas-vindas, sorrindo" },
  { emoji: "🎉", nome: "Pular", desc: "pulando de alegria, animado e sorrindo" },
  { emoji: "🏰", nome: "Apresentar", desc: "abrindo os bracinhos apresentando o espaço, com orgulho e alegria" },
  { emoji: "😘", nome: "Beijo", desc: "soprando um beijo carinhoso e piscando o olho" },
  { emoji: "💃", nome: "Dançar", desc: "dançando animado, balançando o corpo com alegria" },
  { emoji: "👍", nome: "Joinha", desc: "fazendo joinha (positivo) com as duas mãos e piscando" },
];

// 🎬 AVENTURAS — cenas animadas de verdade (o cenário ganha vida, o castelinho é o protagonista).
const AVENTURAS_CLIPE = [
  { emoji: "🛝", nome: "Escorregador", desc: "escorregando por um tobogã colorido de parquinho, rindo de alegria" },
  { emoji: "🎂", nome: "Velinhas", desc: "soprando as velinhas de um bolo de aniversário enorme e colorido" },
  { emoji: "🎈", nome: "Boas-vindas", desc: "recebendo a criançada na porta do buffet, cercado de balões coloridos" },
  { emoji: "🫧", nome: "Piscina de bolinhas", desc: "pulando e se divertindo numa piscina de bolinhas coloridas" },
  { emoji: "🦸", nome: "Super-herói", desc: "voando como um super-herói pelo céu, com uma capinha esvoaçante" },
  { emoji: "🎉", nome: "Festa", desc: "no meio de uma festa animada, dançando com confetes caindo do teto" },
];

// 🎙️ VOZES do castelinho — o dono escolhe uma e ela fica salva, usada em todos os clipes com fala.
const VOZES_CLIPE = [
  { nome: "🧒 Menino animado", desc: "de menino de uns 8 anos, animada, alegre e brincalhona, tom médio-agudo" },
  { nome: "👧 Menininha fofa", desc: "de menininha fofa e doce, tom agudo, carinhosa e simpática" },
  { nome: "🎈 Mascote clássico", desc: "de PERSONAGEM INFANTIL fofa, alegre e cativante, tom mais agudo, de mascote de desenho" },
  { nome: "🤖 Robôzinho divertido", desc: "de robôzinho divertido, levemente eletrônica e engraçada, animada" },
  { nome: "🦣 Vozão engraçado", desc: "grave, bonachona e engraçada, tipo gigante gentil e bem-humorado" },
];

const FICHA_LABELS = ["Frente", "Lado", "Costas"];

// 🦸 ESTÚDIO DO MASCOTE (Fase 1): o dono gera opções em 3D fofo, escolhe uma e ela vira o
// mascote OFICIAL da marca. Depois (Fases 2/3) esse MESMO mascote é colado nos posts/vídeos.

export function MascoteEstudio({
  marcaId,
  mascoteUrl,
  mascotes,
  ficha3d,
  clipes,
  corMarca,
  voz,
}: {
  marcaId: string;
  mascoteUrl: string; // mascote oficial atual ("" = nenhum)
  mascotes: string[]; // biblioteca de opções geradas
  ficha3d?: string; // ficha do personagem (frente/lado/costas) pro 3D ("" = não gerada)
  clipes?: string[]; // clipes animados (IA de vídeo) já gerados
  corMarca?: string; // cor primária da marca (opção de fundo do clipe)
  voz?: string; // voz definida do castelinho ("" = padrão)
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gerando, setGerando] = useState(false);
  const [proc, setProc] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [referenciaUrl, setReferenciaUrl] = useState("");
  const [subindoRef, setSubindoRef] = useState(false);

  function handleGerar() {
    setErro(null);
    setGerando(true);
    startTransition(async () => {
      const r = await gerarMascote(marcaId, descricao.trim() || undefined, referenciaUrl || undefined);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setGerando(false);
    });
  }
  function handleUsarReferencia() {
    if (!referenciaUrl) return;
    setErro(null);
    setProc("usar-ref");
    startTransition(async () => {
      const r = await usarImagemComoMascote(marcaId, referenciaUrl);
      if (!r.ok) setErro(r.erro);
      else setReferenciaUrl("");
      router.refresh();
      setProc(null);
    });
  }
  async function handleUploadRef(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setSubindoRef(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok) setReferenciaUrl(data.url);
      else setErro(data.erro || "Falha ao enviar a imagem de referência.");
    } catch {
      setErro("Falha ao enviar a imagem. Tente de novo.");
    } finally {
      setSubindoRef(false);
    }
  }
  function handleEscolher(url: string) {
    setErro(null);
    setProc(url);
    startTransition(async () => {
      const r = await definirMascote(marcaId, url);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleRemover() {
    setErro(null);
    setProc("remover");
    startTransition(async () => {
      const r = await removerMascote(marcaId);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Ficha 3D: novo formato é JSON [frente, lado, costas]; formato antigo era 1 URL só.
  const fichaUrls: string[] = (() => {
    if (!ficha3d) return [];
    if (ficha3d.startsWith("[")) { try { const a = JSON.parse(ficha3d); return Array.isArray(a) ? a.filter((u): u is string => typeof u === "string" && u.startsWith("http")) : []; } catch { return []; } }
    return [ficha3d];
  })();
  const [gerandoFicha, setGerandoFicha] = useState(false);
  function handleFicha3d() {
    setErro(null);
    setGerandoFicha(true);
    startTransition(async () => {
      const r = await gerarFicha3d(marcaId);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setGerandoFicha(false);
    });
  }
  // DAR VIDA (Fase 5): anima o mascote com IA de vídeo. Em 2 fases (a IA leva 1-2 min): inicia o
  // job e fica consultando até o clipe ficar pronto.
  const clipesUrls = clipes ?? [];
  const [subAba, setSubAba] = useState<"criar" | "ficha" | "vida">("criar"); // sub-abas do estúdio
  const [vozClipe, setVozClipe] = useState(voz ?? ""); // voz definida do castelinho
  const [salvandoVoz, setSalvandoVoz] = useState(false);
  const [vozSalva, setVozSalva] = useState(false);
  async function salvarVoz(nova: string) {
    setVozClipe(nova); setSalvandoVoz(true); setVozSalva(false);
    const r = await definirVozMascote(marcaId, nova).catch(() => ({ ok: false as const, erro: "Não consegui salvar a voz." }));
    setSalvandoVoz(false);
    if (r.ok) { setVozSalva(true); setTimeout(() => setVozSalva(false), 2500); }
    else setErro(r.erro);
  }
  const [descClipe, setDescClipe] = useState("");
  const [ehAventura, setEhAventura] = useState(false); // cena animada (aventura) x ação simples
  const [falaClipe, setFalaClipe] = useState(""); // o que o mascote FALA no clipe ("" = só música)
  const [durClipe, setDurClipe] = useState(8); // duração do clipe: 4 | 8 | 12
  const [fundoClipe, setFundoClipe] = useState("#FFFFFF"); // cor do fundo do clipe
  const [fundoFoto, setFundoFoto] = useState(""); // foto do buffet como fundo ("" = usa a cor)
  const [abrirFotos, setAbrirFotos] = useState(false); // seletor de foto aberto
  const [fotosBanco, setFotosBanco] = useState<{ id: string; url: string; categoria: string }[]>([]);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  async function abrirSeletorFotos() {
    setAbrirFotos(true);
    if (fotosBanco.length) return;
    setCarregandoFotos(true);
    const r = await imagensDoBanco(marcaId).catch(() => null);
    setCarregandoFotos(false);
    if (r && r.ok) {
      // prioriza fotos do ESPAÇO (cenário do buffet, sem crianças) — melhores/mais seguras de fundo.
      const espaco = r.imagens.filter((i) => i.categoria === "espaco");
      setFotosBanco((espaco.length ? espaco : r.imagens).map((i) => ({ id: i.id, url: i.url, categoria: i.categoria })));
    }
  }
  // paleta de fundos: branco + cor da marca + cores alegres de buffet.
  const FUNDOS_CLIPE = [
    { cor: "#FFFFFF", nome: "Branco" },
    ...(corMarca && /^#[0-9a-fA-F]{6}$/.test(corMarca) ? [{ cor: corMarca, nome: "Marca" }] : []),
    { cor: "#BFDBFE", nome: "Azul" }, { cor: "#FBCFE8", nome: "Rosa" }, { cor: "#FEF08A", nome: "Amarelo" },
    { cor: "#DDD6FE", nome: "Roxo" }, { cor: "#BBF7D0", nome: "Verde" }, { cor: "#111827", nome: "Escuro" },
  ];
  const [gerandoClipe, setGerandoClipe] = useState(false);
  const [statusClipe, setStatusClipe] = useState("");
  // Postar o clipe (Reels/Story) — confirmação + resultado.
  const [confirmPost, setConfirmPost] = useState<{ url: string; tipo: "reels" | "story" } | null>(null);
  const [postandoClipe, setPostandoClipe] = useState(false);
  const [resultadoPost, setResultadoPost] = useState<{ tipo: "ok" | "erro"; txt: string; link?: string | null } | null>(null);
  const jobKey = `mascoteClipeJob:${marcaId}`;
  // Acompanha um clipe até ficar pronto. Guarda o id do job no navegador, então se você RECARREGAR
  // ou voltar pra aba, ele RETOMA sozinho (o clipe não se perde). Espera até ~12 min.
  async function acompanharClipe(jobId: string) {
    setGerandoClipe(true);
    setStatusClipe("🎬 A IA está animando… (pode levar alguns minutos)");
    try { localStorage.setItem(jobKey, jobId); } catch {}
    for (let i = 0; i < 72; i++) { // ~12 min (10s cada)
      await new Promise((r) => setTimeout(r, 10000));
      const st = await statusClipeMascote(marcaId, jobId).catch(() => null);
      if (!st) continue;
      if (!st.ok) { try { localStorage.removeItem(jobKey); } catch {} setErro(st.erro); setGerandoClipe(false); setStatusClipe(""); return; }
      if (st.pronto) { try { localStorage.removeItem(jobKey); } catch {} setGerandoClipe(false); setStatusClipe(""); setDescClipe(""); setFalaClipe(""); router.refresh(); return; }
      if (typeof st.progresso === "number" && st.progresso > 0) setStatusClipe(`🎬 A IA está animando… ${st.progresso}%`);
    }
    // passou do tempo: mantém o job salvo (recarregar a página retoma o acompanhamento).
    setGerandoClipe(false);
    setStatusClipe("");
    setErro("O clipe está demorando bastante. Deixe a aba aberta, ou recarregue a página daqui a pouco que eu continuo acompanhando — ele não se perde.");
  }
  async function handleGerarClipe() {
    setErro(null);
    setGerandoClipe(true);
    setStatusClipe("🎬 Preparando o mascote…");
    const ini = await gerarClipeMascote(marcaId, descClipe.trim() || undefined, durClipe, fundoClipe, fundoFoto || undefined, falaClipe.trim() || undefined, ehAventura).catch(() => ({ ok: false as const, erro: "Não consegui iniciar agora." }));
    if (!ini.ok) { setErro(ini.erro); setGerandoClipe(false); setStatusClipe(""); return; }
    await acompanharClipe(ini.jobId);
  }
  // Ao abrir a aba: se havia um clipe sendo gerado (guardado no navegador), RETOMA o acompanhamento.
  useEffect(() => {
    let job = "";
    try { job = localStorage.getItem(jobKey) || ""; } catch {}
    if (job) { setSubAba("vida"); acompanharClipe(job); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function handleExcluirClipe(url: string) {
    setErro(null);
    setProc(url);
    startTransition(async () => {
      const r = await excluirClipeMascote(marcaId, url);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Publica o clipe no Instagram (Reels/Story), em 2 fases (o vídeo processa na Meta ~1min): cria o
  // container e fica consultando até publicar. Cada chamada é curta (não estoura o limite de 60s).
  async function postarClipe(url: string, tipo: "reels" | "story") {
    setPostandoClipe(true); setResultadoPost(null);
    const prep = await prepararPostClipe(marcaId, url, tipo).catch(() => ({ ok: false as const, erro: "Não consegui preparar o post." }));
    if (!prep.ok) { setPostandoClipe(false); setResultadoPost({ tipo: "erro", txt: prep.erro }); return; }
    for (let i = 0; i < 30; i++) { // ~2,5 min
      await new Promise((r) => setTimeout(r, 5000));
      const c = await concluirPostClipe(marcaId, prep.containerId).catch(() => null);
      if (!c) continue;
      if (!c.ok) { setPostandoClipe(false); setResultadoPost({ tipo: "erro", txt: c.erro }); return; }
      if (c.pronto) {
        setPostandoClipe(false);
        setResultadoPost({ tipo: "ok", txt: tipo === "story" ? "Story publicado no Instagram!" : "Reels publicado no Instagram!", link: c.permalink });
        setConfirmPost(null);
        return;
      }
    }
    setPostandoClipe(false);
    setResultadoPost({ tipo: "erro", txt: "O vídeo ainda está processando no Instagram. Tente de novo em 1 minuto." });
  }
  function handleRemoverFundo() {
    if (!mascoteUrl) return;
    setErro(null);
    setProc("fundo");
    startTransition(async () => {
      const r = await removerFundoMascote(marcaId, mascoteUrl);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Baixa o PNG do mascote. No celular abre o compartilhar (salvar nas Fotos); no PC baixa direto.
  const [baixandoMascote, setBaixandoMascote] = useState(false);
  async function baixarMascoteImg() {
    if (!mascoteUrl) return;
    setBaixandoMascote(true);
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: unknown) => Promise<void> };
    try {
      const resp = await fetch(mascoteUrl);
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const file = new File([blob], "mascote.png", { type: "image/png" });
      if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
        try { await nav.share({ files: [file], title: "Mascote" }); return; }
        catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
      }
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = "mascote.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
    } catch {
      try { window.open(mascoteUrl, "_blank"); } catch {}
    } finally {
      setBaixandoMascote(false);
    }
  }
  function handleExcluir(url: string) {
    setErro(null);
    setProc(url);
    startTransition(async () => {
      const r = await excluirMascoteArte(marcaId, url);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }

  // Fundo quadriculado (mostra que o PNG é transparente).
  const xadrez = {
    backgroundColor: "#2a2a2a",
    backgroundImage:
      "linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)",
    backgroundSize: "22px 22px",
    backgroundPosition: "0 0, 0 11px, 11px -11px, -11px 0",
  } as const;

  return (
    <div>
      {ampliada && (
        <div onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div style={xadrez} className="rounded-lg border border-linha">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada} alt="Mascote" className="h-auto max-h-[85vh] w-auto max-w-[90vw]" />
          </div>
          <button onClick={() => setAmpliada(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-4 sm:p-5">
        <p className="text-sm font-semibold text-white">🦸 Estúdio do Mascote</p>
        <p className="mt-1 text-xs text-muted">
          Crie o mascote da marca em <strong className="text-white/80">3D fofo</strong>. Você gera opções, escolhe uma e ela vira o <strong className="text-white/80">mascote oficial</strong> — sempre o mesmo, pra usar nos posts e vídeos. É a base perfeita pra fazer ele em 3D depois.
        </p>
      </div>

      {erro && <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

      {/* SUB-ABAS: separa Criar/Escolher o mascote · Ficha 3D · Dar vida (vídeos). Ficha e Dar vida
          só aparecem quando já existe um mascote oficial escolhido. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {([
          { id: "criar", rotulo: "🦸 Meu mascote" },
          ...(mascoteUrl ? [{ id: "ficha", rotulo: "🧊 Ficha 3D" }, { id: "vida", rotulo: "🎬 Dar vida" }] : []),
        ] as { id: "criar" | "ficha" | "vida"; rotulo: string }[]).map((t) => (
          <button key={t.id} type="button" onClick={() => setSubAba(t.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${subAba === t.id ? "bg-[#7c3aed] text-white" : "border border-linha text-muted hover:text-white"}`}>{t.rotulo}</button>
        ))}
      </div>

      {/* ===== SUB-ABA: MEU MASCOTE (criar/escolher) ===== */}
      {subAba === "criar" && (<>
      {/* Mascote oficial atual */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Mascote oficial da marca</p>
        {mascoteUrl ? (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setAmpliada(mascoteUrl)} style={xadrez} className="overflow-hidden rounded-xl border-2 border-[#7c3aed]" title="Ampliar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mascoteUrl} alt="Mascote oficial" className="h-48 w-auto object-contain" />
            </button>
            <div className="flex flex-col gap-2">
              <span className="rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">✓ Esse é o mascote ativo</span>
              <button type="button" onClick={handleRemoverFundo} disabled={isPending} title="Tira o fundo (deixa transparente) pra colar limpo nos posts" className="rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">{proc === "fundo" ? "🪄 Tirando o fundo…" : "🪄 Deixar fundo transparente"}</button>
              <button type="button" onClick={baixarMascoteImg} disabled={baixandoMascote} title="Baixar a imagem do mascote (PNG com fundo transparente)" className="rounded-md border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed] hover:bg-[#7c3aed]/25 disabled:opacity-50">{baixandoMascote ? "⬇ Baixando…" : "⬇ Baixar imagem"}</button>
              <button type="button" onClick={handleRemover} disabled={isPending} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">Tirar mascote ativo</button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-linha bg-preto-card p-6 text-center text-sm text-muted">
            Ainda não tem mascote escolhido. Gere opções abaixo e toque na que você mais gostar. 👇
          </div>
        )}
      </div>

      {/* Imagem de referência (opcional) — a IA cria o mascote baseado nela */}
      <div className="mb-3">
        <p className="text-xs text-muted">Imagem de referência <span className="text-muted/70">(opcional — um rascunho ou inspiração; a IA cria o mascote baseado nela)</span></p>
        {referenciaUrl ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={referenciaUrl} alt="Referência" className="h-20 w-20 rounded-lg border border-linha object-cover" />
              <div className="flex flex-col gap-2">
                <button type="button" onClick={handleUsarReferencia} disabled={isPending} className="rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">✅ Usar esta imagem como mascote</button>
                <button type="button" onClick={() => setReferenciaUrl("")} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white">Remover referência</button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted/70">Use direto a sua imagem (sem a IA recriar) — ou gere versões 3D baseadas nela no botão abaixo.</p>
          </>
        ) : (
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border border-linha px-3 py-2 text-xs text-muted transition hover:border-[#7c3aed] hover:text-white">
            {subindoRef ? "Enviando…" : "📎 Enviar imagem de referência"}
            <input type="file" accept="image/*" className="hidden" disabled={subindoRef} onChange={(e) => handleUploadRef(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* Descrição do mascote (opcional) */}
      <label className="mb-3 block text-xs text-muted">
        Descreva seu mascote <span className="text-muted/70">(opcional — se deixar vazio, a IA sugere conceitos variados)</span>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ex: um dragãozinho verde fofo com uma coroa e capa vermelha, segurando um balão"
          className="input-base mt-1 resize-y"
        />
        <span className="mt-0.5 block text-[10px] text-muted/70">Quando você descreve, a IA cria 3 versões da SUA ideia (variando a pose).</span>
      </label>

      {/* Gerar opções */}
      <button
        type="button"
        onClick={handleGerar}
        disabled={gerando || isPending}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {gerando ? "🎨 Criando opções… (uns segundos)" : descricao.trim() || referenciaUrl ? "✨ Gerar meu mascote" : mascotes.length ? "✨ Gerar mais opções" : "✨ Gerar opções de mascote"}
      </button>

      {/* Biblioteca de opções */}
      {mascotes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Suas opções — toque pra escolher o oficial</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mascotes.map((url) => {
              const ativo = url === mascoteUrl;
              return (
                <div key={url} className={`relative flex flex-col overflow-hidden rounded-xl border ${ativo ? "border-[#7c3aed] ring-2 ring-[#7c3aed]/50" : "border-linha"}`}>
                  <button type="button" onClick={() => handleExcluir(url)} disabled={isPending} title="Excluir esta opção" className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/55 px-2 py-0.5 text-sm font-bold text-red-300 transition hover:bg-red-900/70 hover:text-white disabled:opacity-40">✕</button>
                  <button type="button" onClick={() => setAmpliada(url)} style={xadrez} className="block" title="Ampliar">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Opção de mascote" className="h-44 w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEscolher(url)}
                    disabled={isPending || ativo}
                    className={`py-2 text-xs font-semibold transition disabled:opacity-60 ${ativo ? "bg-[#7c3aed]/20 text-[#c7b2ff]" : "bg-preto-card text-muted hover:bg-[#7c3aed] hover:text-white"}`}
                  >
                    {ativo ? "✓ Oficial" : proc === url ? "Salvando…" : "Usar este"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-muted">
        Dica: gere quantas vezes quiser até achar o mascote perfeito — as opções ficam salvas aqui. O mascote escolhido já pode entrar nos <strong className="text-white/80">posts</strong> e nos <strong className="text-white/80">vídeos</strong>.{mascoteUrl ? <> Depois, use as abas <strong className="text-white/80">🧊 Ficha 3D</strong> e <strong className="text-white/80">🎬 Dar vida</strong> aqui em cima.</> : null}
      </p>
      </>)}

      {/* ===== SUB-ABA: FICHA 3D ===== */}
      {/* FASE 4 — Ficha pro 3D (só quando há mascote oficial) */}
      {subAba === "ficha" && mascoteUrl && (
        <div className="mt-7 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">🧊 Ficha pro 3D <span className="ml-1 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c7b2ff]">pra vender nas festas</span></p>
          <p className="mt-1 text-xs text-muted">
            Gera uma <strong className="text-white/80">prancha de referência</strong> do mascote em 3 vistas — <strong className="text-white/80">frente, lado e costas</strong>. É o material que um artista ou serviço de 3D usa pra modelar o boneco.
          </p>

          {erro && <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

          {fichaUrls.length > 0 && (
            <div className={`mt-3 grid gap-3 ${fichaUrls.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
              {fichaUrls.map((url, i) => {
                // Ficha única = as 3 vistas numa imagem só (mantém a coroa igual entre elas).
                const rotulo = fichaUrls.length === 1 ? "Ficha — frente, lado e costas" : (FICHA_LABELS[i] || `Vista ${i + 1}`);
                const nomeArquivo = fichaUrls.length === 1 ? "mascote-ficha-3d.png" : `mascote-${(FICHA_LABELS[i] || `vista-${i + 1}`).toLowerCase()}.png`;
                return (
                  <div key={url} className="overflow-hidden rounded-lg border border-linha">
                    <button type="button" onClick={() => setAmpliada(url)} className="block w-full transition hover:opacity-90" title="Ampliar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={rotulo} className="w-full object-contain" />
                    </button>
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-[11px] font-semibold text-muted">{rotulo}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" download={nomeArquivo} className="text-[11px] font-semibold text-[#c7b2ff] hover:underline">⬇ Baixar</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFicha3d}
              disabled={gerandoFicha || isPending}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {gerandoFicha ? "🧊 Criando a ficha… (uns segundos)" : fichaUrls.length ? "🔄 Gerar de novo" : "🧊 Gerar ficha pro 3D"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted/70">A IA desenha as 3 vistas (frente, lado e costas) numa <strong className="text-white/70">imagem só</strong> — assim a coroa/bandeira fica igual entre elas. É uma referência pro 3D, não a peça final. A bandeira sai branca (o logo de verdade o 3D coloca depois).</p>
        </div>
      )}

      {/* ===== SUB-ABA: DAR VIDA (vídeos/aventuras) ===== */}
      {/* FASE 5 — DAR VIDA: anima o mascote com IA de vídeo (só quando há mascote oficial) */}
      {subAba === "vida" && mascoteUrl && (
        <div className="mt-7 rounded-xl border border-[#ec4899]/40 bg-[#ec4899]/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">🎬 Dar vida ao mascote <span className="ml-1 rounded-full border border-[#ec4899]/40 bg-[#ec4899]/15 px-2 py-0.5 text-[10px] font-semibold text-[#f9a8d4]">novo · beta</span></p>
          <p className="mt-1 text-xs text-muted">
            A IA <strong className="text-white/80">anima o seu mascote</strong> num clipe curto — <strong className="text-white/80">já com música e efeitos</strong> 🎵. Escolha uma ação (ou descreva), gere, e depois dá pra <strong className="text-white/80">postar como Story ou Reels</strong>.
          </p>

          {/* ações prontas — 1 toque preenche a descrição (fundo parado, o mascote se mexe) */}
          <label className="mt-3 block text-[10px] font-semibold text-muted">Ação rápida <span className="font-normal text-muted/70">(o mascote se mexe num fundo parado)</span></label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ACOES_CLIPE.map((a) => (
              <button key={a.nome} type="button" disabled={gerandoClipe} onClick={() => { setDescClipe(a.desc); setEhAventura(false); }} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${descClipe === a.desc && !ehAventura ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                {a.emoji} {a.nome}
              </button>
            ))}
          </div>

          {/* aventuras — cena animada de verdade (o cenário ganha vida) */}
          <label className="mt-3 block text-[10px] font-semibold text-muted">🎬 Aventuras <span className="font-normal text-muted/70">(cena animada — o cenário ganha vida)</span></label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AVENTURAS_CLIPE.map((a) => (
              <button key={a.nome} type="button" disabled={gerandoClipe} onClick={() => { setDescClipe(a.desc); setEhAventura(true); }} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${descClipe === a.desc && ehAventura ? "border-[#a855f7] bg-[#a855f7]/25 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                {a.emoji} {a.nome}
              </button>
            ))}
          </div>

          {/* liga/desliga o modo aventura (vale também pro texto que você escrever) */}
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" checked={ehAventura} disabled={gerandoClipe} onChange={(e) => setEhAventura(e.target.checked)} className="h-3.5 w-3.5 accent-[#a855f7]" />
            <span>🎬 <strong className="text-white/80">Modo aventura</strong> — deixa a IA criar uma cena animada ao redor do castelinho (em vez de fundo parado).</span>
          </label>

          <textarea
            value={descClipe}
            onChange={(e) => setDescClipe(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Ex: acenando feliz na porta do buffet, dando boas-vindas"
            className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[13px] leading-relaxed text-white placeholder:text-muted/40 focus:border-[#ec4899] focus:outline-none"
          />

          {/* voz do mascote — o que ele FALA (lip sync) */}
          <label className="mt-3 block text-[10px] font-semibold text-muted">🗣️ O que o mascote fala? <span className="font-normal text-muted/70">(opcional — se preencher, ele fala com a boquinha mexendo)</span></label>
          <input
            type="text"
            value={falaClipe}
            onChange={(e) => setFalaClipe(e.target.value)}
            maxLength={160}
            disabled={gerandoClipe}
            placeholder="Ex: Venha comemorar sua festa aqui no Castelo!"
            className="mt-1 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[13px] leading-relaxed text-white placeholder:text-muted/40 focus:border-[#ec4899] focus:outline-none disabled:opacity-50"
          />
          <p className="mt-1 text-[10px] leading-snug text-muted/70">A IA cria a voz na hora e sincroniza com a boca. Frases curtas ({durClipe}s dá pra ~{Math.max(4, durClipe * 2)} palavras) saem melhor. Deixe vazio pra ter só uma musiquinha.</p>

          {/* VOZ DEFINIDA do castelinho — escolha uma vez, vale pra todos os clipes com fala */}
          <div className="mt-3 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 p-2.5">
            <p className="text-[10px] font-semibold text-white">🎙️ Voz do castelinho <span className="font-normal text-muted/70">(vale pra todos os clipes com fala)</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {VOZES_CLIPE.map((v) => (
                <button key={v.nome} type="button" disabled={salvandoVoz || gerandoClipe} onClick={() => salvarVoz(v.desc)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${vozClipe === v.desc ? "border-[#a855f7] bg-[#a855f7]/25 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{v.nome}</button>
              ))}
            </div>
            <input type="text" value={vozClipe} onChange={(e) => setVozClipe(e.target.value)} maxLength={300} disabled={salvandoVoz || gerandoClipe} placeholder="Ou descreva a voz (ex: menino animado, vozinha fofa e engraçada)" className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-1.5 text-[12px] text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50" />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="button" disabled={salvandoVoz || gerandoClipe} onClick={() => salvarVoz(vozClipe)} className="rounded-md border border-[#a855f7]/50 bg-[#a855f7]/15 px-3 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#a855f7]/25 disabled:opacity-50">{salvandoVoz ? "Salvando…" : "💾 Salvar voz"}</button>
              {vozClipe && <button type="button" disabled={salvandoVoz || gerandoClipe} onClick={() => salvarVoz("")} className="text-[11px] font-semibold text-muted transition hover:text-white disabled:opacity-40">voltar ao padrão</button>}
              {vozSalva && <span className="text-[11px] font-semibold text-emerald-400">✓ Voz salva!</span>}
            </div>
          </div>

          {/* duração do clipe */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted">Duração:</span>
            {[4, 8, 12].map((s) => (
              <button key={s} type="button" disabled={gerandoClipe} onClick={() => setDurClipe(s)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${durClipe === s ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{s}s</button>
            ))}
            <span className="text-[10px] text-muted/60">(mais longo = mais demorado)</span>
          </div>

          {/* fundo do clipe: cor OU foto do buffet */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-muted">Fundo:</span>
            {FUNDOS_CLIPE.map((f) => (
              <button
                key={f.cor}
                type="button"
                disabled={gerandoClipe}
                onClick={() => { setFundoClipe(f.cor); setFundoFoto(""); }}
                title={f.nome}
                aria-label={`Fundo ${f.nome}`}
                className={`h-7 w-7 rounded-full border-2 transition disabled:opacity-40 ${!fundoFoto && fundoClipe.toUpperCase() === f.cor.toUpperCase() ? "border-[#ec4899] ring-2 ring-[#ec4899]/40" : "border-white/20 hover:border-white/50"}`}
                style={{ background: f.cor }}
              />
            ))}
            <button type="button" disabled={gerandoClipe} onClick={abrirSeletorFotos} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${fundoFoto ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>📷 Foto do buffet</button>
          </div>
          {fundoFoto && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-[#ec4899]/30 bg-[#ec4899]/5 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fundoFoto} alt="" className="h-12 w-12 rounded object-cover" />
              <span className="text-[11px] text-muted">Fundo: foto do seu espaço. <button type="button" onClick={() => setFundoFoto("")} className="font-semibold text-[#f9a8d4] hover:underline">trocar por cor</button></span>
            </div>
          )}

          {clipesUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {clipesUrls.map((url) => (
                <div key={url} className="overflow-hidden rounded-lg border border-linha bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={url} controls playsInline loop className="aspect-[9/16] w-full bg-black object-contain" />
                  <div className="flex flex-wrap items-center gap-1.5 px-2 py-2">
                    <button type="button" onClick={() => { setResultadoPost(null); setConfirmPost({ url, tipo: "story" }); }} disabled={postandoClipe} className="rounded-md bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-2 py-1 text-[10px] font-bold text-white transition hover:brightness-110 disabled:opacity-50">📲 Story</button>
                    <button type="button" onClick={() => { setResultadoPost(null); setConfirmPost({ url, tipo: "reels" }); }} disabled={postandoClipe} className="rounded-md bg-[#C13584] px-2 py-1 text-[10px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">🎬 Reels</button>
                    <a href={url} target="_blank" rel="noopener noreferrer" download className="ml-auto text-[10px] font-semibold text-[#f9a8d4] hover:underline">⬇</a>
                    <button type="button" onClick={() => handleExcluirClipe(url)} disabled={proc === url || isPending} className="text-[10px] font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-40">{proc === url ? "…" : "✕"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGerarClipe}
              disabled={gerandoClipe || isPending}
              className="rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {gerandoClipe ? "🎬 Animando…" : clipesUrls.length ? "🎬 Gerar outro clipe" : "🎬 Gerar clipe animado"}
            </button>
            {gerandoClipe && statusClipe && <span className="text-[11px] font-semibold text-[#f9a8d4]">{statusClipe}</span>}
          </div>
          {gerandoClipe && <p className="mt-2 text-[10px] leading-snug text-muted/70">⏳ A animação por IA leva de <strong className="text-white/70">1 a 2 minutos</strong> — pode deixar essa tela aberta. Não feche enquanto estiver "Animando…".</p>}
          {!gerandoClipe && <p className="mt-2 text-[10px] leading-snug text-muted/70">Cada clipe é gerado por IA de vídeo (pode variar um pouco). Se não gostar, é só gerar de novo com outra descrição.</p>}
        </div>
      )}

      {/* SELETOR de foto do buffet pro fundo do clipe */}
      {abrirFotos && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setAbrirFotos(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-linha bg-preto-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-white">📷 Escolha a foto do fundo</p>
              <button type="button" onClick={() => setAbrirFotos(false)} className="text-sm text-muted hover:text-white">✕</button>
            </div>
            <p className="mb-3 text-[11px] text-muted">O mascote vai aparecer animado na frente dessa foto. As fotos do <strong className="text-white/80">Espaço</strong> costumam ficar melhores (sem crianças no fundo).</p>
            {carregandoFotos ? (
              <p className="py-8 text-center text-xs text-muted">Carregando suas fotos…</p>
            ) : fotosBanco.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">Nenhuma foto no acervo ainda. Suba fotos na aba <strong className="text-white/80">🖼️ Imagens</strong>.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fotosBanco.map((f) => (
                  <button key={f.id} type="button" onClick={() => { setFundoFoto(f.url); setAbrirFotos(false); }} className="overflow-hidden rounded-lg border-2 border-transparent transition hover:border-[#ec4899]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO de postar o clipe (Reels/Story) */}
      {confirmPost && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => !postandoClipe && setConfirmPost(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-bold text-white">{confirmPost.tipo === "story" ? "📲 Postar como Story agora?" : "🎬 Postar como Reels agora?"}</p>
            <p className="mt-2 text-xs text-muted">Publica o clipe do mascote <strong className="text-white">AGORA</strong> no Instagram da marca. A Meta processa o vídeo primeiro, então pode levar até <strong className="text-white">1 minuto</strong>. ⏳{confirmPost.tipo === "story" ? " O Story some em 24h." : ""}</p>
            {resultadoPost?.tipo === "erro" && <p className="mt-2 rounded-md border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{resultadoPost.txt}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmPost(null)} disabled={postandoClipe} className="flex-1 rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-muted transition hover:text-white disabled:opacity-50">Cancelar</button>
              <button onClick={() => postarClipe(confirmPost.url, confirmPost.tipo)} disabled={postandoClipe} className="flex-1 rounded-lg bg-[#C13584] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{postandoClipe ? "Postando… ⏳" : "Sim, postar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* SUCESSO do post */}
      {resultadoPost?.tipo === "ok" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setResultadoPost(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-preto-card p-5 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 text-sm font-bold text-white">{resultadoPost.txt}</p>
            {resultadoPost.link && <a href={resultadoPost.link} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-[#C13584] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90">Ver no Instagram ↗</a>}
            <button onClick={() => setResultadoPost(null)} className="mt-3 block w-full rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-muted transition hover:text-white">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
