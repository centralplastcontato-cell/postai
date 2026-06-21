// Converte um registro de Campanha (banco) no banner que o álbum mostra (AlbumData.campanha).
// Resolve o destino do botão: WhatsApp (usa o telefone da Marca + a mensagem pré-escrita) ou
// um link próprio. Módulo de servidor (sem prisma) — usado pela rota pública /festa/[token].

import { type AlbumData } from "@/components/album-festa";

export type CampanhaReg = {
  selo: string;
  titulo: string;
  texto: string;
  ctaTexto: string;
  ctaTipo: string;
  ctaValor: string;
};

export function bannerDaCampanha(c: CampanhaReg, telefone: string | null): NonNullable<AlbumData["campanha"]> {
  let ctaUrl: string | null = null;
  if (c.ctaTipo === "link") {
    ctaUrl = c.ctaValor ? (/^https?:\/\//i.test(c.ctaValor) ? c.ctaValor : `https://${c.ctaValor}`) : null;
  } else {
    const tel = (telefone || "").replace(/\D/g, "");
    const waNum = tel ? (tel.startsWith("55") ? tel : `55${tel}`) : "";
    ctaUrl = waNum ? `https://wa.me/${waNum}${c.ctaValor ? `?text=${encodeURIComponent(c.ctaValor)}` : ""}` : null;
  }
  return {
    selo: c.selo,
    titulo: c.titulo,
    texto: c.texto,
    ctaTexto: c.ctaTexto || "Quero saber mais",
    ctaUrl,
  };
}
