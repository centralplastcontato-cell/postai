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
  capaUrl?: string; // foto da CAPA (nítida + texto por cima). Sem isso, o motor usa a 1ª foto.
  moldura?: string; // moldura das fotos: "nenhuma" | "branca" | "grossa" | "marca"
  corMoldura?: string; // cor (hex) usada quando moldura="marca"
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
