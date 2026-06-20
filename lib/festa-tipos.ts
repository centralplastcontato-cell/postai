import { type Aniversariante } from "@/lib/aniversariantes";

// Tipos do Álbum da Festa compartilhados entre server (pages) e client (componentes do
// painel e do link público). Módulo só de tipos — client-safe (sem prisma).

export type FotoView = { id: string; url: string; momento: string; descricao: string };

export type FestaView = {
  id: string;
  token: string; // link próprio e isolado da festa
  dataISO: string;
  aniversariantes: Aniversariante[];
  tema: string;
  finalizadaEm: string | null;
  fotos: FotoView[];
};

export type MarcaPublica = { nome: string; logoUrl: string; corPrimaria: string };
