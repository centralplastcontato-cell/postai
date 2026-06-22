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
  horario: string;
  finalizadaEm: string | null;
  autorizacao: string; // "pendente" | "autorizada" | "negada" — uso de imagem (LGPD)
  motivoNaoAutoriza: string; // motivo quando os pais não autorizam
  videoFotos: string[]; // IDs das fotos escolhidas pro vídeo, na ordem ("[]" = automático)
  videoUrl: string; // URL do vídeo/Reels já montado ("" = ainda não gerado)
  mostrarAvaliacao: boolean; // o gerente liga/desliga o card "Avalie no Google" no álbum
  fotos: FotoView[];
};

export type MarcaPublica = { nome: string; logoUrl: string; corPrimaria: string };
