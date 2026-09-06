"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { gerarMascote, definirMascote, removerMascote, excluirMascoteArte, usarImagemComoMascote, removerFundoMascote, gerarFicha3d, gerarClipeMascote, statusClipeMascote, excluirClipeMascote, prepararPostClipe, concluirPostClipe, definirVozMascote, ouvirAmostraVoz, definirAberturaMascote, definirFechoMascote, escreverCenasHistoria, emendarHistoriaMascote, type CenaHistoria } from "@/app/actions/mascote";
import { imagensDoBanco } from "@/app/actions/imagens";
import { MODOS_CLIPE, CENAS_CLIPE, modoClipe, MODELOS_HISTORIA, type ModoClipe } from "@/lib/mascote-modos";

// Ações prontas pro clipe do mascote (1 toque preenche a descrição, sem digitar).
const ACOES_CLIPE = [
  { emoji: "👋", nome: "Acenar", desc: "acenando feliz com as duas mãos, dando boas-vindas, sorrindo" },
  { emoji: "🎉", nome: "Pular", desc: "pulando de alegria, animado e sorrindo" },
  { emoji: "🏰", nome: "Apresentar", desc: "abrindo os bracinhos apresentando o espaço, com orgulho e alegria" },
  { emoji: "😘", nome: "Beijo", desc: "soprando um beijo carinhoso e piscando o olho" },
  { emoji: "💃", nome: "Dançar", desc: "dançando animado, balançando o corpo com alegria" },
  { emoji: "👍", nome: "Joinha", desc: "fazendo joinha (positivo) com as duas mãos e piscando" },
];

// 🎙️ VOZES do castelinho — o dono escolhe uma e ela fica salva, usada em todos os clipes com fala.
// Vozes do castelinho — usam o MESMO motor bom dos vídeos do buffet (Google Gemini-TTS): cada uma
// é uma VOZ (vozId) + uma DIREÇÃO em português (é a direção que dá a personalidade de desenho).
// `desc` é o texto que fica salvo e vira a dica de voz no vídeo (Sora).
const BASE_CARTOON = "Fale como um PERSONAGEM DE DESENHO ANIMADO infantil (estilo Disney/Pixar): MUITO expressivo, exagerado, teatral e engraçado, cheio de energia, alegria e emoção, com sorriso na voz. Nada de locutor sério. É um mascote fofo de festa infantil falando com crianças.";
const VOZES_CLIPE = [
  { nome: "🎬 Desenho animado", vozId: "Leda", direcao: BASE_CARTOON, desc: "de personagem de desenho animado infantil, expressiva e exagerada, alegre e engraçada" },
  { nome: "🧒 Menino animado", vozId: "Puck", direcao: "Fale como um MENINO animado e brincalhão de uns 8 anos, cheio de energia e alegria, rindo à toa, super empolgado, como um personagem infantil de desenho animado.", desc: "de menino animado e brincalhão, alegre, tom médio-agudo" },
  { nome: "👧 Menininha fofa", vozId: "Aoede", direcao: "Fale como uma MENININHA fofa e doce, carinhosa e simpática, tom agudo e meiguinho, como uma personagem infantil querida de desenho animado.", desc: "de menininha fofa e doce, carinhosa, tom agudo" },
  { nome: "🧚 Fadinha mágica", vozId: "Zephyr", direcao: "Fale como uma FADINHA MÁGICA de conto de fadas: encantada, doce e brilhante, tom bem agudo e sonhador, cheia de magia e ternura, como uma princesa de desenho animado falando com crianças.", desc: "de fadinha mágica encantada, doce e brilhante, tom bem agudo e sonhador" },
  { nome: "👸 Princesinha", vozId: "Achernar", direcao: "Fale como uma PRINCESINHA delicada e gentil de desenho animado: doce, elegante e sonhadora, com ternura e um sorriso encantado, falando com crianças.", desc: "de princesinha delicada e gentil, doce e sonhadora" },
  { nome: "🤴 Reizinho fofo", vozId: "Orus", direcao: "Fale como um REIZINHO/PRÍNCIPE criança fofo: nobre e importante, mas simpático, brincalhão e cheio de alegria, como um personagem de desenho animado.", desc: "de reizinho fofo, nobre mas simpático e brincalhão" },
  { nome: "🧙 Mago divertido", vozId: "Rasalgethi", direcao: "Fale como um MAGO divertido de desenho animado: misterioso e sábio, mas engraçado, teatral e cheio de firulas mágicas, encantando as crianças.", desc: "de mago divertido, misterioso e sábio, mas engraçado e teatral" },
  { nome: "🦁 Leãozinho valente", vozId: "Alnilam", direcao: "Fale como um LEÃOZINHO REI valente e animado de desenho animado: corajoso, decidido e cheio de energia, mas fofo e simpático com as crianças.", desc: "de leãozinho valente e animado, corajoso e decidido, mas fofo" },
  { nome: "🐲 Dragãozinho fofo", vozId: "Algieba", direcao: "Fale como um DRAGÃOZINHO amigável e fofo de desenho animado: meio atrapalhado e engraçado, gentil e brincalhão, com voz macia e simpática.", desc: "de dragãozinho amigável e fofo, atrapalhado e engraçado, gentil" },
  { nome: "🦸 Super-herói", vozId: "Sadachbia", direcao: "Fale como um SUPER-HERÓI infantil de desenho animado: empolgado, valente e cheio de energia, anunciando com garra e alegria, como quem salva a festa.", desc: "de super-herói infantil, empolgado e valente, cheio de energia" },
  { nome: "🐰 Coelhinho saltitante", vozId: "Callirrhoe", direcao: "Fale como um COELHINHO saltitante de desenho animado: rápido, descontraído e muito brincalhão, cheio de gracinhas e energia fofa.", desc: "de coelhinho saltitante, rápido, descontraído e brincalhão" },
  { nome: "🤖 Robôzinho divertido", vozId: "Iapetus", direcao: "Fale como um ROBÔZINHO divertido de desenho animado: voz clarinha e engraçada, meio mecânica e fofa, animada e simpática com as crianças.", desc: "de robôzinho divertido, clarinha, meio mecânica e fofa, animada" },
  { nome: "👵 Vovó querida", vozId: "Gacrux", direcao: "Fale como uma VOVÓ querida e engraçada de desenho animado: carinhosa, acolhedora e bem-humorada, com aquele jeitinho doce de contar história.", desc: "de vovó querida e engraçada, carinhosa, acolhedora e bem-humorada" },
  { nome: "😎 Amigo descolado", vozId: "Zubenelgenubi", direcao: "Fale como um personagem JOVEM e DESCOLADO de desenho animado: informal, engraçado e gente-boa, cheio de gíria alegre e simpatia com a criançada.", desc: "de personagem jovem e descolado, informal, engraçado e gente-boa" },
  { nome: "🎪 Palhaço animador", vozId: "Fenrir", direcao: "Fale como um PALHAÇO ANIMADOR de festa infantil: escandaloso, engraçado e MUITO animado, showman de picadeiro chamando a criançada, exagerado, divertido e cheio de graça.", desc: "de palhaço animador de festa, escandalosa e engraçada, muito animada" },
  { nome: "🦣 Vozão engraçado", vozId: "Charon", direcao: "Fale com voz GRAVE, bonachona e engraçada, como um gigante gentil e bem-humorado de desenho animado: lento, cômico, simpático e acolhedor.", desc: "grave, bonachona e engraçada, tipo gigante gentil de desenho" },
];

