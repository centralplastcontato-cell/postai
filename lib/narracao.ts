// NARRAÇÃO dos vídeos: a voz que fala no Reels, já MISTURADA com o jingle do buffet.
//
// Por que a mistura é feita aqui (e não no motor de vídeo): o motor aceita UMA trilha só
// (`musicaUrl`). Então entregamos a ele um MP3 pronto — locução por cima, jingle baixinho por
// baixo. E por que em JavaScript puro: o servidor do Postaí não tem ffmpeg. A conta é simples
// (somar amostras), e o jingle já foi convertido UMA vez pra PCM cru (scripts de uso único), o
// que dispensa decodificador de MP3.
//
// Fluxo: texto → Google TTS (Chirp3-HD, PCM 24kHz) → soma com o jingle → MP3 (lamejs) → Blob.

import { GoogleAuth } from "google-auth-library";
import { put } from "@vercel/blob";
import { Mp3Encoder } from "@breezystack/lamejs";
import { vozValida, MODELO_VOZ, DIRECAO_PADRAO } from "@/lib/vozes";

const TAXA = 24000; // 24 kHz mono — o que o Google devolve e o que o jingle já está
// A voz é ATENUADA na mesma medida em que a música entra (a soma nunca passa de 1,0). Sem isso a
// soma estoura o teto nos picos da locução e o corte vira crepitação — justo nas palavras que a
// voz enfatiza, que são as que vendem. `montarTrilha` calcula essa cessão amostra a amostra.
const VOL_JINGLE = 0.5; // FRAÇÃO padrão do slider (0..1) quando não vier valor — o slider muda isso
const RABICHO_S = 1.2; // um tiquinho de jingle depois que a voz termina (não corta seco)
const FADE_S = 1.5; // o jingle some suave no final

// O jingle da marca já em PCM cru (WAV 24kHz mono). Só o Castelo tem jingle hoje — as demais
// marcas saem com a voz limpa (sem música), o que é melhor que música errada.
const JINGLES_PCM: Record<string, string> = {
  "castelo-da-diversao": "https://k5f6nms2aodada2o.public.blob.vercel-storage.com/musicas/castelo-da-diversao-24k.wav",
};

