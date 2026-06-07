/** Nome do produto. */
export const APP_NAME = "Postaí";

/**
 * URL pública da aplicação — a Meta busca as artes (imagens) por URL daqui na
 * hora de postar, então precisa apontar pro domínio acessível publicamente.
 * Em dev, http://localhost:3000. Em produção, o domínio do deploy.
 */
export function baseUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
