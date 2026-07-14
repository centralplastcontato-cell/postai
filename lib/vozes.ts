// As VOZES da narração — GEMINI-TTS do Google (pt-BR). Elas são a virada do projeto: além de
// naturais, OBEDECEM uma DIREÇÃO DE VOZ escrita em português ("fale como um animador de festinha,
// showman paulista, abertura explosiva…"). As vozes anteriores (Chirp3-HD) eram naturais mas
// liam tudo do mesmo jeito — o Victor ouviu as duas e trocou.
//
// Usam a MESMA conta Google do motor de vídeo (Vertex AI). Módulo PURO — serve cliente e servidor.

export type Voz = { id: string; nome: string; sexo: "m" | "f"; nota: string; favorita?: boolean };

export const MODELO_VOZ = "gemini-2.5-flash-tts";
export const VOZ_PADRAO = "Puck"; // a que o Victor ouviu primeiro e aprovou

// A DIREÇÃO padrão, quando o dono não escreve a dele. Escrita no tom do buffet infantil.
export const DIRECAO_PADRAO =
  "Fale como um brasileiro animado e caloroso conversando com pais de crianças — nada de locutor de rádio formal. Sorriso na voz, energia genuína. Respire entre as frases e faça as pausas dos '...'. Acelere no que é empolgante e desacelere no que é importante. Enfatize os números e as ofertas. Alegria de verdade, sem gritaria forçada.";

// Atalhos prontos de direção (viram botões no painel) — é a "barrinha de animação" do Victor,
// só que em palavras, que é o que a voz entende.
export const ESTILOS: { nome: string; emoji: string; direcao: string }[] = [
  {
    nome: "Calmo",
    emoji: "😌",
    direcao:
      "Fale com calma e carinho, como quem acolhe um pai ou uma mãe. Tom sereno e confiante, ritmo pausado, voz baixa e acolhedora. Sem pressa, sem euforia. Passe segurança e cuidado.",
  },
  {
    nome: "Animado",
    emoji: "😄",
    direcao: DIRECAO_PADRAO,
  },
  {
    nome: "Empolgado",
    emoji: "🤩",
    direcao:
      "Fale MUITO animado, com energia alta e sorriso enorme na voz — como quem está contando uma notícia sensacional. Ritmo rápido, entonação subindo, ênfase forte nos números e nas ofertas. Respire rápido entre as frases. Empolgação genuína, sem gritaria.",
  },
  {
    nome: "Animador de festa",
    emoji: "🎪",
    direcao:
      "Fale como um ANIMADOR DE FESTINHA INFANTIL brasileiro — aquele que faz as crianças ficarem doidas e os pais gritarem 'que legal!'. Energia de showman de circo, paulista descontraído, microfone na mão numa festa barulhenta. Abertura EXPLOSIVA e aguda. Acelere ao listar as atrações. VOLTE COM TUDO na oferta, enfatizando os números. Respire entre as frases, com hesitações naturais de quem fala rápido. Alegria GENUÍNA — nada de gritaria forçada nem de locutor formal.",
  },
];

const v = (nome: string, sexo: "m" | "f", nota: string, favorita = false): Voz => ({ id: nome, nome, sexo, nota, favorita });

export const VOZES: Voz[] = [
  // ⭐ as 8 que o Victor ouviu com a direção dele e aprovou
  v("Puck", "m", "brincalhona", true),
  v("Fenrir", "m", "energética", true),
  v("Charon", "m", "grave", true),
  v("Orus", "m", "firme", true),
  v("Leda", "f", "jovem", true),
  v("Kore", "f", "firme", true),
  v("Aoede", "f", "leve", true),
  v("Zephyr", "f", "brilhante", true),
  // as demais
  v("Achird", "m", "amigável"),
  v("Algenib", "m", "rouca"),
  v("Algieba", "m", "suave"),
  v("Alnilam", "m", "decidida"),
  v("Enceladus", "m", "sussurrada"),
  v("Iapetus", "m", "clara"),
  v("Rasalgethi", "m", "informativa"),
  v("Sadachbia", "m", "animada"),
  v("Sadaltager", "m", "instrutiva"),
  v("Schedar", "m", "equilibrada"),
  v("Umbriel", "m", "tranquila"),
  v("Zubenelgenubi", "m", "informal"),
  v("Achernar", "f", "delicada"),
  v("Autonoe", "f", "clara"),
  v("Callirrhoe", "f", "descontraída"),
  v("Despina", "f", "fluida"),
  v("Erinome", "f", "objetiva"),
  v("Gacrux", "f", "madura"),
  v("Laomedeia", "f", "vibrante"),
  v("Pulcherrima", "f", "expressiva"),
  v("Sulafat", "f", "acolhedora"),
  v("Vindemiatrix", "f", "gentil"),
];

export function vozValida(id: string): string {
  return VOZES.some((x) => x.id === id) ? id : VOZ_PADRAO;
}

export function nomeDaVoz(id: string): string {
  return VOZES.find((x) => x.id === id)?.nome ?? VOZ_PADRAO;
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
