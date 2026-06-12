/**
 * Publicação no Instagram via Meta Graph API — POR MARCA.
 * Diferente do projeto de origem (1 conta no .env), aqui o token e o IG User ID
 * vêm da Marca, então o Postaí posta em várias contas, cada uma com sua conexão.
 *
 * As imagens (artes) são servidas por rotas públicas do próprio app
 * (/api/slide/... e /api/feed/...), que a Meta busca por URL.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

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
  tentativas = 4
): Promise<Record<string, unknown>> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await graph(conn, path, params);
    } catch (e) {
      ultimo = e;
      if (i < tentativas - 1) await espera(5000 * (i + 1)); // 5s, 10s, 15s...
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Falha ao criar mídia na Meta.");
}

/**
 * Publica um carrossel (2 a 10 imagens) ou imagem única (1) no Instagram da marca.
 */
export async function publicar(
  conn: ConexaoIG,
  igUrls: string[],
  legenda: string
): Promise<ResultadoPostagem> {
  if (!marcaConectada(conn)) {
    return { ok: false, erro: "Marca sem conexão com o Instagram (falta IG User ID e token)." };
  }
  const urls = igUrls.slice(0, 10);
  if (urls.length === 0) return { ok: false, erro: "Nada pra postar (sem imagens)." };

  // Pré-aquece as artes: o next/og pode levar segundos no 1º render (sobretudo a
  // capa-mosaico, com várias fotos reais). A Meta tem timeout curto ao baixar a
  // image_url, então renderizamos antes — assim já vêm prontas/cacheadas quando a
  // Meta for buscar. (Falha de pré-aquecimento é ignorada; o retry abaixo cobre.)
  await Promise.all(urls.map((u) => fetch(u).catch(() => {})));

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

/** Monta URLs públicas absolutas a partir de caminhos relativos (/api/...). */
export function urlsAbsolutas(base: string, caminhos: string[]): string[] {
  const b = base.replace(/\/$/, "");
  return caminhos.map((p) => (p.startsWith("http") ? p : `${b}${p.startsWith("/") ? "" : "/"}${p}`));
}
