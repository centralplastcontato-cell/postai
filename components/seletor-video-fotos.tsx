"use client";

// CRIADOR DE VÍDEO em formato "player" (não é mais um formulário rolável):
//  • no CENTRO, uma prévia 9:16 do vídeo (a foto da cena com a moldura/fundo escolhidos);
//  • embaixo, a LINHA DO TEMPO clicável (as fotos na ordem) — toque numa cena pra vê-la na prévia;
//  • ao lado, as opções em ABAS: 📷 Fotos · 🎵 Música · 🎨 Estilo · 🎙️ Narração (buffet) · ✍️ Textos.
// Mesma máquina por baixo (salvar/gerar/narração/música/detector de repetidas) — só a casca mudou.
// Vale pros DOIS tipos de vídeo: festa (fotos) e buffet/temático (acervo).

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { salvarFotosVideo, gerarVideoDaFesta, gerarTextoFinalVideo, gerarTituloCapaVideo, listarMusicasDaMarca, adicionarMusicaAoBanco, definirMascoteFesta } from "@/app/actions/festas";
import { salvarFotosVideoTematico, gerarVideoTematico, gerarTextoFinalVideoTematico, gerarTextosVideoTematico, editarTextoFotoVideo, gerarLegendaUmaFotoVideo, gerarRoteiroNarracao, gerarCtaNarracao, gerarNarracaoVideo, removerNarracaoVideo, definirFundoVideo, listarMusicasDaMarcaTema, adicionarMusicaAoBancoTema, definirWavMusicaTema, renomearVideoTematico, definirCapaEstilo, gerarCapaIa, definirFundoCorVideo, definirMolduraCorVideo, gerarRecorteCapa, aplicarCapaIa, definirMascoteVideo, definirLogoVideo } from "@/app/actions/videos-tematicos";

// Paleta de cores pro fundo "cor" (degradê). A 1ª ("") = cor da marca; as outras são presets festivos.
const CORES_FUNDO = ["#7C3AED", "#2563EB", "#0EA5E9", "#16A34A", "#EC4899", "#F97316", "#EAB308", "#9D174D", "#334155"];
import { type FotoView } from "@/lib/festa-tipos";
import { VOZES, VOZ_PADRAO, ESTILOS, DIRECAO_PADRAO, fotosParaDuracao } from "@/lib/vozes";
import { MOMENTOS_FESTA } from "@/lib/momentos-festa";

// Ordem narrativa do vídeo = a ordem dos momentos (fonte única em lib/momentos-festa.ts).
const ORDEM: string[] = MOMENTOS_FESTA.map((m) => m.id);
const LABEL: Record<string, string> = {
  // rótulos curtos dos momentos da FESTA (selo da foto) — vêm da lista central
  ...Object.fromEntries(MOMENTOS_FESTA.map((m) => [m.id, m.curto])),
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
  { id: "preta", label: "Preta" }, // só no vídeo do buffet (o motor da festa não conhece)
  { id: "marca", label: "Cor" }, // cor escolhida na paleta (padrão = cor da marca)
];

// Estilo da moldura no PREVIEW (aproxima o que o motor faz: borda colorida ao redor da foto).
// `esc` escala a espessura — 1 no mini-preview, maior no modal ampliado.
function estiloMoldura(m: string, cor: string, esc = 1): CSSProperties {
  if (m === "branca") return { padding: 3 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "grossa") return { padding: 6 * esc, background: "#ffffff", borderRadius: 2 };
  if (m === "preta") return { padding: 3 * esc, background: "#141414", borderRadius: 2 };
  if (m === "marca") return { padding: 3 * esc, background: cor, borderRadius: 2 };
  return {};
}

// As fotos do buffet são ENORMES (originais de vários MB). Nas miniaturas (linha do tempo, grade,
// prévia) não precisamos do tamanho original — passamos pelo otimizador de imagem do Next
// (/_next/image), que devolve uma versão redimensionada e leve (fica em cache no CDN depois da 1ª
// vez). Isso faz a linha do tempo aparecer NA HORA em vez de esperar baixar 26 fotos gigantes.
// `w` tem que ser um dos tamanhos padrão do Next (128/256/384 = miniatura, 640 = prévia).
function miniatura(url: string, w: number): string {
  if (!url || !url.startsWith("http")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

// --- Detector de fotos PARECIDAS/repetidas (ex: fotos em rajada do mesmo momento) ---
// dHash 8×8 (64 bits, guardados como array de 0/1) calculado no NAVEGADOR: reduz a foto a 9×8 tons
// de cinza e marca 1/0 comparando cada pixel com o vizinho. Fotos parecidas têm hashes parecidos
// (poucos bits de diferença). Se o navegador não puder ler os pixels (CORS), devolve null e não sinaliza.
function hamming(a: number[], b: number[]): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) c++;
  return c;
}
function dHashFoto(url: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = 9; cv.height = 8;
        const ctx = cv.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 9, 8);
        const d = ctx.getImageData(0, 0, 9, 8).data;
        const bits: number[] = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const i1 = (r * 9 + c) * 4, i2 = (r * 9 + c + 1) * 4;
            const g1 = 0.299 * d[i1] + 0.587 * d[i1 + 1] + 0.114 * d[i1 + 2];
            const g2 = 0.299 * d[i2] + 0.587 * d[i2 + 1] + 0.114 * d[i2 + 2];
            bits.push(g1 < g2 ? 1 : 0);
          }
        }
        resolve(bits);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Prepara a versão WAV (24kHz mono) de uma trilha MP3 — NO NAVEGADOR (que sabe ler MP3; o servidor
// não tem ffmpeg). É o que a NARRAÇÃO usa como fundo sob a voz. Devolve um Blob WAV, ou null se não der.
async function prepararWavDaMusica(mp3Url: string): Promise<Blob | null> {
  try {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!AC || !OAC) return null;
    const resp = await fetch(mp3Url);
    if (!resp.ok) return null;
    const arr = await resp.arrayBuffer();
    const ac = new AC();
    const decoded = await ac.decodeAudioData(arr.slice(0));
    ac.close();
    const TAXA = 24000;
    const MAX_S = 90; // a música dá loop na narração; 90s bastam e seguram o tamanho do arquivo
    const durS = Math.min(decoded.duration || 0, MAX_S);
    const frames = Math.max(1, Math.floor(durS * TAXA));
    const oac = new OAC(1, frames, TAXA); // 1 canal (mono) @ 24kHz — resample + downmix de uma vez
    const src = oac.createBufferSource();
    src.buffer = decoded;
    src.connect(oac.destination);
    src.start(0);
    const rendered = await oac.startRendering();
    return floatParaWavBlob(rendered.getChannelData(0), TAXA);
  } catch (e) {
    console.error("Não consegui preparar o WAV da música:", e);
    return null;
  }
}
// Float32 [-1,1] → Blob WAV PCM 16 bits (o formato que o servidor lê pra misturar com a voz).
function floatParaWavBlob(data: Float32Array, taxa: number): Blob {
  const n = data.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const escrever = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  escrever(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); escrever(8, "WAVE");
  escrever(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, taxa, true); dv.setUint32(28, taxa * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  escrever(36, "data"); dv.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, data[i])); dv.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
  return new Blob([buf], { type: "audio/wav" });
}

