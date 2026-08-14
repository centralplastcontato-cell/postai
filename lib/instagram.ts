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
async function materializar(url: string, tentativas = 3): Promise<string> {
  // A rota da arte (next/og) é PESADA — sobretudo o Story (1080x1920 + confete/gradiente).
  // Em função "fria" (cold start) ou sob pressão de memória, ela às vezes devolve 500; na
  // 2ª/3ª tentativa a função já esquentou e renderiza. Por isso tentamos algumas vezes
  // antes de desistir (era 1 tentativa só → o piloto desistia no primeiro tropeço).
  let ultimoStatus = 0;
  for (let i = 0; i < tentativas; i++) {
    const resp = await fetch(url, { cache: "no-store" });
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const nome = `posts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
      const blob = await put(nome, buf, { access: "public", contentType: "image/png" });
      return blob.url;
    }
    ultimoStatus = resp.status;
    if (i < tentativas - 1) await espera(1500 * (i + 1)); // 1.5s, 3s — dá tempo de esquentar
  }
  throw new Error(`Arte indisponível (${ultimoStatus}) após ${tentativas} tentativas`);
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

/**
 * Publica UM Story (imagem 9:16) no Instagram da marca. Mesmo fluxo de mídia, mas com
 * media_type=STORIES. Story não tem legenda (a Meta ignora). Recebe URL JÁ materializada.
 */
export async function publicarStoryIG(conn: ConexaoIG, url: string): Promise<ResultadoPostagem> {
  if (!marcaConectada(conn)) return { ok: false, erro: "Marca sem conexão com o Instagram." };
  try {
    const c = await graphRetry(conn, `${conn.igUserId}/media`, { image_url: url, media_type: "STORIES" });
    const containerId = String(c.id);
    let mediaId: string | null = null;
    let ultimoErro = "";
    for (let i = 0; i < 5; i++) {
      try {
        const pub = await graph(conn, `${conn.igUserId}/media_publish`, { creation_id: containerId });
        mediaId = String(pub.id);
        break;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
        await espera(3000);
      }
    }
    if (!mediaId) return { ok: false, erro: `Não consegui publicar o Story: ${ultimoErro}` };
    return { ok: true, mediaId, permalink: null };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro na Meta API (Story)." };
  }
}

/**
 * Materializa a arte vertical (9:16) e posta como Story no Instagram da marca.
 * (FB Story fica pra uma fase posterior — exige /{page}/photo_stories.)
 */
export async function publicarStoryNasRedes(
  marca: { igUserId: string; accessToken: string; fbPageId?: string },
  urlAbsoluta: string
): Promise<ResultadoRedes> {
  let estatica: string;
  try {
    [estatica] = await materializarArtes([urlAbsoluta]);
  } catch (e) {
    const erro = e instanceof Error ? `Não consegui preparar o Story: ${e.message}` : "Falha ao preparar o Story.";
    return { ig: { ok: false, erro } };
  }
  const ig = await publicarStoryIG({ igUserId: marca.igUserId, accessToken: marca.accessToken }, estatica);
  return { ig };
}

/**
 * Publica um REELS (vídeo 9:16) no Instagram da marca. O vídeo já está no Blob (video_url).
 * Vídeo é diferente de imagem: a Meta cria o container, PROCESSA o vídeo (leva segundos) e só
 * então deixa publicar — por isso a gente faz POLL do status_code até FINISHED antes do publish.
 */
export type StatusReels = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "UNKNOWN";

/** Cria o container de um REELS na Meta (NÃO publica). O vídeo entra em PROCESSAMENTO. */
export async function criarContainerReels(conn: ConexaoIG, videoUrl: string, legenda: string): Promise<{ ok: true; containerId: string } | { ok: false; erro: string }> {
  if (!marcaConectada(conn)) return { ok: false, erro: "Marca sem conexão com o Instagram." };
  try {
    const c = await graphRetry(conn, `${conn.igUserId}/media`, {
      media_type: "REELS",
      video_url: videoUrl,
      caption: legenda,
      share_to_feed: "true",
      thumb_offset: "1500", // capa = frame de 1,5s (logo + nome nítidos, fora do fade)
    });
    return { ok: true, containerId: String(c.id) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao criar o Reels na Meta." };
  }
}

/** Cria o container de um STORY DE VÍDEO na Meta (media_type=STORIES + video_url). O vídeo entra em
 *  PROCESSAMENTO (igual Reels) — usa o mesmo status/publish. Story não tem legenda (a Meta ignora). */
export async function criarContainerStoryVideo(conn: ConexaoIG, videoUrl: string): Promise<{ ok: true; containerId: string } | { ok: false; erro: string }> {
  if (!marcaConectada(conn)) return { ok: false, erro: "Marca sem conexão com o Instagram." };
  try {
    const c = await graphRetry(conn, `${conn.igUserId}/media`, { media_type: "STORIES", video_url: videoUrl });
    return { ok: true, containerId: String(c.id) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao criar o Story na Meta." };
  }
}

/** Verifica o processamento do container do Reels na Meta (1 checagem, sem esperar). */
export async function statusContainerReels(conn: ConexaoIG, containerId: string): Promise<StatusReels> {
  try {
    const r = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${conn.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { status_code?: string };
    const s = j.status_code || "";
    if (s === "FINISHED" || s === "IN_PROGRESS" || s === "ERROR" || s === "EXPIRED") return s;
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** Publica um container de Reels JÁ processado (status FINISHED). */
export async function publicarContainerReels(conn: ConexaoIG, containerId: string): Promise<ResultadoPostagem> {
  let mediaId: string | null = null;
  let ultimoErro = "";
  for (let i = 0; i < 5; i++) {
    try {
      const pub = await graph(conn, `${conn.igUserId}/media_publish`, { creation_id: containerId });
      mediaId = String(pub.id);
      break;
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      await espera(3000);
    }
  }
  if (!mediaId) return { ok: false, erro: `Não consegui publicar o Reels: ${ultimoErro}` };
  let permalink: string | null = null;
  try {
    const r = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${conn.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { permalink?: string };
    permalink = j.permalink ?? null;
  } catch {}
  return { ok: true, mediaId, permalink };
}

/**
 * Posta um REELS NA HORA (botão "Postar agora"): cria o container, ESPERA processar (poll
 * ~até 80s) e publica. O piloto automático usa as peças acima em 2 fases (ver postarReels no cron).
 */
export async function publicarReelsIG(conn: ConexaoIG, videoUrl: string, legenda: string): Promise<ResultadoPostagem> {
  if (!marcaConectada(conn)) return { ok: false, erro: "Marca sem conexão com o Instagram." };
  const c = await criarContainerReels(conn, videoUrl, legenda);
  if (!c.ok) return { ok: false, erro: c.erro };
  let ultimoStatus: StatusReels = "UNKNOWN";
  for (let i = 0; i < 20; i++) {
    await espera(4000);
    ultimoStatus = await statusContainerReels(conn, c.containerId);
    if (ultimoStatus === "FINISHED") return await publicarContainerReels(conn, c.containerId);
    if (ultimoStatus === "ERROR" || ultimoStatus === "EXPIRED") return { ok: false, erro: `A Meta não conseguiu processar o vídeo (${ultimoStatus}).` };
  }
  return { ok: false, erro: `O vídeo ainda está processando na Meta (${ultimoStatus}). Tente de novo em instantes.` };
}

/** Posta o Reels (vídeo já no Blob, não precisa materializar) no Instagram da marca. */
export async function publicarReelsNasRedes(
  marca: { igUserId: string; accessToken: string },
  videoUrl: string,
  legenda: string
): Promise<ResultadoRedes> {
  const ig = await publicarReelsIG({ igUserId: marca.igUserId, accessToken: marca.accessToken }, videoUrl, legenda);
  return { ig };
}

/** Monta URLs públicas absolutas a partir de caminhos relativos (/api/...). */
export function urlsAbsolutas(base: string, caminhos: string[]): string[] {
  const b = base.replace(/\/$/, "");
  return caminhos.map((p) => (p.startsWith("http") ? p : `${b}${p.startsWith("/") ? "" : "/"}${p}`));
}

// === ESPELHO DO INSTAGRAM: ler o feed/stories DA marca pra mostrar no painel (só leitura) ===
export type PostIG = {
  id: string;
  tipo: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  imagem: string; // foto (ou thumbnail do vídeo)
  permalink: string;
  legenda: string;
  data: string; // ISO
  curtidas: number;
  comentarios: number;
  views: number | null; // só VÍDEO/Reels tem; foto = null (o Instagram não conta visualização de foto)
};
export type StoryIG = { id: string; tipo: string; imagem: string; permalink: string; data: string };

type ItemMedia = { id?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; caption?: string; timestamp?: string; like_count?: number; comments_count?: number };
const imagemDe = (m: ItemMedia): string => (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) || m.media_url || "";

// Visualizações de um Reels/vídeo. A Meta renomeou a métrica entre versões — tenta as conhecidas, na ordem.
async function viewsDoVideo(conn: ConexaoIG, mediaId: string): Promise<number | null> {
  for (const metric of ["plays", "views", "ig_reels_video_view_total_count"]) {
    try {
      const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=${metric}&access_token=${conn.accessToken}`, { cache: "no-store" });
      const j = (await r.json()) as { data?: { values?: { value?: number }[] }[] };
      const v = j.data?.[0]?.values?.[0]?.value;
      if (typeof v === "number") return v;
    } catch { /* métrica não existe nessa versão → tenta a próxima */ }
  }
  return null;
}

