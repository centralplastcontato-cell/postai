// As VOZES da narração dos vídeos — Chirp3-HD do Google (pt-BR), as mais naturais que existem
// hoje sem contratar outro fornecedor (e usam a MESMA conta Google do motor de vídeo).
//
// A ⭐ marca as que o Victor aprovou ouvindo as 30. A PADRÃO é a Vindemiatrix (a favorita dele).
// Módulo PURO (sem prisma) — serve cliente e servidor.

export type Voz = { id: string; nome: string; sexo: "m" | "f"; favorita?: boolean };

export const VOZ_PADRAO = "pt-BR-Chirp3-HD-Vindemiatrix";

const v = (nome: string, sexo: "m" | "f", favorita = false): Voz => ({
  id: `pt-BR-Chirp3-HD-${nome}`,
  nome,
  sexo,
  favorita,
});

export const VOZES: Voz[] = [
  // ---- masculinas ----
  v("Achird", "m"),
  v("Algenib", "m"),
  v("Algieba", "m"),
  v("Alnilam", "m"),
  v("Charon", "m"),
  v("Enceladus", "m"),
  v("Fenrir", "m"),
  v("Iapetus", "m", true), // ⭐
  v("Orus", "m", true), // ⭐
  v("Puck", "m"),
  v("Rasalgethi", "m"),
  v("Sadachbia", "m"),
  v("Sadaltager", "m", true), // ⭐
  v("Schedar", "m"),
  v("Umbriel", "m"),
  v("Zubenelgenubi", "m"),
  // ---- femininas ----
  v("Achernar", "f", true), // ⭐
  v("Aoede", "f", true), // ⭐
  v("Autonoe", "f"),
  v("Callirrhoe", "f", true), // ⭐
  v("Despina", "f", true), // ⭐
  v("Erinome", "f"),
  v("Gacrux", "f", true), // ⭐
  v("Kore", "f"),
  v("Laomedeia", "f"),
  v("Leda", "f"),
  v("Pulcherrima", "f"),
  v("Sulafat", "f"),
  v("Vindemiatrix", "f", true), // ⭐ a favorita — padrão
  v("Zephyr", "f"),
];

export function vozValida(id: string): string {
  return VOZES.some((x) => x.id === id) ? id : VOZ_PADRAO;
}

export function nomeDaVoz(id: string): string {
  return VOZES.find((x) => x.id === id)?.nome ?? "Vindemiatrix";
}

// Quantas fotos o vídeo leva pra durar o mesmo que a narração. O motor dá ~2,3s por foto +
// ~6s de capa e quadro final (é a mesma conta do "≈ 66s" que o seletor mostra). Com narração,
// é ela que manda no tamanho do vídeo — senão a voz acabaria e o vídeo continuaria mudo.
export const SEG_POR_FOTO = 2.3;
export const SEG_FIXOS = 6;
// ceil (não round): é melhor sobrar 1s de imagem com a voz já terminada do que CORTAR o fim da
// fala — que é justamente onde mora o convite ("chama no WhatsApp").
export function fotosParaDuracao(segundos: number, maxFotos = 30): number {
  return Math.max(3, Math.min(maxFotos, Math.ceil((segundos - SEG_FIXOS) / SEG_POR_FOTO)));
}