export function SeletorVideoFotos({ festaId, tematicoId, nome, fotos, inicial, capaInicial = "", molduraInicial = "branca", textoFinalInicial = "", tituloCapaInicial = "", tituloCapaAuto = "", textosIniciais = {}, narracao, musicaInicial = "", musicasBanco = [], fundoInicial = "", fundoCorInicial = "", molduraCorInicial = "", capaEstiloInicial = "", capaIaUrlInicial = "", capaRecorteUrlInicial = "", mascoteCantoInicial = "", mascoteTamInicial = "m", mascoteUrl = "", logoCantoInicial = "", logoTamInicial = "m", logoUrlMarca = "", capasBanco = [], corMarca = "#E11D2A", jaTemVideo = false, onFechar }: {
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
  musicasBanco?: { url: string; nome: string; wav?: string }[];
  fundoInicial?: string; // fundo do quadro do vídeo temático: "" (foto borrada) | "cheia" | "cor"
  fundoCorInicial?: string; // cor do fundo "cor" (hex); "" = cor da marca
  molduraCorInicial?: string; // cor da moldura "marca" (hex); "" = cor da marca
  capaEstiloInicial?: string; // estilo da capa (temático): "" (clássica) | "impacto" (chamativa) | "ia"
  capaIaUrlInicial?: string; // URL da arte de capa gerada pela IA (quando estilo = "ia")
  capaRecorteUrlInicial?: string; // URL da foto recortada (quando estilo = "recortado")
  mascoteCantoInicial?: string; // mascote no vídeo: "" (não) | dir | esq | cima-dir | cima-esq
  mascoteTamInicial?: string; // tamanho do mascote no vídeo: p | m | g
  mascoteUrl?: string; // mascote oficial da marca (PNG) — pro preview e pra saber se existe
  logoCantoInicial?: string; // logo posicionado por nós: "" (padrão do motor) | dir | esq | cima-dir | cima-esq
  logoTamInicial?: string; // tamanho do logo quando posicionado por nós: p | m | g
  logoUrlMarca?: string; // logo da marca (URL) — pro preview e pra saber se existe (só buffet)
  capasBanco?: string[]; // biblioteca de artes de capa (IA) da marca, pra reusar
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
  const [fundo, setFundo] = useState<string>(fundoInicial || ""); // fundo do quadro (temático): "" borrada | "cheia" | "cor"
  const [corFundo, setCorFundo] = useState<string>(fundoCorInicial || ""); // cor do fundo "cor" (hex); "" = cor da marca
  const [corMoldura, setCorMoldura] = useState<string>(molduraCorInicial || ""); // cor da moldura "marca" (hex); "" = cor da marca
  const [capaEstilo, setCapaEstilo] = useState<string>(capaEstiloInicial || ""); // estilo da capa: "" clássica | "impacto" | "ia"
  const [capaIaUrl, setCapaIaUrl] = useState<string>(capaIaUrlInicial || ""); // arte de capa gerada pela IA
  const [gerandoCapaIa, setGerandoCapaIa] = useState(false);
  const [erroCapaIa, setErroCapaIa] = useState("");
  const [bancoCapa, setBancoCapa] = useState<string[]>(capasBanco); // biblioteca de artes de capa (IA) da marca
  const [capaRecorteUrl, setCapaRecorteUrl] = useState<string>(capaRecorteUrlInicial || ""); // foto recortada (sem fundo)
  const [gerandoRecorte, setGerandoRecorte] = useState(false);
  const [erroRecorte, setErroRecorte] = useState("");
  // MASCOTE no vídeo: canto ("" = não mostra) + tamanho. Só faz sentido se a marca tem mascote.
  const [mascoteCanto, setMascoteCanto] = useState<string>(mascoteCantoInicial || "");
  const [mascoteTam, setMascoteTam] = useState<string>(mascoteTamInicial || "m");
  // LOGO com posição própria no vídeo (só buffet): canto ("" = padrão do motor) + tamanho.
  const [logoCanto, setLogoCanto] = useState<string>(logoCantoInicial || "");
  const [logoTam, setLogoTam] = useState<string>(logoTamInicial || "m");
  // Nome do vídeo (só o do buffet dá pra renomear aqui; no de festa o nome são os aniversariantes).
  const [nomeVideo, setNomeVideo] = useState(nome);
  const [editandoNome, setEditandoNome] = useState(false);
  const [salvoOk, setSalvoOk] = useState(false); // mostra "✓ Salvo!" por uns segundos
  const salvoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ABA aberta no painel lateral + qual CENA está na prévia central + se a prévia está "tocando".
  const [aba, setAba] = useState<string>("fotos");
  const [cena, setCena] = useState(0);
  const [tocandoPrev, setTocandoPrev] = useState(false);
  const [previaCheia, setPreviaCheia] = useState(false); // prévia em TELA CHEIA (pra ver a sequência no celular)
  const [capaCheia, setCapaCheia] = useState(false); // a CAPA em tela cheia (aba Capa)
  // Divisória AJUSTÁVEL entre o vídeo e o painel de abas (só no layout lado-a-lado das telas grandes).
  const [larguraPainel, setLarguraPainel] = useState(400); // largura do painel da direita, em px
  const [ehLg, setEhLg] = useState<boolean>(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const larguraRef = useRef(400);
  // Troca o estilo de fundo do vídeo temático (salva na hora; o vídeo usa no próximo "Gerar").
  function trocarFundo(novo: string) {
    if (!tematicoId) return;
    setFundo(novo);
    definirFundoVideo(tematicoId, novo).catch(() => {});
  }
  // Troca a COR do fundo "cor" (paleta) — salva na hora; vale no próximo Gerar.
  function trocarCorFundo(nova: string) {
    if (!tematicoId) return;
    setCorFundo(nova);
    definirFundoCorVideo(tematicoId, nova).catch(() => {});
  }
  // Troca a COR da moldura "Cor" (paleta) — salva na hora; vale no próximo Gerar.
  function trocarCorMoldura(nova: string) {
    if (!tematicoId) return;
    setCorMoldura(nova);
    definirMolduraCorVideo(tematicoId, nova).catch(() => {});
  }
  // Liga/desliga o MASCOTE + canto/tamanho — salva na hora; vale no próximo Gerar. No buffet
  // vale em TODO quadro; na festa vale só na CAPA (o resto são as fotos da família).
  function trocarMascoteCanto(canto: string) {
    setMascoteCanto(canto);
    if (tematicoId) definirMascoteVideo(tematicoId, canto, mascoteTam).catch(() => {});
    else if (festaId) definirMascoteFesta(festaId, canto, mascoteTam).catch(() => {});
  }
  function trocarMascoteTam(tam: string) {
    setMascoteTam(tam);
    if (tematicoId) definirMascoteVideo(tematicoId, mascoteCanto, tam).catch(() => {});
    else if (festaId) definirMascoteFesta(festaId, mascoteCanto, tam).catch(() => {});
  }
  // LOGO com posição própria (só buffet): canto/tamanho — salva na hora; vale no próximo Gerar.
  function trocarLogoCanto(canto: string) {
    if (!tematicoId) return;
    setLogoCanto(canto);
    definirLogoVideo(tematicoId, canto, logoTam).catch(() => {});
  }
  function trocarLogoTam(tam: string) {
    if (!tematicoId) return;
    setLogoTam(tam);
    definirLogoVideo(tematicoId, logoCanto, tam).catch(() => {});
  }
  // Troca o estilo da CAPA (clássica / impacto / ia) — salva na hora; vale no próximo Gerar.
  function trocarCapaEstilo(novo: string) {
    if (!tematicoId) return;
    setCapaEstilo(novo);
    definirCapaEstilo(tematicoId, novo).catch(() => {});
  }
  // Gera a ARTE de capa com IA (festiva, sem rostos). Ao terminar, já deixa o estilo em "ia".
  async function gerarArteCapa() {
    if (!tematicoId || gerandoCapaIa) return;
    setGerandoCapaIa(true);
    setErroCapaIa("");
    const r = await gerarCapaIa(tematicoId).catch(() => ({ ok: false as const, erro: "Não consegui gerar agora." }));
    setGerandoCapaIa(false);
    if (!r.ok) { setErroCapaIa(r.erro || "Não consegui gerar agora."); return; }
    setCapaIaUrl(r.url);
    setCapaEstilo("ia");
    if (r.capas) setBancoCapa(r.capas); // atualiza a biblioteca com a nova arte
  }
  // Reaproveita uma arte de capa JÁ salva na biblioteca (sem gerar de novo → de graça).
  async function usarArteSalva(url: string) {
    if (!tematicoId) return;
    setCapaIaUrl(url);
    setCapaEstilo("ia");
    setErroCapaIa("");
    aplicarCapaIa(tematicoId, url).catch(() => {});
  }
  // Recorta o assunto da foto da capa (tira o fundo) com IA. Ao terminar, deixa o estilo em "recortado".
  async function gerarRecorte() {
    if (!tematicoId || gerandoRecorte) return;
    setGerandoRecorte(true);
    setErroRecorte("");
    const r = await gerarRecorteCapa(tematicoId, capaId || undefined).catch(() => ({ ok: false as const, erro: "Não consegui recortar agora." }));
    setGerandoRecorte(false);
    if (!r.ok) { setErroRecorte(r.erro || "Não consegui recortar agora."); return; }
    setCapaRecorteUrl(r.url);
    setCapaEstilo("recortado");
  }
  // Salva o novo nome do vídeo do buffet (o campo editável no topo). Volta ao nome antigo se falhar.
  async function salvarNome() {
    setEditandoNome(false);
    const t = nomeVideo.trim();
    if (!tematicoId) return;
    if (!t || t === nome) { setNomeVideo(nome); return; }
    const r = await renomearVideoTematico(tematicoId, t).catch(() => null);
    if (r?.ok) { setNomeVideo(r.titulo); router.refresh(); }
    else setNomeVideo(nome);
  }
  // FOTOS PARECIDAS: mapa fotoId → nº do grupo (só fotos que têm alguma parecida entram). Calculado
  // no navegador ao abrir; sinaliza com o selo 🔁 pra o dono evitar repetir fotos quase iguais.
  const [dupGrupo, setDupGrupo] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const hs: { id: string; h: number[] }[] = [];
      for (const f of fotos) {
        const h = await dHashFoto(f.url);
        if (cancelado) return;
        if (h !== null) hs.push({ id: f.id, h });
      }
      // union-find: junta as parecidas (poucos bits de diferença) na mesma "família".
      const pai = new Map<string, string>();
      hs.forEach((x) => pai.set(x.id, x.id));
      const raiz = (x: string): string => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x)!)!); x = pai.get(x)!; } return x; };
      const LIMITE = 10; // ≤10 bits de diferença ≈ foto muito parecida/repetida
      for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
        if (hamming(hs[i].h, hs[j].h) <= LIMITE) pai.set(raiz(hs[i].id), raiz(hs[j].id));
      }
      const cont = new Map<string, number>();
      hs.forEach((x) => { const r = raiz(x.id); cont.set(r, (cont.get(r) || 0) + 1); });
      const numDaRaiz = new Map<string, number>();
      let n = 0;
      const g = new Map<string, number>();
      hs.forEach((x) => {
        const r = raiz(x.id);
        if ((cont.get(r) || 0) < 2) return; // só grupos com 2+ fotos contam como "repetidas"
        if (!numDaRaiz.has(r)) numDaRaiz.set(r, ++n);
        g.set(x.id, numDaRaiz.get(r)!);
      });
      if (!cancelado) setDupGrupo(g);
    })();
    return () => { cancelado = true; };
  }, [fotos]);
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
  const [banco, setBanco] = useState<{ url: string; nome: string; wav?: string }[]>(musicasBanco); // biblioteca de trilhas da marca
  const [tocando, setTocando] = useState<string>(""); // URL da música tocando agora ("" = nenhuma)
  const [buffetUrl, setBuffetUrl] = useState<string>(""); // link da música padrão do buffet (pra dar play)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Ao abrir, busca a biblioteca de músicas da marca + o link do jingle do buffet (festa ou buffet).
  useEffect(() => {
    const p = tematicoId ? listarMusicasDaMarcaTema(tematicoId) : listarMusicasDaMarca(festaId);
    p.then((r) => { if (r.ok) { if (r.musicas.length) setBanco(r.musicas); setBuffetUrl(r.buffetUrl || ""); } }).catch(() => {});
  }, [festaId, tematicoId]);
  // Prepara o WAV (no navegador) de UMA trilha e registra na biblioteca — pra ela poder entrar sob
  // a voz na narração. Só faz sentido no vídeo do buffet (temático). Best-effort e sem repetir.
  const wavPromises = useRef<Map<string, Promise<string | null>>>(new Map());
  // Garante o WAV (24kHz mono) de UMA trilha e DEVOLVE a URL dele (ou null). Já pronto → na hora;
  // em preparo → aguarda o mesmo trabalho (dedup); senão prepara no navegador + envia + registra.
  function garantirWav(mp3Url: string): Promise<string | null> {
    const jaTem = banco.find((m) => m.url === mp3Url)?.wav;
    if (jaTem) return Promise.resolve(jaTem);
    if (!tematicoId || !mp3Url.startsWith("http")) return Promise.resolve(null);
    const emAndamento = wavPromises.current.get(mp3Url);
    if (emAndamento) return emAndamento;
    const p = (async (): Promise<string | null> => {
      try {
        const wavBlob = await prepararWavDaMusica(mp3Url);
        if (!wavBlob) return null;
        const form = new FormData();
        form.append("file", new File([wavBlob], "trilha.wav", { type: "audio/wav" }));
        const resp = await fetch("/api/marketing/upload?tipo=musica", { method: "POST", body: form });
        const data = await resp.json();
        if (!data.ok || !data.url) return null;
        definirWavMusicaTema(tematicoId, mp3Url, data.url).then((r) => { if (r?.ok) setBanco(r.musicas); }).catch(() => {});
        setBanco((b) => b.map((m) => (m.url === mp3Url ? { ...m, wav: data.url } : m)));
        return data.url as string;
      } catch { return null; }
      finally { wavPromises.current.delete(mp3Url); }
    })();
    wavPromises.current.set(mp3Url, p);
    return p;
  }
  // BACKFILL automático: no vídeo do buffet, prepara o WAV das trilhas que ainda não têm (uma de
  // cada vez pra não pesar). Assim as músicas já existentes passam a funcionar sob a voz, sem reenvio.
  useEffect(() => {
    if (!tematicoId) return;
    const pendente = banco.find((m) => !m.wav && !wavPromises.current.has(m.url));
    if (pendente) garantirWav(pendente.url);
  }, [tematicoId, banco]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Reencaixa as fotos ESCOLHIDAS na ordem narrativa (as que você adicionou na mão saem do fim e
  // vão pro lugar do momento delas). Mantém o MESMO conjunto de fotos — só muda a ORDEM.
  function reorganizar() {
    const pos = new Map(galeria.map((f, i) => [f.id, i]));
    setSel((s) => [...s].sort((a, b) => (pos.get(a) ?? 9999) - (pos.get(b) ?? 9999)));
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
    // slider 0-100 → FRAÇÃO (0..1); o motor traduz em ganho audível (0 = sem música; 100 = bem alta).
    const musicaVol = volMusica / 100;
    // duração ALVO = o vídeo com TODAS as fotos (uma vira a capa) — a música estica até lá, e
    // com a 2ª fala a voz volta no fim. ~2,3s por foto + 6s fixos (capa + slide final).
    const nSlide = Math.max(1, sel.length - 1);
    const alvoSegundos = Math.round(nSlide * 2.3 + 6);
    // A trilha ESCOLHIDA entra sob a voz: prepara/pega o WAV dela AGORA e passa direto (não depende
    // de ter salvo antes). Sem trilha escolhida, ou se falhar, a narração usa o jingle do buffet.
    const wavUrl = musica ? await garantirWav(musica).catch(() => null) : null;
    const r = await gerarNarracaoVideo(tematicoId, roteiro, voz, estilo, musicaVol, roteiro2, alvoSegundos, wavUrl || undefined).catch(() => ({ ok: false as const, erro: "Não consegui gerar a voz agora." }));
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
    if (tematicoId) await salvarFotosVideoTematico(tematicoId, sel, capa, moldura, textoFinal, textos, musica);
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
        const r = await (tematicoId ? adicionarMusicaAoBancoTema(tematicoId, data.url, nome) : adicionarMusicaAoBanco(festaId, data.url, nome)).catch(() => null);
        if (r?.ok) setBanco(r.musicas);
        else setBanco((b) => (b.some((m) => m.url === data.url) ? b : [{ url: data.url, nome }, ...b]));
      } else setErroGerar(data.erro || "Não consegui enviar a música.");
    } catch { setErroGerar("Não consegui enviar a música."); }
    setSubindoMusica(false);
  }
  // Salva a seleção e FICA na tela (não fecha) — mostra "✓ Salvo!" por uns segundos como confirmação.
  async function salvar() {
    setSalvando(true);
    try {
      await salvarSelecao();
      setSalvoOk(true);
      if (salvoTimer.current) clearTimeout(salvoTimer.current);
      salvoTimer.current = setTimeout(() => setSalvoOk(false), 2500);
    } catch {}
    setSalvando(false);
    router.refresh();
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
  // momentos da festa na ordem narrativa (ORDEM) + as categorias do modo temático
  const ordemCat = [...ORDEM, "espaco", "festa", "comida", "geral"];
  const catsDisponiveis = [...contagemCat.keys()].sort((a, b) => {
    const ia = ordemCat.indexOf(a), ib = ordemCat.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const disponiveisFiltradas = filtroCat ? disponiveis.filter((f) => f.momento === filtroCat) : disponiveis;
  // foto de exemplo pro mini-preview da moldura (uma do slideshow, não a capa)
  const fotoPrevFV = escolhidas.find((f) => f.id !== capa) || escolhidas[0] || galeria[0];
  const fotoPrev = fotoPrevFV?.url;

  // ---- PRÉVIA central (o "player"): qual cena aparece + o texto sobre ela ----
  const capaId = capa || escolhidas[0]?.id || "";
  const cenaIdx = escolhidas.length ? Math.min(cena, escolhidas.length - 1) : 0;
  const cenaFoto = escolhidas[cenaIdx] || null;
  const ehCapaCena = !!cenaFoto && cenaFoto.id === capaId;
  // o que aparece escrito na prévia: no buffet, a legenda da foto (ou o tema na capa); na festa, o
  // título só na capa. É só uma aproximação do vídeo — o motor é quem manda de verdade.
  const legendaCena = cenaFoto
    ? tematicoId
      ? (textos[cenaFoto.id] || (ehCapaCena ? nome : ""))
      : (ehCapaCena ? (tituloCapa.trim() || tituloCapaAuto || nome) : "")
    : "";
  const fundoCheia = !!tematicoId && fundo === "cheia";
  const fundoCor = !!tematicoId && fundo === "cor"; // fundo em degradê de cor
  const corDoFundo = corFundo || corMarca; // a cor escolhida (ou a da marca, se nenhuma)
  const corDaMoldura = corMoldura || corMarca; // cor da moldura "Cor" (ou a da marca)
  // Auto-avanço da prévia (dá a sensação de "tocar" o vídeo). Pausa sozinho ao trocar de cena na mão.
  useEffect(() => {
    if (!tocandoPrev || escolhidas.length < 2) return;
    const t = setInterval(() => setCena((c) => (c + 1) % escolhidas.length), 1100);
    return () => clearInterval(t);
  }, [tocandoPrev, escolhidas.length]);
  // Pré-carrega as fotos da sequência (deixa no cache do navegador) pra a prévia trocar de cena NA
  // HORA, sem aquele preto esperando a foto baixar. Guarda as referências (preloadRef) pra o
  // navegador não cancelar o download no meio. Roda quando a seleção muda.
  const preloadRef = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    preloadRef.current = escolhidas.map((f) => { const im = new Image(); im.src = miniatura(f.url, 640); return im; });
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  function irCena(d: number) {
    setTocandoPrev(false);
    if (!escolhidas.length) return;
    setCena((c) => (Math.min(c, escolhidas.length - 1) + d + escolhidas.length) % escolhidas.length);
  }
  // Sabe se está no layout lado-a-lado (telas grandes) e lembra a largura que o dono deixou.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const upd = () => setEhLg(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    try { const v = Number(localStorage.getItem("postai_painel_larg")); if (v >= 320 && v <= 1000) { larguraRef.current = v; setLarguraPainel(v); } } catch {}
    return () => mq.removeEventListener("change", upd);
  }, []);
  // Arrasta a divisória: a largura do painel da direita = distância da borda direita até o dedo/cursor
  // (com limites pra nenhum lado sumir). Guarda no navegador pra lembrar da próxima vez.
  function iniciarArrasto(e: React.PointerEvent) {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const w = window.innerWidth - ev.clientX;
      const clamp = Math.max(320, Math.min(Math.round(window.innerWidth * 0.62), w));
      larguraRef.current = clamp;
      setLarguraPainel(clamp);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem("postai_painel_larg", String(larguraRef.current)); } catch {}
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // as abas do painel lateral — Narração só no vídeo do buffet
  // Ordem: visual (Fotos+Estilo) → palavras (Textos) → som (Música+Narração, música antes da voz).
  const ABAS: { id: string; ic: string; label: string }[] = [
    { id: "fotos", ic: "📷", label: "Fotos" },
    ...(tematicoId ? [{ id: "capa", ic: "🎯", label: "Capa" }] : []),
    { id: "estilo", ic: "🎨", label: "Estilo" },
    { id: "texto", ic: "✍️", label: tematicoId ? "Textos" : "Capa" },
    { id: "musica", ic: "🎵", label: "Música" },
    ...(tematicoId ? [{ id: "narr", ic: "🎙️", label: "Narração" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-none bg-[#0b0a12]/96 backdrop-blur-md" onClick={onFechar}>
      <div className="flex flex-1 flex-col overflow-hidden bg-[#0f0e18]" onClick={(e) => e.stopPropagation()}>
        {/* ---------- BARRA DE CIMA: título + ações principais ---------- */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-white">
            <span className="shrink-0">🎬 Criar vídeo</span>
            <span className="shrink-0 font-normal text-muted">—</span>
            {tematicoId ? (
              editandoNome ? (
                <input
                  autoFocus
                  value={nomeVideo}
                  onChange={(e) => setNomeVideo(e.target.value)}
                  onBlur={salvarNome}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } else if (e.key === "Escape") { setNomeVideo(nome); setEditandoNome(false); } }}
                  maxLength={80}
                  aria-label="Nome do vídeo"
                  className="min-w-0 max-w-[46vw] rounded-md border border-[#7c3aed]/60 bg-preto px-2 py-0.5 text-sm font-semibold text-white focus:border-[#7c3aed] focus:outline-none"
                />
              ) : (
                <button type="button" onClick={() => setEditandoNome(true)} title="Toque pra renomear o vídeo" className="group inline-flex min-w-0 items-center gap-1 font-normal text-muted transition hover:text-white">
                  <span className="truncate">{nomeVideo}</span>
                  <span className="shrink-0 text-[11px] opacity-50 transition group-hover:opacity-100">✏️</span>
                </button>
              )
            ) : (
              <span className="truncate font-normal text-muted">{nome}</span>
            )}
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-muted">
            {sel.length} {sel.length === 1 ? "foto" : "fotos"}{segs > 0 ? ` · ≈ ${segs}s` : ""}
            {segs > 90 && <span className="ml-1 font-semibold text-vermelho">(passa de 90s!)</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={salvar} disabled={salvando} className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-60 ${salvoOk ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "border-white/15 text-white hover:border-white/40"}`}>{salvando ? "…" : salvoOk ? "✓ Salvo!" : "Salvar"}</button>
            <button onClick={salvarEGerar} disabled={salvando || sel.length === 0} title={sel.length === 0 ? "Escolha as fotos primeiro" : "Salvar a seleção e gerar o vídeo"} className="rounded-xl bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)] transition hover:brightness-110 disabled:opacity-50">{jaTemVideo ? "🔄 Refazer vídeo" : "⚡ Gerar vídeo"}</button>
            <button onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-sm text-muted transition hover:text-white">✕</button>
          </div>
        </div>

        {erroGerar && <p className="border-b border-white/10 bg-vermelho/10 px-4 py-1.5 text-center text-xs text-vermelho">{erroGerar}</p>}

        {/* ---------- MIOLO: prévia (player) à esquerda + abas à direita ---------- */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* PLAYER — a prévia 9:16 da cena atual, do jeito que vai ficar no vídeo */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-2 p-3 lg:min-w-0 lg:flex-1 lg:gap-3 lg:p-4" style={{ background: "radial-gradient(circle at 50% 22%, rgba(168,85,247,0.14), transparent 62%)" }}>
            <div className="flex items-center gap-3">
              {/* controles À ESQUERDA da imagem (só celular): voltar */}
              {escolhidas.length > 0 && (
                <div className="flex w-11 shrink-0 flex-col items-center gap-2 lg:hidden">
                  {escolhidas.length > 1 && (
                    <button type="button" onClick={() => irCena(-1)} aria-label="Cena anterior" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition active:bg-white/15">◀</button>
                  )}
                </div>
              )}
            <div className="relative aspect-[9/16] h-[26vh] max-w-full overflow-hidden rounded-[18px] bg-black shadow-[0_30px_70px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10 lg:h-[62vh] lg:rounded-[22px]">
              {cenaFoto ? (
                <>
                  {fundoCheia ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <>
                      {fundoCor ? (
                        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${corDoFundo}, #101018)` }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg brightness-[0.45]" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center p-3 lg:p-4">
                        <span className="block max-h-full max-w-full" style={estiloMoldura(moldura, corDaMoldura, 2)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="block max-h-[21vh] w-auto max-w-full object-contain lg:max-h-[55vh]" style={{ borderRadius: moldura === "nenhuma" ? 3 : 0 }} />
                        </span>
                      </div>
                    </>
                  )}
                  {/* MASCOTE (prévia aproximada) — no buffet em todas as cenas; na festa só na capa. */}
                  {mascoteCanto && mascoteUrl && (tematicoId || ehCapaCena) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mascoteUrl}
                      alt=""
                      className="pointer-events-none absolute w-auto object-contain"
                      style={{
                        ...(mascoteCanto.startsWith("cima") ? { top: "6%" } : { bottom: "6%" }),
                        ...(mascoteCanto.endsWith("dir") ? { right: "5%" } : { left: "5%" }),
                        height: mascoteTam === "p" ? "12%" : mascoteTam === "g" ? "28%" : "19%",
                        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))",
                      }}
                    />
                  )}
                  {/* LOGO (prévia) — só buffet, quando posicionado por nós */}
                  {tematicoId && logoCanto && logoUrlMarca && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrlMarca}
                      alt=""
                      className="pointer-events-none absolute h-auto object-contain"
                      style={{
                        ...(logoCanto.startsWith("cima") ? { top: "3%" } : { bottom: "3%" }),
                        ...(logoCanto.endsWith("dir") ? { right: "4%" } : { left: "4%" }),
                        width: logoTam === "p" ? "19%" : logoTam === "g" ? "37%" : "28%",
                        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
                      }}
                    />
                  )}
                  {/* texto sobre a cena (aproximação): título na capa / legenda nas outras */}
                  {legendaCena && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 text-center lg:px-4 lg:pb-4">
                      <span className={`inline-block font-black leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${ehCapaCena ? "text-sm lg:text-lg" : "text-[11px] lg:text-sm"}`}>{legendaCena}</span>
                    </div>
                  )}
                  {/* selo do momento + nº da cena */}
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                    {cenaIdx + 1}/{escolhidas.length}{ehCapaCena && <span className="text-amber-300">⭐</span>}
                  </span>
                  {dupGrupo.get(cenaFoto.id) && (
                    <span className="absolute right-2 top-2 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-black">🔁{dupGrupo.get(cenaFoto.id)}</span>
                  )}
                  {/* play/pausar NO CENTRO da imagem (igual player de vídeo) — não rouba altura embaixo */}
                  <button
                    type="button"
                    onClick={() => setTocandoPrev((p) => !p)}
                    disabled={escolhidas.length < 2}
                    aria-label={tocandoPrev ? "Pausar" : "Tocar prévia"}
                    title={escolhidas.length < 2 ? "Adicione mais fotos pra tocar" : tocandoPrev ? "Pausar" : "Passar as cenas automaticamente"}
                    className={`absolute left-1/2 top-1/2 z-10 hidden h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xl text-white shadow-[0_8px_22px_-6px_rgba(168,85,247,0.7)] backdrop-blur transition disabled:opacity-30 lg:flex ${tocandoPrev ? "bg-black/45 opacity-70 hover:opacity-100" : "bg-gradient-to-br from-[#ec4899] to-[#a855f7]"}`}
                  >
                    {tocandoPrev ? "❚❚" : "▶"}
                  </button>
                  {/* setas SOBRE a imagem (nas laterais) — não roubam altura embaixo nem espremem o vídeo */}
                  {escolhidas.length > 1 && (
                    <>
                      <button type="button" onClick={() => irCena(-1)} aria-label="Cena anterior" className="absolute left-1.5 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 lg:flex lg:h-11 lg:w-11">◀</button>
                      <button type="button" onClick={() => irCena(1)} aria-label="Próxima cena" className="absolute right-1.5 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 lg:flex lg:h-11 lg:w-11">▶</button>
                    </>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-4xl">🎬</span>
                  <p className="text-sm font-semibold text-white">Seu vídeo aparece aqui</p>
                  <p className="text-[11px] text-muted">Escolha as fotos na aba <strong className="text-white/80">📷 Fotos</strong> pra montar as cenas.</p>
                </div>
              )}
            </div>
              {/* controles À DIREITA da imagem (só celular): tocar · avançar · ampliar */}
              {escolhidas.length > 0 && (
                <div className="flex w-11 shrink-0 flex-col items-center gap-2 lg:hidden">
                  <button type="button" onClick={() => setTocandoPrev((p) => !p)} disabled={escolhidas.length < 2} aria-label={tocandoPrev ? "Pausar" : "Tocar prévia"} title={escolhidas.length < 2 ? "Adicione mais fotos pra tocar" : tocandoPrev ? "Pausar" : "Passar as cenas"} className={`flex h-11 w-11 items-center justify-center rounded-full text-base text-white shadow-[0_8px_22px_-6px_rgba(168,85,247,0.7)] transition disabled:opacity-30 ${tocandoPrev ? "bg-black/50" : "bg-gradient-to-br from-[#ec4899] to-[#a855f7]"}`}>{tocandoPrev ? "❚❚" : "▶"}</button>
                  {escolhidas.length > 1 && (
                    <button type="button" onClick={() => irCena(1)} aria-label="Próxima cena" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition active:bg-white/15">▶</button>
                  )}
                  <button type="button" onClick={() => setPreviaCheia(true)} aria-label="Ver em tela cheia" title="Ver a sequência em tela cheia" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition active:bg-white/15">🔍</button>
                </div>
              )}
            </div>
            <p className="text-center text-[10px] text-muted/70">Prévia aproximada · formato 9:16 (Reels)</p>
          </div>

          {/* DIVISÓRIA ajustável (só nas telas grandes): arraste pra dar mais espaço pra um lado */}
          <div onPointerDown={iniciarArrasto} role="separator" aria-label="Arraste pra ajustar o tamanho do painel" title="Arraste pra ajustar o tamanho dos dois lados" className="hidden shrink-0 cursor-col-resize touch-none select-none items-center justify-center border-x border-white/10 bg-black/20 transition hover:bg-[#a855f7]/40 lg:flex lg:w-2.5">
            <span className="h-10 w-0.5 rounded-full bg-white/40" />
          </div>

          {/* PAINEL LATERAL — abas com todas as opções */}
          <div style={ehLg ? { width: larguraPainel } : undefined} className="flex min-h-0 flex-1 flex-col border-t border-white/10 bg-[#12111c] lg:flex-none lg:border-t-0">
            {/* as abas */}
            <div className="flex shrink-0 overflow-x-auto border-b border-white/10 bg-black/20">
              {ABAS.map((a) => (
                <button key={a.id} type="button" onClick={() => setAba(a.id)} className={`relative flex min-w-[64px] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold transition ${aba === a.id ? "text-white" : "text-muted hover:text-white"}`}>
                  <span className="text-base leading-none">{a.ic}</span>{a.label}
                  {aba === a.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#ec4899] to-[#a855f7]" />}
                </button>
              ))}
            </div>

            {/* o conteúdo da aba escolhida (rola só aqui dentro) */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>

              {/* ============ ABA FOTOS ============ */}
              {aba === "fotos" && (
                <div>
                  {/* atalhos rápidos */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button onClick={sugerir} className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40">✨ Sugerir</button>
                    {sel.length > 1 && <button onClick={reorganizar} title="Reencaixa as fotos que você adicionou na mão no lugar certo (na ordem dos momentos)" className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40">🔀 Reorganizar</button>}
                    {sel.length > 0 && <button onClick={() => setSel([])} className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:text-white">🧹 Limpar</button>}
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-muted">
                    <span className="text-amber-300">⭐</span> estrela = capa · <span className="text-white/80">⠿</span> arraste pra ordenar{dupGrupo.size > 0 && <> · <span className="rounded bg-amber-400 px-1 text-[9px] font-black text-black">🔁</span> = parecidas</>}
                    {capa && (<button type="button" onClick={() => setCapa("")} className="ml-1.5 rounded bg-white/10 px-2 py-0.5 font-semibold text-white transition hover:bg-vermelho">✕ tirar capa</button>)}
                  </p>

                  {/* SUA SEQUÊNCIA — fotos grandes, arraste pra reordenar, × pra tirar */}
                  {escolhidas.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted/80">🎞️ Sua sequência</p>
                      <div className="grid grid-cols-3 gap-2">
                        {escolhidas.map((f, i) => {
                          const ehCapa = capa === f.id;
                          return (
                          <div key={f.id}>
                          <div
                            data-id={f.id}
                            onClick={() => { setCena(i); setTocandoPrev(false); }}
                            onDragEnter={() => { if (dragId && dragId !== f.id) moverFoto(dragId, f.id); }}
                            onDragOver={(e) => e.preventDefault()}
                            className={`relative cursor-pointer select-none overflow-hidden rounded-lg border-2 transition-transform ${dragId === f.id ? "z-30 scale-105 border-[#c7b2ff] opacity-90 shadow-xl" : i === cenaIdx ? "border-[#c7b2ff] ring-2 ring-[#7c3aed]" : ehCapa ? "border-amber-400" : "border-vermelho"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={miniatura(f.url, 256)} alt="" draggable={false} loading="lazy" decoding="async" className="aspect-square w-full select-none object-cover" />
                            {/* ALÇA de arrastar — SÓ ela é arrastável (o resto do card rola a lista no celular).
                                Fica no TOPO pra não tapar a foto. Segure e arraste pra reordenar (PC e celular). */}
                            <div
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); setDragId(f.id); }}
                              onDragEnd={() => setDragId(null)}
                              onClick={(e) => e.stopPropagation()}
                              onTouchStart={(e) => { e.stopPropagation(); setDragId(f.id); if (typeof navigator !== "undefined" && navigator.vibrate) { try { navigator.vibrate(15); } catch {} } }}
                              onTouchMove={alcaMove}
                              onTouchEnd={() => setDragId(null)}
                              onTouchCancel={() => setDragId(null)}
                              onContextMenu={(e) => e.preventDefault()}
                              style={{ touchAction: "none" }}
                              aria-label="Segure e arraste pra mudar a ordem"
                              className="absolute left-1/2 top-1 z-20 flex h-7 w-9 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full bg-black/60 shadow-lg backdrop-blur-sm transition active:scale-95 active:bg-vermelho"
                            >
                              <span className="grid grid-cols-3 gap-[2.5px]">
                                {Array.from({ length: 6 }).map((_, k) => <span key={k} className="h-1 w-1 rounded-full bg-white/95" />)}
                              </span>
                            </div>
                            <span className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-vermelho text-xs font-bold text-white shadow">{i + 1}</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(f.id); }} aria-label="Tirar" className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/75 text-sm leading-none text-white transition hover:bg-vermelho">×</button>
                            {dupGrupo.get(f.id) && (
                              <span title="Foto PARECIDA com outra(s) da lista — evite repetir no vídeo" className="absolute right-1 top-8 z-10 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-black leading-none text-black shadow">🔁{dupGrupo.get(f.id)}</span>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); definirCapa(f.id); }} aria-label={ehCapa ? "Tirar capa" : "Definir como capa"} title={ehCapa ? "Tirar como capa (clique pra remover)" : "Usar esta foto como capa do vídeo"} className={`absolute bottom-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${ehCapa ? "bg-black/80 text-amber-300 ring-2 ring-amber-300 hover:bg-vermelho hover:text-white hover:ring-vermelho" : "bg-black/70 text-white hover:bg-black"}`}>⭐</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setAmpliada(f); }} aria-label="Ampliar" className="absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] text-white transition hover:bg-black">🔍</button>
                            <span className={`absolute bottom-0 left-0 right-0 px-8 py-0.5 text-center text-[9px] font-bold ${ehCapa ? "bg-amber-400/90 text-black" : "bg-black/65 font-semibold text-white/90"}`}>{ehCapa ? "⭐ CAPA" : (LABEL[f.momento] || f.momento)}</span>
                            </div>
                            {/* TEXTO da foto no vídeo (buffet). Na CAPA é a FRASE DE ABERTURA; nas outras, a legenda. */}
                            {tematicoId && (
                              <div className="mt-1 flex items-stretch gap-1">
                                <input
                                  type="text"
                                  value={textos[f.id] ?? ""}
                                  onChange={(e) => mudarTexto(f.id, e.target.value)}
                                  onBlur={() => salvarTextoFoto(f.id)}
                                  maxLength={ehCapa ? 48 : 80}
                                  placeholder={ehCapa ? "⭐ abertura" : "sem legenda"}
                                  title={ehCapa ? "Frase que ABRE o vídeo, sobre a foto de capa (curta e forte). Vazia = entra o nome do tema." : "Frase que aparece embaixo desta foto no vídeo (vazio = sem texto)"}
                                  className={`min-w-0 flex-1 rounded-md border bg-preto px-1.5 py-1 text-[10px] text-white placeholder:text-muted/40 focus:outline-none ${ehCapa ? (textos[f.id]?.trim() ? "border-amber-400" : "border-amber-400/40") : textos[f.id]?.trim() ? "border-[#7c3aed]/60" : "border-linha"}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => biaEscreveNaFoto(f.id)}
                                  disabled={biaNaFoto !== null}
                                  title={textos[f.id]?.trim() ? "A Bia escreve OUTRA frase pra esta foto" : ehCapa ? "A Bia escreve a frase de abertura" : "A Bia escreve a legenda desta foto"}
                                  className="shrink-0 rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-1.5 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/30 disabled:opacity-40"
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

                  {/* ADICIONAR — toque na ordem que quiser e a foto sobe pra sequência */}
                  {disponiveis.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] text-muted">
                        {escolhidas.length > 0 ? "➕ Mais fotos" : "👆 Toque nas fotos na ordem que você quer"} — cada toque adiciona ao fim. Pra ~65s, escolha umas <strong className="text-white/80">25-28</strong>.
                      </p>
                      {/* FILTRO por tipo de foto — só aparece se houver 2+ tipos. */}
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
                      <div className="grid grid-cols-3 gap-2">
                        {disponiveisFiltradas.map((f) => {
                          const ehCapa = capa === f.id;
                          return (
                          <div key={f.id} onClick={() => toggle(f.id)} title="Tocar pra adicionar" className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition ${ehCapa ? "border-amber-400" : "border-transparent hover:border-white/30"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={miniatura(f.url, 256)} alt="" loading="lazy" decoding="async" className={`aspect-square w-full object-cover transition ${ehCapa ? "" : "opacity-60 group-hover:opacity-100"}`} />
                            {dupGrupo.get(f.id) && (
                              <span title="Foto PARECIDA com outra(s) da lista — evite repetir no vídeo" className="absolute left-1 top-1 z-10 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-black leading-none text-black shadow">🔁{dupGrupo.get(f.id)}</span>
                            )}
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
              )}

              {/* ============ ABA MÚSICA ============ */}
              {aba === "musica" && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">🎵 Música do vídeo</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a href="https://pixabay.com/music/" target="_blank" rel="noopener noreferrer" title="Abrir o Pixabay Music (trilhas grátis e liberadas) numa aba nova" className="rounded-lg border border-linha px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-white/30 hover:text-white">🔎 Buscar</a>
                      <label className={`rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 ${subindoMusica ? "opacity-60" : "cursor-pointer"}`}>
                        {subindoMusica ? "🎵 enviando…" : "➕ Enviar"}
                        {/* SEM accept="audio/*": no iPad esse filtro TRAVA os MP3 no seletor (bug do iOS). */}
                        <input type="file" className="hidden" disabled={subindoMusica} onChange={(e) => enviarMusica(e.target.files?.[0])} />
                      </label>
                    </div>
                  </div>

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
                          {tematicoId && (m.wav
                            ? <span title="Pronta pra entrar sob a voz na narração" className="shrink-0 text-[10px] font-semibold text-green-400">🎙️✓</span>
                            : <span title="Preparando pra narração… (deixe a tela aberta um instante)" className="shrink-0 animate-pulse text-[10px] text-amber-300/80">🎙️⏳</span>)}
                          {escolhida && <span className="shrink-0 text-[10px] font-bold text-[#c7b2ff]">✓ escolhida</span>}
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-[10px] leading-snug text-muted/70">Baixe trilhas grátis em <a href="https://pixabay.com/music/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#c7b2ff] underline">Pixabay Music</a> (botão <strong className="text-white/70">🔎 Buscar</strong>) e toque em <strong className="text-white/70">➕ Enviar</strong>. Use o <strong className="text-white/70">▶️</strong> pra ouvir antes — as enviadas ficam guardadas aqui pra reusar.</p>
                  {tematicoId && (
                    <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-300/90">⚠️ No vídeo do buffet, a música escolhida vale quando o vídeo <strong>não tem narração (voz)</strong>. Com narração, ela entra <strong>por baixo da voz</strong> (aba 🎙️ Narração).</p>
                  )}
                </div>
              )}

              {/* ============ ABA ESTILO ============ */}
              {aba === "estilo" && (
                <div className="flex flex-col gap-3">
                  {/* FUNDO do vídeo (só no buffet/temático) */}
                  {tematicoId && (
                    <div>
                      <span className="text-[11px] font-semibold text-white">🎬 Fundo do vídeo</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {[{ id: "", emoji: "🖼️", label: "Foto borrada" }, { id: "cheia", emoji: "🔳", label: "Foto na tela toda" }, { id: "cor", emoji: "🎨", label: "Cor" }].map((f) => (
                          <button key={f.id || "borrada"} type="button" onClick={() => trocarFundo(f.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${fundo === f.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                            {f.id === "cor" && <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: corDoFundo }} />}
                            {f.id !== "cor" && f.emoji} {f.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-muted/70">🖼️ <strong className="text-white/70">Borrada</strong>: a foto desfocada atrás, com a moldura. 🔳 <strong className="text-white/70">Na tela toda</strong>: a foto preenche tudo (sem moldura; corta as beiradas). 🎨 <strong className="text-white/70">Cor</strong>: a foto emoldurada sobre um degradê de cor. Veja na prévia. Vale no próximo <strong className="text-white/70">Gerar</strong>.</p>
                      {/* PALETA de cores do fundo (só quando o fundo é "cor") */}
                      {fundo === "cor" && (
                        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                          <p className="mb-1.5 text-[11px] font-semibold text-white">🎨 Cor do fundo</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => trocarCorFundo("")} aria-label="Cor da marca" title="Cor da marca (padrão)" className={`h-8 w-8 rounded-full border-2 transition ${!corFundo ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: corMarca }} />
                            {CORES_FUNDO.map((c) => (
                              <button key={c} type="button" onClick={() => trocarCorFundo(c)} aria-label={`Cor ${c}`} title={c} className={`h-8 w-8 rounded-full border-2 transition ${corFundo.toUpperCase() === c ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: c }} />
                            ))}
                          </div>
                          <p className="mt-1.5 text-[10px] leading-snug text-muted/70">A 1ª bolinha é a <strong className="text-white/70">cor da marca</strong>. Toque numa cor pra o fundo usar ela (num degradê pra escuro).</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MOLDURA das fotos */}
                  <div>
                    <span className="text-[11px] font-semibold text-white">🖼️ Moldura das fotos</span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {MOLDURAS_UI.filter((m) => tematicoId || m.id !== "preta").map((m) => (
                        <button key={m.id} type="button" onClick={() => setMoldura(m.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${moldura === m.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>
                          {m.id === "marca" && <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: corDaMoldura }} />}
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {/* PALETA da moldura (só no buffet, quando a moldura é "Cor") — mesmo padrão do fundo */}
                    {tematicoId && moldura === "marca" && (
                      <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                        <p className="mb-1.5 text-[11px] font-semibold text-white">🎨 Cor da moldura</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => trocarCorMoldura("")} aria-label="Cor da marca" title="Cor da marca (padrão)" className={`h-8 w-8 rounded-full border-2 transition ${!corMoldura ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: corMarca }} />
                          {CORES_FUNDO.map((c) => (
                            <button key={c} type="button" onClick={() => trocarCorMoldura(c)} aria-label={`Cor ${c}`} title={c} className={`h-8 w-8 rounded-full border-2 transition ${corMoldura.toUpperCase() === c ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: c }} />
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] leading-snug text-muted/70">A 1ª bolinha é a <strong className="text-white/70">cor da marca</strong>. Toque numa cor pra a borda da foto usar ela.</p>
                      </div>
                    )}
                    {fundoCheia && <p className="mt-1 text-[10px] leading-snug text-amber-300/80">Com o fundo <strong>🔳 na tela toda</strong>, a foto preenche a tela e a moldura não aparece.</p>}
                  </div>

                  {/* MASCOTE no vídeo (se a marca tem mascote). Buffet = todos os quadros; festa = só a capa. */}
                  {mascoteUrl && (
                    <div>
                      <span className="text-[11px] font-semibold text-white">🦸 Mascote {tematicoId ? "no vídeo" : "na capa"}</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {[{ id: "", l: "Não" }, { id: "cima-esq", l: "Cima ↖" }, { id: "cima-dir", l: "Cima ↗" }, { id: "esq", l: "Baixo ↙" }, { id: "dir", l: "Baixo ↘" }].map((o) => (
                          <button key={o.id || "nao"} type="button" onClick={() => trocarMascoteCanto(o.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${mascoteCanto === o.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{o.l}</button>
                        ))}
                      </div>
                      {mascoteCanto && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] text-muted">Tamanho:</span>
                          {[{ id: "p", l: "P" }, { id: "m", l: "M" }, { id: "g", l: "G" }].map((o) => (
                            <button key={o.id} type="button" onClick={() => trocarMascoteTam(o.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${mascoteTam === o.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{o.l}</button>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] leading-snug text-muted/70">{tematicoId ? "Aparece em todos os quadros." : "Aparece só na capa (abertura) — as fotos da festa ficam como estão."} Dica: evite <strong className="text-white/70">baixo à direita</strong> — é onde o vídeo carimba o logo.</p>
                    </div>
                  )}

                  {/* LOGO com posição própria (só buffet e se a marca tem logo) */}
                  {tematicoId && logoUrlMarca && (
                    <div>
                      <span className="text-[11px] font-semibold text-white">🏷️ Logo no vídeo</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {[{ id: "", l: "Padrão" }, { id: "cima-esq", l: "Cima ↖" }, { id: "cima-dir", l: "Cima ↗" }, { id: "esq", l: "Baixo ↙" }, { id: "dir", l: "Baixo ↘" }].map((o) => (
                          <button key={o.id || "padrao"} type="button" onClick={() => trocarLogoCanto(o.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${logoCanto === o.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{o.l}</button>
                        ))}
                      </div>
                      {logoCanto && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] text-muted">Tamanho:</span>
                          {[{ id: "p", l: "P" }, { id: "m", l: "M" }, { id: "g", l: "G" }].map((o) => (
                            <button key={o.id} type="button" onClick={() => trocarLogoTam(o.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${logoTam === o.id ? "border-vermelho bg-vermelho text-white" : "border-linha bg-preto text-muted hover:border-white/30 hover:text-white"}`}>{o.l}</button>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] leading-snug text-muted/70">Em <strong className="text-white/70">Padrão</strong>, o vídeo carimba o logo sozinho (embaixo à direita). Escolhendo um canto, você posiciona o logo do seu jeito.</p>
                    </div>
                  )}

                  {/* mini-preview "como fica" — clica pra ampliar */}
                  {fotoPrevFV && !fundoCheia && (
                    <button type="button" onClick={() => setAmpliada(fotoPrevFV)} title="Clique pra ampliar a prévia" className="group/p flex items-center gap-2 self-start rounded-lg border border-linha bg-preto/40 p-2">
                      <span className="flex items-center justify-center rounded-md bg-zinc-700/50 p-2 transition group-hover/p:bg-zinc-600/70">
                        <span className="block" style={estiloMoldura(moldura, corDaMoldura)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={miniatura(fotoPrev, 128)} alt="" decoding="async" className="block h-16 w-16 object-cover" style={{ borderRadius: moldura === "nenhuma" ? 2 : 0 }} />
                        </span>
                      </span>
                      <span className="text-left text-[10px] leading-tight text-muted">como a moldura fica<br /><span className="text-[#c7b2ff] group-hover/p:underline">🔍 ampliar</span></span>
                    </button>
                  )}
                </div>
              )}

              {/* ============ ABA CAPA (só buffet) — a capa chamativa ============ */}
              {aba === "capa" && tematicoId && (() => {
                const capaFoto = escolhidas.find((f) => f.id === capaId) || escolhidas[0] || null;
                const chamada = (textos[capaId] || "").trim();
                return (
                  <div className="flex flex-col gap-3">
                    <div>
                      <h4 className="m-0 text-sm font-semibold text-white">🎯 Capa do vídeo</h4>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">A capa é o <strong className="text-white/80">1º quadro</strong> — o que segura o dedo de quem rola o feed. Uma capa chamativa traz <strong className="text-white/80">bem mais visualizações</strong>.</p>
                    </div>

                    {/* estilo da capa */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "", emoji: "🖼️", nome: "Clássica", desc: "foto + frase" },
                        { id: "impacto", emoji: "🔥", nome: "Impacto", desc: "foto cheia + texto" },
                        { id: "ia", emoji: "🤖", nome: "IA", desc: "arte festiva" },
                        { id: "recortado", emoji: "✂️", nome: "Recortado", desc: "assunto recortado + cor (tipo YouTube)" },
                      ].map((op) => (
                        <button key={op.id || "classica"} type="button" onClick={() => trocarCapaEstilo(op.id)} className={`rounded-xl border p-2 text-left transition ${capaEstilo === op.id ? "border-[#a855f7] bg-[#a855f7]/10 ring-2 ring-[#a855f7]/30" : "border-white/12 bg-white/[0.03] hover:border-white/30"}`}>
                          <div className="text-[13px] font-bold text-white">{op.emoji} {op.nome}</div>
                          <div className="mt-0.5 text-[10px] leading-snug text-muted">{op.desc}</div>
                        </button>
                      ))}
                    </div>

                    {/* painel do RECORTE (só quando o estilo é "recortado") */}
                    {capaEstilo === "recortado" && (
                      <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/[0.06] p-2.5">
                        <p className="text-[11px] leading-snug text-muted">✂️ A IA <strong className="text-white/80">recorta o assunto</strong> da sua foto (tira o fundo) e monta sobre uma <strong className="text-white/80">cor forte</strong> + seu texto — tipo thumbnail de YouTube. Os rostos ficam <strong className="text-white/80">como na foto</strong>.</p>
                        <button type="button" onClick={gerarRecorte} disabled={gerandoRecorte} className="mt-2 w-full rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)] transition hover:brightness-110 disabled:opacity-60">{gerandoRecorte ? "✂️ recortando… (uns 15-30s)" : capaRecorteUrl ? "🔄 Recortar de novo" : "✂️ Recortar minha foto"}</button>
                        {erroRecorte && <p className="mt-1.5 text-[11px] font-semibold text-vermelho">{erroRecorte}</p>}
                        {!capaRecorteUrl && !gerandoRecorte && !erroRecorte && <p className="mt-1.5 text-[10px] leading-snug text-amber-300/80">Recorta a <strong className="text-white/70">foto da capa</strong> (a de ⭐ abaixo).</p>}
                        {/* COR do fundo do recorte — paleta aqui mesmo (a prévia atualiza na hora) */}
                        <div className="mt-2.5 border-t border-white/10 pt-2">
                          <p className="mb-1.5 text-[10px] font-semibold text-white/80">🎨 Cor do fundo</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => trocarCorFundo("")} aria-label="Cor da marca" title="Cor da marca (padrão)" className={`h-7 w-7 rounded-full border-2 transition ${!corFundo ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: corMarca }} />
                            {CORES_FUNDO.map((c) => (
                              <button key={c} type="button" onClick={() => trocarCorFundo(c)} aria-label={`Cor ${c}`} title={c} className={`h-7 w-7 rounded-full border-2 transition ${corFundo.toUpperCase() === c ? "border-white ring-2 ring-white/40" : "border-white/20 hover:border-white/50"}`} style={{ background: c }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* painel da IA (só quando o estilo é "ia") */}
                    {capaEstilo === "ia" && (
                      <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/[0.06] p-2.5">
                        <p className="text-[11px] leading-snug text-muted">🤖 A IA cria uma <strong className="text-white/80">arte festiva</strong> (balões, confete, cores do buffet) — <strong className="text-white/80">sem rostos</strong>. Sua chamada entra por cima.</p>
                        <button type="button" onClick={gerarArteCapa} disabled={gerandoCapaIa} className="mt-2 w-full rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_-8px_rgba(168,85,247,0.7)] transition hover:brightness-110 disabled:opacity-60">{gerandoCapaIa ? "🎨 criando a arte… (uns 15-30s)" : capaIaUrl ? "🔄 Gerar outra arte" : "✨ Gerar arte com IA"}</button>
                        {erroCapaIa && <p className="mt-1.5 text-[11px] font-semibold text-vermelho">{erroCapaIa}</p>}
                        {!capaIaUrl && !gerandoCapaIa && !erroCapaIa && <p className="mt-1.5 text-[10px] leading-snug text-amber-300/80">Ainda sem arte — toque em ✨ Gerar. Enquanto não gera, a capa usa a sua foto.</p>}
                        {/* BIBLIOTECA de artes já geradas (reusar sem gastar) */}
                        {bancoCapa.length > 0 && (
                          <div className="mt-2.5 border-t border-white/10 pt-2">
                            <p className="mb-1.5 text-[10px] font-semibold text-white/80">🖼️ Suas artes salvas <span className="font-normal text-muted">— toque pra reusar (de graça)</span></p>
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {bancoCapa.map((u) => (
                                <button key={u} type="button" onClick={() => usarArteSalva(u)} className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition ${capaIaUrl === u ? "border-[#a855f7] ring-2 ring-[#a855f7]/40" : "border-white/10 opacity-80 hover:opacity-100"}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={u} alt="" className="h-20 w-[52px] object-cover" />
                                  {capaIaUrl === u && <span className="absolute bottom-0 right-0 rounded-tl bg-[#a855f7] px-1 text-[9px] font-bold text-white">✓</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* prévia da capa */}
                    {(() => {
                      const grande = capaEstilo === "impacto" || capaEstilo === "ia" || capaEstilo === "recortado";
                      const ehRecorte = capaEstilo === "recortado" && !!capaRecorteUrl;
                      const bgPrev = capaEstilo === "ia" && capaIaUrl ? capaIaUrl : capaFoto?.url || "";
                      if (!bgPrev && !ehRecorte) return <p className="rounded-lg border border-dashed border-white/15 py-4 text-center text-[11px] text-muted">Escolha as fotos na aba <strong className="text-white/80">📷 Fotos</strong> primeiro.</p>;
                      return (
                        <div className="flex flex-col items-center gap-1.5">
                          <button type="button" onClick={() => setCapaCheia(true)} title="Ver a capa maior" className="relative aspect-[9/16] w-40 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                            {ehRecorte ? (
                              <>
                                {capaIaUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={capaIaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                  <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${corDoFundo}, #101018)` }} />
                                )}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={capaRecorteUrl} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom" />
                              </>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={bgPrev} alt="" className="absolute inset-0 h-full w-full object-cover" />
                            )}
                            <span className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-xs text-white backdrop-blur">🔍</span>
                            {grande ? (
                              <div className="absolute inset-0 flex flex-col justify-end p-2.5" style={{ backgroundImage: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.35) 63%, rgba(0,0,0,0.92) 100%)" }}>
                                <div className="mb-1.5 h-1.5 w-9 rounded-full" style={{ background: corMarca }} />
                                <span className="font-black uppercase leading-[1.05] text-white" style={{ fontSize: 15, textShadow: "1.5px 1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px -1.5px 0 #000,0 3px 10px rgba(0,0,0,0.7)" }}>{chamada.toUpperCase() || "SUA CHAMADA AQUI"}</span>
                              </div>
                            ) : (
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8 text-center">
                                <span className="text-[12px] font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{chamada || nome}</span>
                              </div>
                            )}
                          </button>
                          <button type="button" onClick={() => setCapaCheia(true)} className="text-[10px] font-semibold text-[#c7b2ff] underline">🔍 ver a capa maior</button>
                          <span className="text-[10px] text-muted/70">o logo entra no topo</span>
                        </div>
                      );
                    })()}

                    {/* a foto da capa (escolher entre as da sequência) */}
                    {escolhidas.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-white">Foto da capa <span className="font-normal text-muted">(toque pra trocar)</span></p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {escolhidas.map((f) => (
                            <button key={f.id} type="button" onClick={() => { if (f.id !== capaId) definirCapa(f.id); }} className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition ${f.id === capaId ? "border-amber-400 ring-2 ring-amber-400/40" : "border-white/10 opacity-70 hover:opacity-100"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={miniatura(f.url, 128)} alt="" loading="lazy" decoding="async" className="h-16 w-11 object-cover" />
                              {f.id === capaId && <span className="absolute bottom-0 right-0 rounded-tl bg-amber-400 px-0.5 text-[9px]">⭐</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* a chamada (frase da capa) */}
                    {capaId && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-white">Chamada da capa <span className="font-normal text-muted">(a frase que aparece grande)</span></p>
                        <div className="flex items-stretch gap-1.5">
                          <input
                            type="text"
                            value={textos[capaId] ?? ""}
                            onChange={(e) => mudarTexto(capaId, e.target.value)}
                            onBlur={() => salvarTextoFoto(capaId)}
                            maxLength={48}
                            placeholder="Ex: O DIA MAIS FELIZ! 🎉"
                            className="min-w-0 flex-1 rounded-lg border border-amber-400/40 bg-preto px-3 py-2 text-sm text-white placeholder:text-muted/40 focus:border-amber-400 focus:outline-none"
                          />
                          <button type="button" onClick={() => biaEscreveNaFoto(capaId)} disabled={biaNaFoto !== null} title="A Bia escreve uma chamada de impacto pra capa" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-3 text-sm font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/30 disabled:opacity-40">{biaNaFoto === capaId ? "…" : "✨"}</button>
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-muted/70">Curta e forte (até ~48 letras). No estilo <strong className="text-white/70">🔥 Impacto</strong> ela entra <strong className="text-white/70">GIGANTE</strong>, com contorno, sobre a foto.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ============ ABA NARRAÇÃO (só buffet) ============ */}
              {aba === "narr" && tematicoId && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">🎙️ Narração <span className="font-normal text-muted">(uma voz falando no vídeo)</span></span>
                    {audioUrl && (
                      <button type="button" onClick={tirarNarracao} disabled={gerandoVoz} className="shrink-0 rounded-md border border-red-900/60 px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">✕ tirar a voz</button>
                    )}
                  </div>

                  {/* 1) o que você quer anunciar */}
                  <div className="mt-2">
                    <label className="block text-[10px] font-semibold text-muted">O que você quer anunciar?</label>
                    <input
                      type="text"
                      value={briefing}
                      onChange={(e) => setBriefing(e.target.value)}
                      placeholder="Ex: promoção de julho — fechou até dia 20, ganha 10 pessoas grátis"
                      className="mt-1 w-full rounded-md border border-linha bg-preto px-2 py-2 text-[11px] text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
                    />
                    <button type="button" onClick={biaEscreveRoteiro} disabled={escrevendoRoteiro || gerandoVoz} title="A Bia escreve o roteiro da locução (texto feito pra ser FALADO)" className="mt-1.5 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50">
                      {escrevendoRoteiro ? "✍️ escrevendo…" : "✨ Bia escreve o roteiro"}
                    </button>
                  </div>

                  {/* 2) o roteiro (editável) — a 1ª FALA */}
                  <textarea
                    value={roteiro}
                    onChange={(e) => setRoteiro(e.target.value)}
                    rows={4}
                    maxLength={1200}
                    placeholder="O roteiro da fala aparece aqui — dá pra editar cada palavra."
                    className="mt-2 w-full rounded-md border border-linha bg-preto px-2.5 py-2 text-[11px] leading-relaxed text-white placeholder:text-muted/40 focus:border-emerald-500 focus:outline-none"
                  />

                  {/* 2b) a 2ª FALA (CTA no fim) — opcional */}
                  <div className="mt-2.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[11px] font-semibold text-white">🔁 Fala do final <span className="font-normal text-muted">(o convite)</span></span>
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
                    <p className="mt-1 text-[10px] leading-snug text-muted/70">Em branco = a voz fala só no começo e a música leva até o fim. Com uma fala aqui, a voz <strong className="text-white/70">volta no fim</strong> — e <strong className="text-white/70">todas as fotos aparecem</strong>.</p>
                  </div>

                  {/* 3) COMO A VOZ FALA (a direção) */}
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

                  {/* 4) VOLUME da música de fundo */}
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
                    <p className="mt-1 text-[10px] leading-snug text-muted/70">Arraste pra deixar a <strong className="text-white/70">música mais baixa ou mais alta</strong> por trás da voz. Tudo à esquerda = <strong className="text-white/70">só a voz</strong>. A música é a que você escolheu na aba <strong className="text-white/70">🎵 Música</strong>.</p>
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
                    <button type="button" onClick={ouvirNarracao} disabled={gerandoVoz || roteiro.trim().length < 20} title={roteiro.trim().length < 20 ? "Escreva o roteiro primeiro" : "Gera a voz com a música por baixo e toca aqui"} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                      {gerandoVoz ? "🎙️ gerando…" : audioUrl ? "🔊 Ouvir de novo" : "🔊 Ouvir"}
                    </button>
                  </div>

                  {/* player + aviso de quantas fotos o vídeo vai usar */}
                  {audioUrl && (() => {
                    const precisa = fotosParaDuracao(audioSeg);
                    const temFotos = sel.length;
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
                  {!audioUrl && !msgVoz && <p className="mt-1.5 text-[10px] leading-snug text-muted/80">Sem narração, o vídeo sai com o <strong className="text-white/70">jingle do buffet</strong> como hoje. Com narração, a voz entra por cima da música.</p>}
                </div>
              )}

              {/* ============ ABA TEXTOS ============ */}
              {aba === "texto" && (
                <div className="flex flex-col gap-3">
                  {/* TÍTULO DA CAPA (só festa) */}
                  {!tematicoId && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">✍️ Título da capa</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {tituloCapa.trim() && (
                            <button type="button" onClick={() => setTituloCapa("")} title="Voltar pro título automático" className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-vermelho">✕ automático</button>
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
                      <p className="mt-1.5 text-[10px] leading-snug text-muted/70">A frase grande na <strong className="text-white/70">1ª tela</strong>. Em branco = usa o automático{tituloCapaAuto ? <> (<span className="text-white/70">{tituloCapaAuto}</span>)</> : ""}. O texto <strong className="text-white/70">quebra a linha sozinho</strong>.</p>
                    </div>
                  )}

                  {/* COPY DO VÍDEO (só buffet): escreve a abertura + legendas de uma vez */}
                  {tematicoId && (
                    <div className="rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">💬 Legendas nas fotos</span>
                        <button type="button" onClick={biaEscreveCopy} disabled={escrevendoCopy || sel.length < 2} title={sel.length < 2 ? "Escolha as fotos primeiro" : "A Bia escreve uma copy com começo, meio e fim — frases em algumas fotos-chave"} className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-50">{escrevendoCopy ? "✍️ escrevendo…" : "✨ Bia escreve a copy"}</button>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-snug text-muted/80">
                        Escreve o vídeo INTEIRO de uma vez: a <strong className="text-amber-200">frase de abertura</strong> (na capa) + legendas em <strong className="text-white/70">algumas fotos-chave</strong>. Depois dá pra editar cada uma na aba <strong className="text-white/70">📷 Fotos</strong> (campo embaixo de cada foto, ou o <strong className="text-[#d6c6ff]">✨</strong> ao lado). Apagar o texto tira a legenda.
                      </p>
                      {msgCopy && <p className={`mt-1.5 text-[11px] font-semibold ${msgCopy.startsWith("✓") ? "text-green-400" : "text-vermelho"}`}>{msgCopy}</p>}
                    </div>
                  )}

                  {/* TEXTO DO FINAL (os dois tipos) */}
                  <div className="rounded-lg border border-linha bg-preto/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">✍️ Texto do final do vídeo</span>
                      <button type="button" onClick={biaEscreve} disabled={gerandoTexto} title="A Bia cria uma frase carinhosa de encerramento (usa o nome, a idade e o tema)" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1 text-[11px] font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-60">{gerandoTexto ? "✍️ escrevendo…" : "✨ Bia escreve"}</button>
                    </div>
                    <input type="text" value={textoFinal} onChange={(e) => setTextoFinal(e.target.value)} maxLength={48} placeholder='Em branco = "Muito obrigado!"' className="mt-2 w-full rounded-lg border border-linha bg-preto px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:border-vermelho focus:outline-none" />
                    <p className="mt-1.5 text-[10px] leading-snug text-muted/70">Aparece no <strong className="text-white/70">último quadro</strong> do vídeo, com o logo. Curtinha (até ~48 letras).</p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ---------- LINHA DO TEMPO (embaixo): as cenas na ordem — toque pra ver na prévia ---------- */}
        <div className="shrink-0 border-t border-white/10 bg-black/30 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">🎞️ Linha do tempo · {sel.length} {sel.length === 1 ? "cena" : "cenas"}{segs ? ` · ≈ ${segs}s` : ""}</span>
            {segs > 90 ? <span className="text-[10px] font-bold text-vermelho">● passa de 90s</span> : escolhidas.length > 0 && <span className="text-[10px] font-bold text-emerald-400">● pronto pra gerar</span>}
          </div>
          {escolhidas.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {escolhidas.map((f, i) => (
                <button key={f.id} type="button" onClick={() => { setCena(i); setTocandoPrev(false); }} title={`Cena ${i + 1}`} className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition ${i === cenaIdx ? "border-[#c7b2ff] ring-2 ring-[#a855f7]" : capaId === f.id ? "border-amber-400" : "border-white/10 opacity-70 hover:opacity-100"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={miniatura(f.url, 128)} alt="" loading="lazy" decoding="async" className="h-16 w-11 object-cover" />
                  <span className="absolute left-0 top-0 rounded-br-md bg-black/70 px-1 text-[9px] font-bold text-white">{i + 1}</span>
                  {capaId === f.id && <span className="absolute bottom-0 right-0 rounded-tl bg-amber-400 px-0.5 text-[8px]">⭐</span>}
                  {dupGrupo.get(f.id) && <span className="absolute right-0 top-0 rounded-bl bg-amber-400 px-0.5 text-[8px] font-black text-black">🔁</span>}
                </button>
              ))}
              <button type="button" onClick={() => setAba("fotos")} title="Adicionar fotos" className="flex h-16 w-11 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 text-lg text-muted transition hover:border-[#a855f7] hover:text-white">＋</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAba("fotos")} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-3 text-[11px] font-semibold text-muted transition hover:border-[#a855f7] hover:text-white">📷 Escolher as fotos do vídeo →</button>
          )}
        </div>
      </div>

      {/* player ÚNICO (escondido) que o ▶️/⏸ de cada trilha da aba Música controla */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} onEnded={() => setTocando("")} className="hidden" />

      {/* PRÉVIA EM TELA CHEIA — pra ver a sequência de perto (principalmente no celular). Usa a
          MESMA cena/estado da prévia pequena; ◀ ▶ trocam a cena e ▶ passa sozinho. */}
      {previaCheia && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/95 p-4" onClick={(e) => { e.stopPropagation(); setPreviaCheia(false); setTocandoPrev(false); }}>
          <div onClick={(e) => e.stopPropagation()} className="relative aspect-[9/16] h-[72vh] max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15">
            {cenaFoto ? (
              <>
                {fundoCheia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <>
                    {fundoCor ? (
                      <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${corDoFundo}, #101018)` }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg brightness-[0.45]" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <span className="block max-h-full max-w-full" style={estiloMoldura(moldura, corDaMoldura, 3)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={miniatura(cenaFoto.url, 640)} alt="" decoding="async" className="block max-h-[62vh] w-auto max-w-full object-contain" style={{ borderRadius: moldura === "nenhuma" ? 3 : 0 }} />
                      </span>
                    </div>
                  </>
                )}
                {legendaCena && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-5 pt-12 text-center">
                    <span className={`inline-block font-black leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${ehCapaCena ? "text-2xl" : "text-lg"}`}>{legendaCena}</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{cenaIdx + 1}/{escolhidas.length}{ehCapaCena && <span className="text-amber-300">⭐</span>}</span>
                {/* MASCOTE (prévia) — buffet em todas as cenas; festa só na capa */}
                {mascoteCanto && mascoteUrl && (tematicoId || ehCapaCena) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mascoteUrl} alt="" className="pointer-events-none absolute w-auto object-contain" style={{ ...(mascoteCanto.startsWith("cima") ? { top: "6%" } : { bottom: "6%" }), ...(mascoteCanto.endsWith("dir") ? { right: "5%" } : { left: "5%" }), height: mascoteTam === "p" ? "12%" : mascoteTam === "g" ? "28%" : "19%", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }} />
                )}
                {tematicoId && logoCanto && logoUrlMarca && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrlMarca} alt="" className="pointer-events-none absolute h-auto object-contain" style={{ ...(logoCanto.startsWith("cima") ? { top: "3%" } : { bottom: "3%" }), ...(logoCanto.endsWith("dir") ? { right: "4%" } : { left: "4%" }), width: logoTam === "p" ? "19%" : logoTam === "g" ? "37%" : "28%", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} />
                )}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => irCena(-1)} aria-label="Cena anterior" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition active:bg-white/15">◀</button>
            <button type="button" onClick={() => setTocandoPrev((p) => !p)} disabled={escolhidas.length < 2} aria-label={tocandoPrev ? "Pausar" : "Tocar"} className={`flex h-14 w-14 items-center justify-center rounded-full text-xl text-white shadow-[0_8px_22px_-6px_rgba(168,85,247,0.7)] transition disabled:opacity-40 ${tocandoPrev ? "bg-black/50" : "bg-gradient-to-br from-[#ec4899] to-[#a855f7]"}`}>{tocandoPrev ? "❚❚" : "▶"}</button>
            <button type="button" onClick={() => irCena(1)} aria-label="Próxima cena" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition active:bg-white/15">▶</button>
          </div>
          <button type="button" onClick={() => { setPreviaCheia(false); setTocandoPrev(false); }} className="rounded-lg border border-white/20 px-4 py-1.5 text-xs font-semibold text-white transition active:bg-white/10">Fechar</button>
        </div>
      )}

      {/* CAPA em tela cheia — vê a capa grande, do jeito do estilo escolhido (impacto/ia/clássica). */}
      {capaCheia && (() => {
        const cf = escolhidas.find((f) => f.id === capaId) || escolhidas[0] || null;
        const ehRecorte = capaEstilo === "recortado" && !!capaRecorteUrl;
        const bg = capaEstilo === "ia" && capaIaUrl ? capaIaUrl : cf?.url || "";
        const ch = (textos[capaId] || "").trim();
        const grande = capaEstilo === "impacto" || capaEstilo === "ia" || capaEstilo === "recortado";
        return (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/95 p-4" onClick={(e) => { e.stopPropagation(); setCapaCheia(false); }}>
            <p className="text-center text-xs font-semibold text-white/80">👇 Assim a capa vai aparecer (o logo entra no topo)</p>
            <div onClick={(e) => e.stopPropagation()} className="relative aspect-[9/16] h-[72vh] max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15">
              {(bg || ehRecorte) ? (
                <>
                  {ehRecorte ? (
                    <>
                      {capaIaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={capaIaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${corDoFundo}, #101018)` }} />
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={capaRecorteUrl} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom" />
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  {grande ? (
                    <div className="absolute inset-0 flex flex-col justify-end p-6" style={{ backgroundImage: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.35) 63%, rgba(0,0,0,0.92) 100%)" }}>
                      <div className="mb-3 h-2.5 w-20 rounded-full" style={{ background: corMarca }} />
                      <span className="font-black uppercase leading-[1.04] text-white" style={{ fontSize: 34, textShadow: "2px 2px 0 #000,-2px 2px 0 #000,2px -2px 0 #000,-2px -2px 0 #000,0 4px 16px rgba(0,0,0,0.7)" }}>{ch.toUpperCase() || "SUA CHAMADA AQUI"}</span>
                    </div>
                  ) : (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6 pt-20 text-center">
                      <span className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{ch || nome}</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <button type="button" onClick={() => setCapaCheia(false)} className="rounded-lg border border-white/20 px-4 py-1.5 text-xs font-semibold text-white transition active:bg-white/10">Fechar</button>
          </div>
        );
      })()}

      {/* foto ampliada — mostra COM a moldura escolhida (fundo borrado), igual vai ficar no vídeo. */}
      {ampliada && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={(e) => { e.stopPropagation(); setAmpliada(null); }}>
          <p className="text-center text-xs font-semibold text-white/80">👇 Assim essa foto vai aparecer no vídeo{moldura !== "nenhuma" ? " (com a moldura)" : ""}</p>
          <div onClick={(e) => e.stopPropagation()} className="relative aspect-[9/16] h-[76vh] max-w-full overflow-hidden rounded-2xl border-[6px] border-zinc-800 bg-black shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50" />
            <div className="absolute inset-0 flex items-center justify-center p-5">
              <span className="block" style={estiloMoldura(moldura, corDaMoldura, 4)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ampliada.url} alt="" className="block max-h-[58vh] w-auto max-w-full object-contain" style={{ borderRadius: moldura === "nenhuma" ? 4 : 0 }} />
              </span>
            </div>
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">{LABEL[ampliada.momento] || ampliada.momento}</span>
            {/* MASCOTE na prévia ampliada (buffet: aparece em todos os quadros) */}
            {mascoteCanto && mascoteUrl && tematicoId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mascoteUrl} alt="" className="pointer-events-none absolute w-auto object-contain" style={{ ...(mascoteCanto.startsWith("cima") ? { top: "5%" } : { bottom: "5%" }), ...(mascoteCanto.endsWith("dir") ? { right: "5%" } : { left: "5%" }), height: mascoteTam === "p" ? "12%" : mascoteTam === "g" ? "28%" : "19%", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }} />
            )}
            {tematicoId && logoCanto && logoUrlMarca && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrlMarca} alt="" className="pointer-events-none absolute h-auto object-contain" style={{ ...(logoCanto.startsWith("cima") ? { top: "4%" } : { bottom: "4%" }), ...(logoCanto.endsWith("dir") ? { right: "4%" } : { left: "4%" }), width: logoTam === "p" ? "19%" : logoTam === "g" ? "37%" : "28%", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} />
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); setAmpliada(null); }} className="rounded-lg border border-white/20 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">Fechar</button>
        </div>
      )}
    </div>
  );
}