// FEED da marca (posts publicados). `instagram_basic` já dá conta. Best-effort: erro → lista vazia.
export async function buscarFeedIG(conn: ConexaoIG, limit = 24): Promise<PostIG[]> {
  try {
    const fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count";
    const r = await fetch(`${GRAPH}/${conn.igUserId}/media?fields=${fields}&limit=${limit}&access_token=${conn.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { data?: ItemMedia[] };
    if (!Array.isArray(j.data)) return [];
    const posts: PostIG[] = j.data.map((p) => ({
      id: p.id || "", tipo: p.media_type || "IMAGE", imagem: imagemDe(p), permalink: p.permalink || "",
      legenda: p.caption || "", data: p.timestamp || "", curtidas: p.like_count ?? 0, comentarios: p.comments_count ?? 0, views: null,
    }));
    // visualizações só existem em VÍDEO/Reels — busca em paralelo (1 consulta de insights por vídeo)
    await Promise.all(posts.map(async (p) => { if (p.tipo === "VIDEO" && p.id) p.views = await viewsDoVideo(conn, p.id); }));
    return posts;
  } catch { return []; }
}

// STORIES ativos (só os das últimas 24h — a API não devolve os que já sumiram). Precisa `instagram_manage_insights`.
export async function buscarStoriesIG(conn: ConexaoIG): Promise<StoryIG[]> {
  try {
    const r = await fetch(`${GRAPH}/${conn.igUserId}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${conn.accessToken}`, { cache: "no-store" });
    const j = (await r.json()) as { data?: ItemMedia[] };
    if (!Array.isArray(j.data)) return [];
    return j.data.map((s) => ({ id: s.id || "", tipo: s.media_type || "IMAGE", imagem: imagemDe(s), permalink: s.permalink || "", data: s.timestamp || "" }));
  } catch { return []; }
}
