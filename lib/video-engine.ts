import { GoogleAuth } from "google-auth-library";

// Ponte do Postaí pro MOTOR DE VÍDEO (Cloud Run, privado). Autentica com o "crachá" (service
// account, em GOOGLE_SA_KEY_B64) e dispara a montagem em SEGUNDO PLANO — o motor monta e avisa
// no callbackUrl quando termina (não ficamos esperando os minutos da montagem aqui).

const MOTOR_URL = (process.env.VIDEO_ENGINE_URL || "").replace(/\/$/, "");

function credenciais(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SA_KEY_B64 || "";
  if (!b64) throw new Error("GOOGLE_SA_KEY_B64 não configurado.");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

export type PedidoReels = {
  fotos: string[];
  clipes?: string[]; // clipes de VÍDEO (URLs) pra intercalar com as fotos — entram mudos
  posicaoClipes?: string; // onde os clipes entram: "espalhados" (padrão) | "comeco" | "fim"
  duracaoClipes?: string; // quanto de cada clipe toca: "curto" (~4s) | "medio" (~8s) | "completo" (inteiro)
  naoCortarVideo?: boolean; // true = música curta REPETE pra o vídeo manter o tempo cheio
  aberturaUrl?: string; // clipe do mascote (COM voz/som próprio) colado no COMEÇO do vídeo
  fechoUrl?: string; // clipe do mascote (COM voz/som próprio) colado no FIM do vídeo
  capaUrl?: string; // foto da CAPA (nítida + texto por cima). Sem isso, o motor usa a 1ª foto.
  moldura?: string; // moldura das fotos: "nenhuma" | "branca" | "grossa" | "marca"
  corMoldura?: string; // cor (hex) usada quando moldura="marca"
  tituloFinal?: string; // mensagem do SLIDE FINAL (linha 1). Vazio = padrão do motor.
  subFinal?: string; // slide final (linha 2). Vazio = sem 2ª linha.
  logoUrl: string;
  musicaUrl?: string;
  textoCapa: string;
  nomeArquivo?: string;
  festaId: string;
  callbackUrl: string;
  callbackToken: string;
};

// Dispara o motor e espera só o "aceitei" (rápido). A montagem segue em segundo plano lá.
export async function dispararMotorReels(opts: PedidoReels): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!MOTOR_URL) return { ok: false, erro: "Motor de vídeo não configurado (VIDEO_ENGINE_URL)." };
  try {
    const auth = new GoogleAuth({ credentials: credenciais() });
    const client = await auth.getIdTokenClient(MOTOR_URL); // gera o token com audience = URL do motor
    const r = await client.request({
      url: `${MOTOR_URL}/montar`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: opts,
      timeout: 30000,
    });
    const d = r.data as { ok?: boolean } | undefined;
    return d?.ok ? { ok: true } : { ok: false, erro: "O motor não aceitou o pedido." };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao falar com o motor de vídeo." };
  }
}

export function motorConfigurado(): boolean {
  return Boolean(MOTOR_URL && process.env.GOOGLE_SA_KEY_B64);
}

// CAPA (miniatura) de um vídeo enviado — tira um quadro do vídeo (motor/ffmpeg) e devolve a URL do JPEG.
export async function capaDoVideo(videoUrl: string): Promise<{ ok: true; posterUrl: string } | { ok: false; erro: string }> {
  if (!MOTOR_URL) return { ok: false, erro: "Motor de vídeo não configurado." };
  try {
    const auth = new GoogleAuth({ credentials: credenciais() });
    const client = await auth.getIdTokenClient(MOTOR_URL);
    const r = await client.request({
      url: `${MOTOR_URL}/capa-video`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { videoUrl },
      timeout: 45000,
    });
    const d = r.data as { ok?: boolean; posterUrl?: string; erro?: string } | undefined;
    if (d?.ok && d.posterUrl) return { ok: true, posterUrl: d.posterUrl };
    return { ok: false, erro: d?.erro || "Não consegui tirar a capa." };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao falar com o motor." };
  }
}

// IMAGEM + MÚSICA → videozinho (9:16). Chama o motor no modo SÍNCRONO (é rápido: 1 imagem parada +
// áudio curto) e devolve a URL do MP4. Usado pra postar uma arte estática COM musiquinha (Story/Reels).
export async function montarImagemMusica(imagemUrl: string, musicaUrl: string, segundos: number): Promise<{ ok: true; videoUrl: string; duracaoSegundos: number } | { ok: false; erro: string }> {
  if (!MOTOR_URL) return { ok: false, erro: "Motor de vídeo não configurado (VIDEO_ENGINE_URL)." };
  try {
    const auth = new GoogleAuth({ credentials: credenciais() });
    const client = await auth.getIdTokenClient(MOTOR_URL);
    const r = await client.request({
      url: `${MOTOR_URL}/imagem-musica`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { imagemUrl, musicaUrl, segundos },
      timeout: 55000,
    });
    const d = r.data as { ok?: boolean; videoUrl?: string; duracaoSegundos?: number; erro?: string } | undefined;
    if (d?.ok && d.videoUrl) return { ok: true, videoUrl: d.videoUrl, duracaoSegundos: d.duracaoSegundos ?? segundos };
    return { ok: false, erro: d?.erro || "O motor não conseguiu montar o videozinho." };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao falar com o motor de vídeo." };
  }
}
