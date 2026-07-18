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
// A voz é ATENUADA na mesma medida em que o jingle entra (0,84 + 0,16 = 1,0). Sem isso a soma
// estoura o teto nos picos da locução e o corte vira crepitação — justo nas palavras que a voz
// enfatiza, que são as que vendem.
const VOL_VOZ = 0.84;
const VOL_JINGLE = 0.16; // a música fica bem por baixo da voz
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

// Soma a voz com o jingle (que dá a volta se for mais curto) e devolve o MP3. `volMusica` (0..0,40)
// deixa o dono regular a MÚSICA de fundo: 0 = sem música (voz limpa), maior = música mais alta.
// A voz cede o espaço que a música ocupa (volVoz = 1 - volMusica) pra soma nunca estourar o teto.
function misturar(voz: Int16Array, jingle: Int16Array | null, volMusica?: number): Buffer {
  const volJingle = Math.max(0, Math.min(0.4, volMusica ?? VOL_JINGLE));
  const total = voz.length + Math.round(RABICHO_S * TAXA);
  const fadeIni = Math.max(0, total - Math.round(FADE_S * TAXA));
  const saida = new Int16Array(total);
  const temJingle = !!jingle && jingle.length > 0 && volJingle > 0;
  const volVoz = temJingle ? Math.max(0.6, 1 - volJingle) : 1; // sem/na música muda, a voz vai inteira
  for (let i = 0; i < total; i++) {
    let v = i < voz.length ? voz[i] * volVoz : 0;
    if (temJingle) {
      const fade = i >= fadeIni ? Math.max(0, 1 - (i - fadeIni) / (total - fadeIni)) : 1;
      v += jingle![i % jingle!.length] * volJingle * fade;
    }
    saida[i] = Math.max(-32768, Math.min(32767, Math.round(v))); // trava de segurança
  }
  const enc = new Mp3Encoder(1, TAXA, 128);
  const partes: Uint8Array[] = [];
  const BLOCO = 1152; // o MP3 é codificado em quadros desse tamanho
  for (let i = 0; i < saida.length; i += BLOCO) {
    const buf = enc.encodeBuffer(saida.subarray(i, Math.min(i + BLOCO, saida.length)));
    if (buf.length) partes.push(buf);
  }
  const fim = enc.flush();
  if (fim.length) partes.push(fim);
  return Buffer.concat(partes.map((p) => Buffer.from(p)));
}

// Gera a narração completa e sobe no Blob. Devolve a URL e a duração (que decide quantas fotos
// o vídeo leva — o motor dá ~2,3s por foto).
export async function gerarNarracaoMp3(opts: { texto: string; vozId: string; direcao?: string; slugMarca: string; ref: string; volMusica?: number }): Promise<{ url: string; segundos: number }> {
  const texto = opts.texto.trim();
  if (!texto) throw new Error("Sem texto pra narrar.");

  const voz = await falar(texto, opts.vozId, opts.direcao || "");

  let jingle: Int16Array | null = null;
  const urlJingle = JINGLES_PCM[opts.slugMarca];
  if (urlJingle) {
    try {
      const r = await fetch(urlJingle, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (r.ok) jingle = pcmDoWav(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error("Jingle indisponível — a narração sai sem música:", e);
    }
  }

  const mp3 = misturar(voz, jingle, opts.volMusica);
  const segundos = Math.round((voz.length / TAXA + RABICHO_S) * 10) / 10;
  const blob = await put(`narracoes/${opts.slugMarca}-${opts.ref}-${Date.now()}.mp3`, mp3, {
    access: "public",
    contentType: "audio/mpeg",
  });
  return { url: blob.url, segundos };
}
