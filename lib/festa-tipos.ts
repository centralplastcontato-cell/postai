import { type Aniversariante } from "@/lib/aniversariantes";

// Tipos do Álbum da Festa compartilhados entre server (pages) e client (componentes do
// painel e do link público). Módulo só de tipos — client-safe (sem prisma).

export type FotoView = { id: string; url: string; momento: string; descricao: string };

export type FestaView = {
  id: string;
  token: string; // link próprio e isolado da festa (EDIÇÃO — o gerente sobe fotos)
  tokenAlbum: string; // link público SÓ-LEITURA do álbum pros pais
  dataISO: string;
  aniversariantes: Aniversariante[];
  tema: string;
  gerente: string;
  instagramAnfitriao: string; // @ do Instagram da família (pra marcar no post)
  horario: string;
  finalizadaEm: string | null;
  autorizacao: string; // "pendente" | "autorizada" | "negada" — uso de imagem (LGPD)
  motivoNaoAutoriza: string; // motivo quando os pais não autorizam
  videoFotos: string[]; // IDs das fotos escolhidas pro vídeo, na ordem ("[]" = automático)
  videoCapa: string; // fotoId escolhido pra CAPA do vídeo ("" = usa a 1ª foto)
  videoMoldura: string; // moldura das fotos: "nenhuma" | "branca" | "grossa" | "marca"
  videoTextoFinal: string; // mensagem do slide final do vídeo ("" = padrão "Muito obrigado!")
  videoTituloCapa: string; // título da capa escrito à mão ("" = automático "Fulano fez X aninhos")
  videoMusica: string; // trilha própria da festa (URL do MP3) — "" = música padrão do buffet
  videoUrl: string; // URL do vídeo/Reels já montado ("" = ainda não gerado)
  videoPostado?: boolean; // o Reels desta festa JÁ foi postado pelo Postaí (antes mesmo de arquivar em 24h)
  // O Reels desta festa está NA FILA: dia em que vai sair (o mais próximo, se houver mais de um).
  // null = nada agendado. É o que o card da aba Vídeo mostra pra não agendar a mesma festa 2×.
  videoAgendadoEm?: string | null;
  mostrarAvaliacao: boolean; // o gerente liga/desliga o card "Avalie no Google" no álbum
  fotos: FotoView[];
};

export type MarcaPublica = { nome: string; logoUrl: string; corPrimaria: string };