function credenciais(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SA_KEY_B64 || "";
  if (!b64) throw new Error("GOOGLE_SA_KEY_B64 não configurado.");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

// Texto → PCM (Int16) com a voz escolhida e a DIREÇÃO de voz. LINEAR16 vem sem compressão: a
// duração é exata (amostras ÷ 24000) e a mistura não precisa decodificar nada.
//
// As vozes GEMINI obedecem o `prompt` (a direção: "fale como um animador de festinha…") — é o
// que tira o tom robótico. Elas têm cota por minuto, então: se der 429, espera e tenta de novo;
// se insistir, cai na voz Chirp3-HD de MESMO NOME (natural, mas sem direção) — melhor um vídeo
// com voz simples do que nenhum vídeo.
async function falar(texto: string, vozId: string, direcao: string): Promise<Int16Array> {
  const auth = new GoogleAuth({ credentials: credenciais(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const { token } = await (await auth.getClient()).getAccessToken();
  const voz = vozValida(vozId);
  const prompt = (direcao || "").trim() || DIRECAO_PADRAO;

  type Resposta = { pcm: Int16Array } | { status: number; erro: string };
  const pedir = async (url: string, body: unknown): Promise<Resposta> => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Sem timeout, um Google lento consumiria os 60s da função e o dono veria um erro cru.
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { status: r.status, erro: (await r.text()).slice(0, 200) };
    const j = (await r.json()) as { audioContent?: string };
    if (!j.audioContent) return { status: 500, erro: "O Google não devolveu áudio." };
    return { pcm: pcmDoWav(Buffer.from(j.audioContent, "base64")) };
  };

  const corpoGemini = {
    input: { text: texto, prompt },
    voice: { languageCode: "pt-BR", name: voz, modelName: MODELO_VOZ },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: TAXA },
  };

  for (let tent = 1; tent <= 2; tent++) {
    const r = await pedir("https://texttospeech.googleapis.com/v1beta1/text:synthesize", corpoGemini);
    if ("pcm" in r) return r.pcm;
    if (r.status !== 429) throw new Error(`Voz (Gemini) ${r.status}: ${r.erro}`);
    console.error(`Cota da voz Gemini estourada (tentativa ${tent}) — esperando…`);
    await new Promise((res) => setTimeout(res, 4000));
  }

  // Plano B: a mesma voz na geração anterior (natural, porém sem obedecer a direção).
  console.error("Cota da voz Gemini insistiu — caindo na voz simples (sem direção).");
  const r = await pedir("https://texttospeech.googleapis.com/v1/text:synthesize", {
    input: { text: texto },
    voice: { languageCode: "pt-BR", name: `pt-BR-Chirp3-HD-${voz}` },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: TAXA, speakingRate: 1.08 },
  });
  if ("pcm" in r) return r.pcm;
  throw new Error(`Voz ${r.status}: ${r.erro}`);
}

// Lê as amostras de um WAV PCM 16 bits (pula o cabeçalho, achando o bloco "data").
function pcmDoWav(buf: Buffer): Int16Array {
  let pos = 12; // depois de "RIFF....WAVE"
  while (pos + 8 <= buf.length) {
    const bloco = buf.toString("ascii", pos, pos + 4);
    const tam = buf.readUInt32LE(pos + 4);
    if (bloco === "data") {
      const ini = pos + 8;
      const fim = Math.min(ini + tam, buf.length);
      const n = Math.floor((fim - ini) / 2);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(ini + i * 2);
      return out;
    }
    pos += 8 + tam + (tam % 2); // blocos são alinhados em 2 bytes
  }
  throw new Error("WAV sem bloco de dados.");
}

const GAP_S = 1.0; // silêncio mínimo (só música) entre a 1ª e a 2ª fala
const RAMP_S = 0.4; // rampa suave ao abaixar/subir a música na entrada/saída da voz (sem "pulo")

// Monta a TRILHA completa (Int16) e devolve com a duração. Estrutura:
//   [1ª fala + música baixinha] → [SÓ MÚSICA, mais cheia] → [2ª fala/CTA + música baixinha] → rabicho
// Assim TODAS as fotos aparecem: a voz vende no começo, a música carrega o meio e a 2ª fala fecha
// com o convite. `alvoSegundos` = tamanho do vídeo INTEIRO (todas as fotos) — a música estica até lá.
// A música DUCKA (abaixa) sob as falas e sobe no meio; a soma nunca estoura (a voz cede o espaço dela).
// Normaliza a música pelo PICO: faixas gravadas baixas ganham volume até usar quase toda a
// escala (pico ~0,95). Só AUMENTA (nunca abaixa) — assim o slider parte de um nível cheio e o
// "máximo" fica alto de verdade, independente de como a faixa foi masterizada.
function normalizarPico(pcm: Int16Array, alvo = 0.95): Int16Array {
  let pico = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > pico) pico = a; }
  if (pico < 1) return pcm;
  const ganho = (alvo * 32767) / pico;
  if (ganho <= 1.02) return pcm; // já está alto o suficiente
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * ganho)));
  return out;
}

