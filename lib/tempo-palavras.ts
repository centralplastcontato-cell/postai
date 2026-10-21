// Tempo de CADA palavra falada na narração (Whisper, com marcação por palavra). Usado pra
// sincronizar figurinhas/legendas com a voz. Falhou → lista vazia (quem chama estima o tempo).
import type { PalavraFalada } from "@/lib/colagem";

export async function tempoDasPalavras(audioUrl: string): Promise<PalavraFalada[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const audio = await fetch(audioUrl, { signal: AbortSignal.timeout(20000) });
    if (!audio.ok) return [];
    const form = new FormData();
    form.append("file", new Blob([await audio.arrayBuffer()], { type: "audio/mpeg" }), "narracao.mp3");
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(45000) });
    if (!r.ok) { console.error("Whisper", r.status, await r.text().catch(() => "")); return []; }
    const d = await r.json();
    return Array.isArray(d.words) ? (d.words as PalavraFalada[]) : [];
  } catch (e) {
    console.error("Whisper falhou (uso tempo estimado):", e);
    return [];
  }
}
