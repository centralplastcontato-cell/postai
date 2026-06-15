/** Nome do produto. */
export const APP_NAME = "Postaí";

/** Nome da assistente (IA) que cuida das postagens — assina o feed de Atividades. */
export const AGENTE = "Bia";

/**
 * URL pública da aplicação — a Meta busca as artes (imagens) por URL daqui na
 * hora de postar, então precisa apontar pro domínio acessível publicamente.
 * Em dev, http://localhost:3000. Em produção, o domínio do deploy.
 */
export function baseUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
