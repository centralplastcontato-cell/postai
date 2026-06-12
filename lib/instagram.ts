/**
 * Publicação no Instagram via Meta Graph API — POR MARCA.
 * Diferente do projeto de origem (1 conta no .env), aqui o token e o IG User ID
 * vêm da Marca, então o Postaí posta em várias contas, cada uma com sua conexão.
 *
 * As artes são rotas que renderizam "ao vivo" (next/og). Como a capa-mosaico pode
 * levar ~8s (baixa várias fotos) e a Meta tem timeout curto ao buscar a image_url,
 * antes de postar a gente MATERIALIZA cada arte: renderiza 1x e salva como PNG
 * estático no Blob, e manda essa URL pra Meta — que baixa instantâneo, sem timeout.
 */

import { put } from "@vercel/blob";
import { marcaTemFacebook, publicarFacebook, type ResultadoFB } from "./facebook";

const GRAPH = "https://graph.facebook.com/v21.0";

// Renderiza a arte (rota next/og) e salva como PNG estático no Blob; devolve a URL
// estática (rápida pra Meta baixar). Joga erro se a arte não puder ser renderizada.
async function materializar(url: string): Promise<string> {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Arte indisponível (${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const nome = `posts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
  const blob = await put(nome, buf, { access: "public", contentType: "image/png" });
  return blob.url;
}

export type ResultadoPostagem =
  | { ok: true; mediaId: string; permalink: string | null }
  | { ok: false; erro: string };

export type ConexaoIG = { igUserId: string; accessToken: string };

/** A marca tem credenciais da Meta preenchidas? */
export function marcaConectada(c: Partial<ConexaoIG> | null | undefined): boolean {
  return Boolean(c?.igUserId && c?.accessToken);
}

async function graph(
  conn: ConexaoIG,
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: conn.accessToken });
  const resp = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const err = (json.error ?? {}) as { message?: string };
    throw new Error(err.message || `Graph API ${resp.status}`);
  }
  return json;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cria mídia na Meta com algumas tentativas: a Meta às vezes devolve erro "transient"
// (code 2 / "An unexpected error... retry later") quando demora pra baixar a image_url
// — comum em arte pesada de renderizar, como a capa-mosaico (várias fotos reais).
// Esperar e repetir costuma resolver (a essa altura a arte já está renderizada/cacheada).
async function graphRetry(
  conn: ConexaoIG,
  path: string,
  params: Record<string, string>,
  tentativas = 3
): Promise<Record<string, unknown>> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await graph(conn, path, params);
    } catch (e) {
      ultimo = e;
      // Backoff curto: se a Meta seguir com erro transitório, o cron tenta de novo na
      // PRÓXIMA hora — não vale travar a execução inteira esperando aqui.
      if (i < tentativas - 1) await espera(2000 * (i + 1)); // 2s, 4s
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Falha ao criar mídia na Meta.");
}

/** Materializa várias artes (renderiza 1x cada e salva PNG estático no Blob). */
export async function materializarArtes(urls: string[]): Promise<string[]> {
  return Promise.all(urls.slice(0, 10).map((u) => materializar(u)));
}

/**
 * Publica um carrossel (2 a 10 imagens) ou imagem única (1) no Instagram da marca.
 * Recebe URLs JÁ MATERIALIZADAS (PNG estático) — ver publicarNasRedes.
 */
export async function publicar(
  conn: ConexaoIG,
  urls: string[],
  legenda: string
): Promise<ResultadoPostagem> {
  if (!marcaConectada(conn)) {
    return { ok: false, erro: "Marca sem conexão com o Instagram (falta IG User ID e token)." };
  }
  if (urls.length === 0) return { ok: false, erro: "Nada pra postar (sem imagens)." };

  try {
    let containerId: string;

    if (urls.length === 1) {
      const c = await graphRetry(conn, `${conn.igUserId}/media`, {
        image_url: urls[0],
        caption: legenda,
      });
      containerId = String(c.id);
    } else {
      const childIds: string[] = [];
      for (const url of urls) {
        const child = await graphRetry(conn, `${conn.igUserId}/media`, {
          image_url: url,
          is_carousel_item: "true",
        });
        childIds.push(String(child.id));
      }
      const pai = await graphRetry(conn, `${conn.igUserId}/media`, {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: legenda,
      });
      containerId = String(pai.id);
    }

    // Publica com algumas tentativas (a Meta leva uns segundos processando).
    let mediaId: string | null = null;
    let ultimoErro = "";
    for (let i = 0; i < 5; i++) {
      try {
        const pub = await graph(conn, `${conn.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        mediaId = String(pub.id);
        break;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        await espera(3000);
      }
    }
    if (!mediaId) {
      return { ok: false, erro: `Não consegui publicar após criar o conteúdo: ${ultimoErro}` };
    }

    let permalink: string | null = null;
    try {
      const r = await fetch(
        `${GRAPH}/${mediaId}?fields=permalink&access_token=${conn.accessToken}`,
        { cache: "no-store" }
      );
      const j = (await r.json()) as { permalink?: string };
      permalink = j.permalink ?? null;
    } catch {}

    return { ok: true, mediaId, permalink };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido na Meta API." };
  }
}

export type ResultadoRedes = { ig: ResultadoPostagem; fb?: ResultadoFB };

/**
 * Publica a arte no Instagram e — se a marca tiver a Página do Facebook conectada —
 * também no Facebook. Materializa as artes UMA vez (render pesado, ex: mosaico) e
 * reaproveita pros dois. O FB é "best-effort": se falhar, o IG já foi e não trava.
 */
export async function publicarNasRedes(
  marca: { igUserId: string; accessToken: string; fbPageId?: string },
  urlsAbsolutas: string[],
  legenda: string
): Promise<ResultadoRedes> {
  let estaticas: string[];
  try {
    estaticas = await materializarArtes(urlsAbsolutas);
  } catch (e) {
    const erro = e instanceof Error ? `Não consegui preparar as artes: ${e.message}` : "Falha ao preparar as artes.";
    return { ig: { ok: false, erro } };
  }
  const ig = await publicar({ igUserId: marca.igUserId, accessToken: marca.accessToken }, estaticas, legenda);
  let fb: ResultadoFB | undefined;
  if (marcaTemFacebook(marca)) {
    fb = await publicarFacebook(marca.fbPageId!, marca.accessToken, estaticas, legenda);
  }
  return { ig, fb };
}

/** Monta URLs públicas absolutas a partir de caminhos relativos (/api/...). */
export function urlsAbsolutas(base: string, caminhos: string[]): string[] {
  const b = base.replace(/\/$/, "");
  return caminhos.map((p) => (p.startsWith("http") ? p : `${b}${p.startsWith("/") ? "" : "/"}${p}`));
}