const FICHA_LABELS = ["Frente", "Lado", "Costas"];

// Um clipinho de SILÊNCIO (WAV ~0,1s) só pra "destravar" o áudio no iPhone/iPad dentro do toque —
// depois disso o Safari deixa a amostra tocar mesmo chegando depois de uma espera.
const SILENCIO_WAV = (() => {
  const sr = 8000, n = 800; // 0,1s mono 16-bit
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, n * 2, true); // amostras já são zero (silêncio)
  let bin = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${typeof btoa !== "undefined" ? btoa(bin) : ""}`;
})();

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
  abertura,
  fecho,
}: {
  marcaId: string;
  mascoteUrl: string; // mascote oficial atual ("" = nenhum)
  mascotes: string[]; // biblioteca de opções geradas
  ficha3d?: string; // ficha do personagem (frente/lado/costas) pro 3D ("" = não gerada)
  clipes?: string[]; // clipes animados (IA de vídeo) já gerados
  corMarca?: string; // cor primária da marca (opção de fundo do clipe)
  voz?: string; // voz definida do castelinho ("" = padrão)
  abertura?: string; // clipe usado no começo dos Reels das festas ("" = nenhum)
  fecho?: string; // clipe usado no fim dos Reels das festas ("" = nenhum)
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
  const [subAba, setSubAba] = useState<"criar" | "ficha" | "vida" | "voz">("criar"); // sub-abas do estúdio
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
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [tomVoz, setTomVoz] = useState(1.15); // quão agudo/cartoon (1.0 = natural; 1.15 = desenho; 1.3 = bem agudo)
  const [fraseVoz, setFraseVoz] = useState(""); // frase de teste da amostra (própria da aba Voz)
  // Um ÚNICO <audio> reaproveitado. No iPhone/iPad o Safari só deixa tocar áudio se o player já foi
  // "destravado" por um toque; como a amostra chega depois de uma espera, destravamos no clique.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Descobre a VOZ (Google) + a DIREÇÃO da voz escolhida: se bate com um preset, usa o dele; se o
  // dono escreveu à mão, usa uma voz padrão fofa e monta a direção com o texto dele.
  function resolverVoz(): { vozId: string; direcao: string } {
    const p = VOZES_CLIPE.find((v) => v.desc === vozClipe);
    if (p) return { vozId: p.vozId, direcao: p.direcao };
    const txt = vozClipe.trim();
    if (txt) return { vozId: "Leda", direcao: `Fale com uma voz ${txt}. ${BASE_CARTOON}` };
    return { vozId: VOZES_CLIPE[0].vozId, direcao: VOZES_CLIPE[0].direcao };
  }
  async function ouvirVoz() {
    setErro(null); setOuvindoVoz(true);
    // DESTRAVA o áudio dentro do gesto do toque (senão o iOS bloqueia quando a amostra chega depois).
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    try { audio.src = SILENCIO_WAV; audio.play().catch(() => {}); } catch {}
    const { vozId, direcao } = resolverVoz();
    const r = await ouvirAmostraVoz(marcaId, vozId, direcao, fraseVoz.trim() || undefined, tomVoz).catch(() => ({ ok: false as const, erro: "Não consegui gerar a amostra." }));
    setOuvindoVoz(false);
    if (!r.ok) { setErro(r.erro); return; }
    try {
      audio.src = r.audio;
      await audio.play();
    } catch {
      setErro("O aparelho bloqueou o áudio. Toque em 🔊 Ouvir amostra de novo.");
    }
  }
  // MODO do clipe (historia/divulgacao/abertura/fecho/livre) — define papel, duração e sugestões.
  const [modoSel, setModoSel] = useState<ModoClipe>("historia");
  const [descClipe, setDescClipe] = useState(MODOS_CLIPE[0].acaoSugestao);
  const [falaClipe, setFalaClipe] = useState(MODOS_CLIPE[0].falaSugestao); // o que o mascote FALA ("" = só música)
  const [durClipe, setDurClipe] = useState(MODOS_CLIPE[0].seg); // duração do clipe: 4 | 8 | 12
  // CENÁRIO: "" = cor sólida · id de CENAS_CLIPE (salao, bolo…) · "foto" = foto do buffet (fundoFoto).
  const [cenaSel, setCenaSel] = useState<string>("salao");
  const [fundoClipe, setFundoClipe] = useState("#FFFFFF"); // cor do fundo (quando cenaSel = "")
  const [fundoFoto, setFundoFoto] = useState(""); // foto do buffet como fundo (quando cenaSel = "foto")
  // Escolhe um MODO: ajusta a duração e joga as sugestões (editáveis) de fala/ação daquele modo.
  function escolherModo(id: ModoClipe) {
    setModoSel(id);
    const m = modoClipe(id);
    setDurClipe(m.seg);
    setFalaClipe(m.falaSugestao);
    setDescClipe(m.acaoSugestao);
  }
  // Abertura/fecho dos Reels (marca) — qual clipe está definido pra cada um.
  const [aberturaSel, setAberturaSel] = useState(abertura ?? "");
  const [fechoSel, setFechoSel] = useState(fecho ?? "");
  async function alternarAbertura(url: string) {
    const novo = aberturaSel === url ? "" : url;
    setAberturaSel(novo);
    await definirAberturaMascote(marcaId, novo).catch(() => {});
  }
  async function alternarFecho(url: string) {
    const novo = fechoSel === url ? "" : url;
    setFechoSel(novo);
    await definirFechoMascote(marcaId, novo).catch(() => {});
  }
  // HISTÓRIA EM CENAS (modo "história"): a Bia escreve N cenas (ação + fala); a tela gera um clipe
  // por cena e o motor emenda tudo num vídeo só (passa dos 12s do clipe único).
  const [galeriaAberta, setGaleriaAberta] = useState(false); // galeria de clipes recolhida por padrão (deixa o botão de gerar mais pra cima)
  const [briefingHist, setBriefingHist] = useState(""); // o tema que o dono dá pra Bia
  const [tipoHist, setTipoHist] = useState(MODELOS_HISTORIA[0].id); // categoria de modelos aberta
  const [numCenas, setNumCenas] = useState(3); // quantas cenas (2 a 4)
  const [durCena, setDurCena] = useState(8); // duração de CADA cena
  const [cenas, setCenas] = useState<CenaHistoria[]>([]); // o roteiro em cenas
  const [escrevendoBia, setEscrevendoBia] = useState(false);
  async function biaEscreveCenas() {
    setErro(null); setEscrevendoBia(true);
    const r = await escreverCenasHistoria(marcaId, briefingHist.trim(), numCenas).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }));
    setEscrevendoBia(false);
    if (!r.ok) { setErro(r.erro); return; }
    setCenas(r.cenas);
  }
  function setCena(i: number, campo: "acao" | "fala", val: string) {
    setCenas((cs) => cs.map((c, idx) => (idx === i ? { ...c, [campo]: val } : c)));
  }
  async function gerarHistoria() {
    const cs = cenas.filter((c) => (c.acao || c.fala).trim());
    if (cs.length < 2) { setErro("Escreva pelo menos 2 cenas (ou peça pra Bia escrever)."); return; }
    setErro(null); setGerandoClipe(true);
    setStatusClipe("🎬 Preparando as cenas…");
    const usaFoto = cenaSel === "foto" && !!fundoFoto;
    const usaCena = cenaSel !== "foto" && cenaSel !== "";
    try {
      // 1) dispara um job de vídeo por cena (em paralelo — mais rápido no relógio).
      const jobs: string[] = [];
      for (let i = 0; i < cs.length; i++) {
        const ini = await gerarClipeMascote(marcaId, {
          modo: "livre",
          descricao: cs[i].acao || undefined,
          segundos: durCena,
          fundo: fundoClipe,
          fundoFotoUrl: usaFoto ? fundoFoto : undefined,
          cena: usaCena ? cenaSel : undefined,
          fala: cs[i].fala || undefined,
        }).catch(() => ({ ok: false as const, erro: "Não consegui iniciar uma cena." }));
        if (!ini.ok) { setErro(`Cena ${i + 1}: ${ini.erro}`); setGerandoClipe(false); setStatusClipe(""); return; }
        jobs.push(ini.jobId);
      }
      // 2) acompanha todas até cada uma ficar pronta (URL temporária, fora da galeria).
      const urls: string[] = new Array(jobs.length).fill("");
      for (let round = 0; round < 84; round++) { // ~14 min
        await new Promise((r) => setTimeout(r, 10000));
        let prontas = 0;
        for (let i = 0; i < jobs.length; i++) {
          if (urls[i]) { prontas++; continue; }
          const st = await statusClipeMascote(marcaId, jobs[i], false).catch(() => null);
          if (st && !st.ok) { setErro(`Cena ${i + 1}: ${st.erro}`); setGerandoClipe(false); setStatusClipe(""); return; }
          if (st && st.pronto && st.url) { urls[i] = st.url; prontas++; }
        }
        setStatusClipe(`🎬 Gerando as cenas… ${prontas}/${jobs.length} prontas`);
        if (prontas === jobs.length) break;
      }
      if (urls.some((u) => !u)) { setErro("Algumas cenas demoraram demais. Tente com menos cenas ou de novo."); setGerandoClipe(false); setStatusClipe(""); return; }
      // 3) o motor junta as cenas num vídeo só (a história vai pra galeria).
      setStatusClipe("🎬 Juntando as cenas na história…");
      const em = await emendarHistoriaMascote(marcaId, urls).catch(() => ({ ok: false as const, erro: "Não consegui juntar as cenas." }));
      if (!em.ok) { setErro(em.erro); setGerandoClipe(false); setStatusClipe(""); return; }
      setGerandoClipe(false); setStatusClipe(""); router.refresh();
    } catch {
      setErro("Não consegui gerar a história agora."); setGerandoClipe(false); setStatusClipe("");
    }
  }
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
    const usaFoto = cenaSel === "foto" && !!fundoFoto;
    const usaCena = cenaSel !== "foto" && cenaSel !== "";
    const ini = await gerarClipeMascote(marcaId, {
      modo: modoSel,
      descricao: descClipe.trim() || undefined,
      segundos: durClipe,
      fundo: fundoClipe,
      fundoFotoUrl: usaFoto ? fundoFoto : undefined,
      cena: usaCena ? cenaSel : undefined,
      fala: falaClipe.trim() || undefined,
    }).catch(() => ({ ok: false as const, erro: "Não consegui iniciar agora." }));
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

      {/* SUB-ABAS (controle segmentado): Meu mascote → Vídeos → Voz → Ficha 3D. As 3 últimas só
          aparecem quando já existe um mascote oficial (a base de tudo). */}
      <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl border border-linha bg-preto-card p-1.5 sm:flex">
        {([
          { id: "criar", ic: "🏰", rotulo: "Meu mascote" },
          ...(mascoteUrl ? [
            { id: "vida", ic: "🎬", rotulo: "Vídeos" },
            { id: "voz", ic: "🎙️", rotulo: "Voz" },
            { id: "ficha", ic: "🧊", rotulo: "Ficha 3D" },
          ] : []),
        ] as { id: "criar" | "ficha" | "vida" | "voz"; ic: string; rotulo: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubAba(t.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-1 ${subAba === t.id ? "bg-[#7c3aed] text-white shadow" : "text-muted hover:bg-white/5 hover:text-white"}`}
          >
            <span className="text-sm leading-none">{t.ic}</span> {t.rotulo}
          </button>
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

      {/* ===== SUB-ABA: VOZ (escolher / ouvir a voz do castelinho) ===== */}
      {subAba === "voz" && mascoteUrl && (
        <div className="mt-7 rounded-xl border border-[#a855f7]/40 bg-[#a855f7]/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">🎙️ Voz do castelinho</p>
          <p className="mt-1 text-xs text-muted">
            Escolha a voz do mascote e <strong className="text-white/80">ouça uma amostra</strong> antes de gerar o vídeo. A voz salva vale pra <strong className="text-white/80">todos os clipes com fala</strong>.
          </p>

          {/* 1) escolher a voz */}
          <label className="mt-4 block text-[10px] font-semibold text-muted">1. Escolha a voz</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {VOZES_CLIPE.map((v) => (
              <button key={v.nome} type="button" disabled={salvandoVoz} onClick={() => salvarVoz(v.desc)} className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40 ${vozClipe === v.desc ? "border-[#a855f7] bg-[#a855f7]/25 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{v.nome}</button>
            ))}
          </div>
          <input type="text" value={vozClipe} onChange={(e) => setVozClipe(e.target.value)} maxLength={300} disabled={salvandoVoz} placeholder="Ou descreva a voz do seu jeito (ex: menino animado e engraçado)" className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[13px] text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50" />

          {/* 2) tom de desenho (efeito de agudo por cima) */}
          <label className="mt-4 block text-[10px] font-semibold text-muted">2. Tom de desenho <span className="font-normal text-muted/70">(quanto mais agudo, mais cara de cartoon)</span></label>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {[{ n: "Natural", v: 1.0 }, { n: "Desenho", v: 1.15 }, { n: "Bem agudo", v: 1.3 }].map((t) => (
              <button key={t.n} type="button" disabled={ouvindoVoz} onClick={() => setTomVoz(t.v)} className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40 ${Math.abs(tomVoz - t.v) < 0.001 ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{t.n}</button>
            ))}
          </div>

          {/* 3) frase de teste + ouvir */}
          <label className="mt-4 block text-[10px] font-semibold text-muted">3. Frase de teste <span className="font-normal text-muted/70">(opcional)</span></label>
          <input type="text" value={fraseVoz} onChange={(e) => setFraseVoz(e.target.value)} maxLength={200} disabled={ouvindoVoz} placeholder="Ex: Venha comemorar sua festa aqui no Castelo!" className="mt-1 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[13px] text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={ouvindoVoz} onClick={ouvirVoz} className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">{ouvindoVoz ? "🔊 Gerando amostra…" : "🔊 Ouvir amostra"}</button>
            <button type="button" disabled={salvandoVoz} onClick={() => salvarVoz(vozClipe)} className="rounded-lg border border-[#a855f7]/50 bg-[#a855f7]/15 px-4 py-2 text-sm font-semibold text-[#d6c6ff] transition hover:bg-[#a855f7]/25 disabled:opacity-50">{salvandoVoz ? "Salvando…" : "💾 Salvar voz"}</button>
            {vozClipe && <button type="button" disabled={salvandoVoz} onClick={() => salvarVoz("")} className="text-[12px] font-semibold text-muted transition hover:text-white disabled:opacity-40">voltar ao padrão</button>}
            {vozSalva && <span className="text-[12px] font-semibold text-emerald-400">✓ Voz salva!</span>}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted/70">🔊 A amostra usa o <strong className="text-white/70">mesmo motor de voz dos vídeos do buffet</strong> (o que soa bem). No vídeo do mascote, a voz é criada pela IA de vídeo e <strong className="text-white/70">pode soar diferente</strong> — se quiser essa voz de desenho <strong className="text-white/70">exatamente dentro do vídeo</strong>, me avise que eu preparo isso. <br />No iPhone/iPad, se não tocar de primeira, toque de novo em <strong className="text-white/70">Ouvir amostra</strong>.</p>
        </div>
      )}

      {/* ===== SUB-ABA: DAR VIDA (vídeos/aventuras) ===== */}
      {/* FASE 5 — DAR VIDA: anima o mascote com IA de vídeo (só quando há mascote oficial) */}
      {subAba === "vida" && mascoteUrl && (
        <div className="mt-7 rounded-xl border border-[#ec4899]/40 bg-[#ec4899]/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">🎬 Vídeos do mascote <span className="ml-1 rounded-full border border-[#ec4899]/40 bg-[#ec4899]/15 px-2 py-0.5 text-[10px] font-semibold text-[#f9a8d4]">novo · beta</span></p>
          <p className="mt-1 text-xs text-muted">
            A IA <strong className="text-white/80">anima o seu mascote</strong> num clipe curto — <strong className="text-white/80">com voz, música e efeitos</strong> 🎵. Escolha um <strong className="text-white/80">modo</strong>, ajuste a fala e o cenário, e gere. O castelinho sai <strong className="text-white/80">sempre igual</strong> (parte da ficha oficial).
          </p>

          {/* MODO — define o papel/roteiro, a duração e onde o clipe é usado. */}
          <label className="mt-3 block text-[10px] font-semibold text-muted">Modo do clipe</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {MODOS_CLIPE.map((m) => (
              <button key={m.id} type="button" disabled={gerandoClipe} onClick={() => escolherModo(m.id)} className={`rounded-lg border p-2 text-center transition disabled:opacity-40 ${modoSel === m.id ? "border-[#ec4899] bg-[#ec4899]/15" : "border-linha bg-preto hover:border-white/30"}`}>
                <div className="text-base leading-none">{m.ic}</div>
                <div className={`mt-1 text-[11px] font-semibold ${modoSel === m.id ? "text-[#f9a8d4]" : "text-white"}`}>{m.label}</div>
                <div className="text-[9px] leading-tight text-muted/70">{m.desc}</div>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted/70">
            {modoSel === "abertura" || modoSel === "fecho"
              ? <>🎬 Depois de gerar, <strong className="text-white/70">marque o clipe como {modoSel === "abertura" ? "Abertura" : "Fecho"}</strong> na galeria abaixo — aí ele entra sozinho no {modoSel === "abertura" ? "começo" : "fim"} dos Reels das festas.</>
              : <>📤 Vídeo pra <strong className="text-white/70">postar sozinho</strong> (Story/Reels), depois de gerar.</>}
          </p>

          {modoSel === "historia" ? (
            /* HISTÓRIA EM CENAS — a Bia escreve o roteiro; cada cena vira um clipe e a gente emenda tudo. */
            <div className="mt-3 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 p-3">
              <p className="text-[11px] font-semibold text-white">📖 Roteiro em cenas <span className="font-normal text-muted/70">(passa dos 12s)</span></p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted/70">A Bia divide a historinha em várias cenas curtas e a gente <strong className="text-white/70">emenda tudo num vídeo só</strong>. O castelinho fala em cada cena.</p>

              {/* IDEIAS PRONTAS — modelos por tipo de história; toca numa pra usar de base (e edita). */}
              <label className="mt-3 block text-[10px] font-semibold text-muted">💡 Ideias prontas <span className="font-normal text-muted/70">(toque numa pra usar de base)</span></label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MODELOS_HISTORIA.map((m) => (
                  <button key={m.id} type="button" disabled={gerandoClipe || escrevendoBia} onClick={() => setTipoHist(m.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${tipoHist === m.id ? "border-[#a855f7] bg-[#a855f7]/20 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{m.ic} {m.tipo}</button>
                ))}
              </div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {(MODELOS_HISTORIA.find((m) => m.id === tipoHist)?.opcoes ?? []).map((o) => {
                  const ativa = briefingHist.trim() === o.briefing;
                  return (
                    <button key={o.titulo} type="button" disabled={gerandoClipe || escrevendoBia} onClick={() => { setBriefingHist(o.briefing); setNumCenas(o.cenas); }} className={`rounded-lg border p-2 text-left transition disabled:opacity-40 ${ativa ? "border-[#a855f7] bg-[#a855f7]/15" : "border-linha bg-preto hover:border-white/30"}`}>
                      <div className={`text-[11px] font-semibold ${ativa ? "text-[#d6c6ff]" : "text-white"}`}>{o.titulo} <span className="font-normal text-muted/60">· {o.cenas} cenas</span></div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted/70">{o.briefing}</div>
                    </button>
                  );
                })}
              </div>

              <textarea
                value={briefingHist}
                onChange={(e) => setBriefingHist(e.target.value)}
                rows={4}
                maxLength={800}
                disabled={gerandoClipe || escrevendoBia}
                placeholder="Conte o que você quer, com detalhes. Ex: primeiro episódio da série de aventuras do castelinho — ele se apresenta e chama os amiguinhos pra viver aventuras. As 4 cenas se interligam. Sem forçar convite pra festa."
                className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[13px] leading-relaxed text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold text-muted">Cenas:</span>
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" disabled={gerandoClipe || escrevendoBia} onClick={() => setNumCenas(n)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${numCenas === n ? "border-[#a855f7] bg-[#a855f7]/20 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{n}</button>
                ))}
                <button type="button" disabled={gerandoClipe || escrevendoBia} onClick={biaEscreveCenas} className="ml-auto rounded-md bg-[#a855f7] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#9333ea] disabled:opacity-50">{escrevendoBia ? "✍️ Escrevendo…" : "✍️ Bia escreve as cenas"}</button>
              </div>

              {cenas.length > 0 && (
                <div className="mt-3 space-y-2">
                  {cenas.map((c, i) => (
                    <div key={i} className="rounded-md border border-linha bg-preto p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#d6c6ff]">🎬 Cena {i + 1}</span>
                        <button type="button" disabled={gerandoClipe} onClick={() => setCenas((cs) => cs.filter((_, idx) => idx !== i))} aria-label="Tirar cena" className="text-[11px] font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-40">✕</button>
                      </div>
                      <label className="mt-1.5 block text-[9px] font-semibold text-muted">O que faz</label>
                      <input type="text" value={c.acao} disabled={gerandoClipe} onChange={(e) => setCena(i, "acao", e.target.value)} maxLength={300} placeholder="Ex: abrindo os bracinhos apresentando os brinquedos" className="mt-0.5 w-full rounded border border-linha bg-black px-2 py-1.5 text-[12px] text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50" />
                      <label className="mt-1.5 block text-[9px] font-semibold text-muted">🗣️ Fala</label>
                      <input type="text" value={c.fala} disabled={gerandoClipe} onChange={(e) => setCena(i, "fala", e.target.value)} maxLength={160} placeholder="Ex: Olha quanta diversão te espera aqui!" className="mt-0.5 w-full rounded border border-linha bg-black px-2 py-1.5 text-[12px] text-white placeholder:text-muted/40 focus:border-[#a855f7] focus:outline-none disabled:opacity-50" />
                    </div>
                  ))}
                  {cenas.length < 4 && (
                    <button type="button" disabled={gerandoClipe} onClick={() => setCenas((cs) => [...cs, { acao: "", fala: "" }])} className="text-[11px] font-semibold text-[#d6c6ff] transition hover:underline disabled:opacity-40">+ Adicionar cena</button>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted">Cada cena:</span>
                {[4, 8, 12].map((s) => (
                  <button key={s} type="button" disabled={gerandoClipe} onClick={() => setDurCena(s)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${durCena === s ? "border-[#a855f7] bg-[#a855f7]/20 text-[#d6c6ff]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{s}s</button>
                ))}
                {cenas.length > 0 && <span className="text-[10px] text-muted/60">≈ {cenas.length * durCena}s no total</span>}
              </div>
            </div>
          ) : (
            <>
              {/* ações rápidas — 1 toque preenche "o que o mascote faz" (descrição, editável) */}
              <label className="mt-3 block text-[10px] font-semibold text-muted">O que ele faz <span className="font-normal text-muted/70">(toque pra preencher, dá pra editar embaixo)</span></label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ACOES_CLIPE.map((a) => (
                  <button key={a.nome} type="button" disabled={gerandoClipe} onClick={() => setDescClipe(a.desc)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${descClipe === a.desc ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                    {a.emoji} {a.nome}
                  </button>
                ))}
              </div>

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

              {/* duração do clipe */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted">Duração:</span>
                {[4, 8, 12].map((s) => (
                  <button key={s} type="button" disabled={gerandoClipe} onClick={() => setDurClipe(s)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${durClipe === s ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{s}s</button>
                ))}
                <span className="text-[10px] text-muted/60">(mais longo = mais demorado)</span>
              </div>
            </>
          )}

          {/* lembrete da voz — a escolha/teste da voz fica na sub-aba "🎙️ Voz" (vale pros dois modos) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 p-2.5">
            <span className="text-[11px] text-muted">🎙️ Voz do castelinho: <strong className="text-white/80">{VOZES_CLIPE.find((v) => v.desc === vozClipe)?.nome ?? (vozClipe.trim() ? "personalizada" : "🎬 Desenho animado (padrão)")}</strong></span>
            <button type="button" onClick={() => setSubAba("voz")} className="rounded-md border border-[#a855f7]/50 bg-[#a855f7]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#a855f7]/25">trocar / ouvir voz →</button>
          </div>

          {/* CENÁRIO — sempre compatível: foto real do buffet (melhor), um cenário curado, ou cor sólida. */}
          <label className="mt-3 block text-[10px] font-semibold text-muted">Cenário <span className="font-normal text-muted/70">(a foto do buffet é a mais realista)</span></label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" disabled={gerandoClipe} onClick={() => { setCenaSel("foto"); abrirSeletorFotos(); }} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${cenaSel === "foto" ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>📷 Foto do buffet</button>
            {CENAS_CLIPE.map((c) => (
              <button key={c.id} type="button" disabled={gerandoClipe} onClick={() => setCenaSel(c.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${cenaSel === c.id ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{c.ic} {c.label}</button>
            ))}
            <button type="button" disabled={gerandoClipe} onClick={() => setCenaSel("")} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${cenaSel === "" ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>🎨 Cor sólida</button>
          </div>
          {cenaSel === "" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {FUNDOS_CLIPE.map((f) => (
                <button
                  key={f.cor}
                  type="button"
                  disabled={gerandoClipe}
                  onClick={() => setFundoClipe(f.cor)}
                  title={f.nome}
                  aria-label={`Fundo ${f.nome}`}
                  className={`h-7 w-7 rounded-full border-2 transition disabled:opacity-40 ${fundoClipe.toUpperCase() === f.cor.toUpperCase() ? "border-[#ec4899] ring-2 ring-[#ec4899]/40" : "border-white/20 hover:border-white/50"}`}
                  style={{ background: f.cor }}
                />
              ))}
            </div>
          )}
          {cenaSel === "foto" && (
            fundoFoto ? (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-[#ec4899]/30 bg-[#ec4899]/5 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fundoFoto} alt="" className="h-12 w-12 rounded object-cover" />
                <span className="text-[11px] text-muted">Cenário: foto do seu espaço. <button type="button" onClick={abrirSeletorFotos} className="font-semibold text-[#f9a8d4] hover:underline">trocar foto</button></span>
              </div>
            ) : (
              <button type="button" onClick={abrirSeletorFotos} className="mt-2 rounded-md border border-dashed border-[#ec4899]/40 bg-[#ec4899]/5 px-3 py-2 text-[11px] font-semibold text-[#f9a8d4]">📷 Escolher a foto do buffet</button>
            )
          )}

          {clipesUrls.length > 0 && (
            <>
              {/* cabeçalho da galeria — COLAPSÁVEL (recolhido por padrão) pra o botão de gerar ficar mais pra cima */}
              <button type="button" onClick={() => setGaleriaAberta((v) => !v)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-linha bg-preto px-3 py-2 text-left transition hover:border-white/30">
                <span className="text-[11px] font-semibold text-white">🎬 Meus clipes <span className="font-normal text-muted/70">({clipesUrls.length})</span></span>
                <span className="text-xs text-muted">{galeriaAberta ? "▲ recolher" : "▼ ver"}</span>
              </button>
              {galeriaAberta && (
              <>
              <p className="mt-2 text-[10px] leading-snug text-muted/70">Poste solto (Story/Reels) ou <strong className="text-white/70">marque um como ⭐ Abertura / 🏁 Fecho</strong> pra entrar automático no começo/fim dos Reels das festas.</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {clipesUrls.map((url) => {
                  const ehAbertura = aberturaSel === url;
                  const ehFecho = fechoSel === url;
                  return (
                    <div key={url} className={`overflow-hidden rounded-lg border bg-black ${ehAbertura || ehFecho ? "border-[#ec4899]" : "border-linha"}`}>
                      <div className="relative">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video src={url} controls playsInline loop className="aspect-[9/16] w-full bg-black object-contain" />
                        {(ehAbertura || ehFecho) && (
                          <span className="absolute left-1 top-1 rounded-full bg-[#ec4899] px-2 py-0.5 text-[9px] font-bold text-white">{ehAbertura ? "⭐ Abertura" : "🏁 Fecho"}</span>
                        )}
                      </div>
                      {/* marcar como abertura/fecho dos Reels */}
                      <div className="flex items-center gap-1.5 px-2 pt-2">
                        <button type="button" onClick={() => alternarAbertura(url)} className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold transition ${ehAbertura ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha text-muted hover:border-white/30 hover:text-white"}`}>{ehAbertura ? "⭐ Abertura ✓" : "⭐ Abertura"}</button>
                        <button type="button" onClick={() => alternarFecho(url)} className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold transition ${ehFecho ? "border-[#ec4899] bg-[#ec4899]/20 text-[#f9a8d4]" : "border-linha text-muted hover:border-white/30 hover:text-white"}`}>{ehFecho ? "🏁 Fecho ✓" : "🏁 Fecho"}</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 px-2 py-2">
                        <button type="button" onClick={() => { setResultadoPost(null); setConfirmPost({ url, tipo: "story" }); }} disabled={postandoClipe} className="rounded-md bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-2 py-1 text-[10px] font-bold text-white transition hover:brightness-110 disabled:opacity-50">📲 Story</button>
                        <button type="button" onClick={() => { setResultadoPost(null); setConfirmPost({ url, tipo: "reels" }); }} disabled={postandoClipe} className="rounded-md bg-[#C13584] px-2 py-1 text-[10px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">🎬 Reels</button>
                        <a href={url} target="_blank" rel="noopener noreferrer" download className="ml-auto text-[10px] font-semibold text-[#f9a8d4] hover:underline">⬇</a>
                        <button type="button" onClick={() => handleExcluirClipe(url)} disabled={proc === url || isPending} className="text-[10px] font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-40">{proc === url ? "…" : "✕"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
              )}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {modoSel === "historia" ? (
              <button
                type="button"
                onClick={gerarHistoria}
                disabled={gerandoClipe || isPending || cenas.filter((c) => (c.acao || c.fala).trim()).length < 2}
                className="rounded-lg bg-gradient-to-r from-[#a855f7] to-[#ec4899] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {gerandoClipe ? "🎬 Montando a história…" : "🎬 Gerar história"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGerarClipe}
                disabled={gerandoClipe || isPending}
                className="rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {gerandoClipe ? "🎬 Animando…" : clipesUrls.length ? "🎬 Gerar outro clipe" : "🎬 Gerar clipe animado"}
              </button>
            )}
            {gerandoClipe && statusClipe && <span className="text-[11px] font-semibold text-[#f9a8d4]">{statusClipe}</span>}
          </div>
          {gerandoClipe && modoSel === "historia" && <p className="mt-2 text-[10px] leading-snug text-muted/70">⏳ Cada cena leva de 1 a 2 min e elas geram juntas — a história inteira pode levar <strong className="text-white/70">alguns minutos</strong>. Deixe essa tela aberta até terminar.</p>}
          {gerandoClipe && modoSel !== "historia" && <p className="mt-2 text-[10px] leading-snug text-muted/70">⏳ A animação por IA leva de <strong className="text-white/70">1 a 2 minutos</strong> — pode deixar essa tela aberta. Não feche enquanto estiver "Animando…".</p>}
          {!gerandoClipe && <p className="mt-2 text-[10px] leading-snug text-muted/70">Cada clipe é gerado por IA de vídeo (pode variar um pouco). Se não gostar, é só gerar de novo.</p>}
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