function montarTrilha(
  voz1: Int16Array,
  voz2: Int16Array | null,
  jingle: Int16Array | null,
  volMusica?: number,
  alvoSegundos?: number,
): { pcm: Int16Array; segundos: number } {
  const temJingle = !!jingle && jingle.length > 0;
  // volMusica agora é a FRAÇÃO do slider (0..1). Traduz em ganhos reais e AUDÍVEIS: sob a voz a
  // música é abafada (ducking, pra não competir); no MEIO (sem voz) ela sobe de verdade.
  const g = Math.max(0, Math.min(1, volMusica ?? VOL_JINGLE));
  const volBaixo = temJingle ? g * 0.45 : 0; // sob a voz (abafada, mas presente): 0 → 0,45
  const volMeio = temJingle && g > 0 ? 0.3 + g * 0.7 : volBaixo; // no meio (só música): 0,3 → 1,0 (cheio)
  const gap = Math.round(GAP_S * TAXA);
  const ramp = Math.round(RAMP_S * TAXA);
  const tail = Math.round(RABICHO_S * TAXA);
  const len1 = voz1.length;
  const len2 = voz2 ? voz2.length : 0;

  // Duração alvo (todas as fotos) — mas nunca menor que o necessário pra as falas caberem.
  const alvo = alvoSegundos && alvoSegundos > 0 ? Math.round(alvoSegundos * TAXA) : 0;
  let total: number, start2: number;
  if (voz2) {
    const minTotal = len1 + gap + len2 + tail;
    total = Math.max(alvo, minTotal);
    start2 = total - tail - len2; // a 2ª fala termina `tail` antes do fim
    if (start2 < len1 + gap) { start2 = len1 + gap; total = start2 + len2 + tail; }
  } else {
    total = Math.max(alvo, len1 + tail);
    start2 = -1;
  }

  const fadeIni = Math.max(0, total - Math.round(FADE_S * TAXA)); // música some suave no fim
  // Quão "dentro da voz" está a amostra i (1 = na voz, com rampa; 0 = só música) — pro ducking.
  const dentro = (i: number, a: number, b: number) =>
    i >= a && i < b ? 1 : i < a ? Math.max(0, 1 - (a - i) / ramp) : Math.max(0, 1 - (i - b) / ramp);

  const saida = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    const vz = i < len1 ? voz1[i] : voz2 && i >= start2 && i < start2 + len2 ? voz2[i - start2] : 0;
    const ins = Math.max(dentro(i, 0, len1), voz2 ? dentro(i, start2, start2 + len2) : 0);
    const volJ = volMeio + (volBaixo - volMeio) * ins; // ins=1 → baixo (sob a voz); ins=0 → cheio (meio)
    let v = vz * (1 - volJ); // a voz cede o espaço da música → soma nunca passa do teto
    if (temJingle && volJ > 0) {
      const fade = i >= fadeIni ? Math.max(0, 1 - (i - fadeIni) / (total - fadeIni)) : 1;
      v += jingle![i % jingle!.length] * volJ * fade;
    }
    saida[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return { pcm: saida, segundos: Math.round((total / TAXA) * 10) / 10 };
}

// Int16 → MP3 (lamejs), em quadros de 1152 amostras.
function encodarMp3(pcm: Int16Array): Buffer {
  const enc = new Mp3Encoder(1, TAXA, 128);
  const partes: Uint8Array[] = [];
  const BLOCO = 1152;
  for (let i = 0; i < pcm.length; i += BLOCO) {
    const buf = enc.encodeBuffer(pcm.subarray(i, Math.min(i + BLOCO, pcm.length)));
    if (buf.length) partes.push(buf);
  }
  const fim = enc.flush();
  if (fim.length) partes.push(fim);
  return Buffer.concat(partes.map((p) => Buffer.from(p)));
}

// Gera a narração completa e sobe no Blob. `texto2` = 2ª fala (CTA no fim, opcional). `alvoSegundos`
// = tamanho do vídeo com TODAS as fotos (a música estica até lá). Devolve URL + duração real.
export async function gerarNarracaoMp3(opts: {
  texto: string;
  texto2?: string;
  vozId: string;
  direcao?: string;
  slugMarca: string;
  ref: string;
  volMusica?: number;
  alvoSegundos?: number;
  musicaWav?: string; // WAV (24kHz mono) da trilha ESCOLHIDA pelo dono — entra no lugar do jingle
}): Promise<{ url: string; segundos: number }> {
  const texto = opts.texto.trim();
  if (!texto) throw new Error("Sem texto pra narrar.");

  const voz1 = await falar(texto, opts.vozId, opts.direcao || "");
  const t2 = (opts.texto2 || "").trim();
  const voz2 = t2 ? await falar(t2, opts.vozId, opts.direcao || "") : null;

  // Música de fundo: a TRILHA do dono (musicaWav) tem prioridade; senão o jingle da marca. Tudo
  // best-effort — se a trilha do dono falhar (formato/rede), cai no jingle; se o jingle falhar,
  // a narração sai só com a voz. Nada aqui derruba a geração.
  async function carregarPcm(url: string): Promise<Int16Array | null> {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (r.ok) return pcmDoWav(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error("Fundo indisponível:", url, e);
    }
    return null;
  }
  let jingle: Int16Array | null = null;
  if (opts.musicaWav) jingle = await carregarPcm(opts.musicaWav); // a trilha escolhida
  if (!jingle && JINGLES_PCM[opts.slugMarca]) jingle = await carregarPcm(JINGLES_PCM[opts.slugMarca]); // rede de proteção
  if (jingle) jingle = normalizarPico(jingle); // faixas baixas ganham volume (pra o slider ter faixa cheia)

  const { pcm, segundos } = montarTrilha(voz1, voz2, jingle, opts.volMusica, opts.alvoSegundos);
  const mp3 = encodarMp3(pcm);
  const blob = await put(`narracoes/${opts.slugMarca}-${opts.ref}-${Date.now()}.mp3`, mp3, {
    access: "public",
    contentType: "audio/mpeg",
  });
  return { url: blob.url, segundos };
}
