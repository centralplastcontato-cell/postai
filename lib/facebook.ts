/**
 * Publicação na PÁGINA do Facebook via Meta Graph API — POR MARCA.
 * Usa a mesma conexão da marca (System User token); só precisa do ID da Página
 * (fbPageId) e da permissão `pages_manage_posts` no app Meta.
 *
 * Recebe URLs de imagens JÁ MATERIALIZADAS (PNG estático no Blob) — quem materializa
 * é o fluxo de publicação (publicarNasRedes), pra não renderizar a arte duas vezes.
 *
 * - 1 imagem  -> POST /{pageId}/photos (publicada, com legenda)
 * - N imagens -> sobe cada foto como "não publicada" e cria UM post de álbum em
 *                /{pageId}/feed com attached_media (o "carrossel" do Instagram vira
 *                um álbum de fotos no Facebook).
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type ResultadoFB = { ok: true; postId: string; permalink: string | null } | { ok: false; erro: string };

/** A marca tem a Página do Facebook conectada? (precisa do ID e do token.) */
export function marcaTemFacebook(m: { fbPageId?: string; accessToken?: string } | null | undefined): boolean {
  return Boolean(m?.fbPageId && m?.accessToken);
}

async function fbPost(path: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: token });
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

// Posta na Página com algumas tentativas. A Meta solta erros transitórios (code 2
// "retry later", limite de ritmo, 5xx) ou demora pra baixar a image_url — e o Facebook
// não tinha retry (só o Instagram tinha), então caía de primeira enquanto o IG se
// recuperava. Agora os dois reagem igual à instabilidade temporária.
async function fbPostRetry(path: string, params: Record<string, string>, token: string, tentativas = 3): Promise<Record<string, unknown>> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fbPost(path, params, token);
    } catch (e) {
      ultimo = e;
      if (i < tentativas - 1) await espera(2000 * (i + 1)); // 2s, 4s
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Falha ao postar no Facebook.");
}

// A postagem na Página exige um PAGE access token. Com um System User que administra
// a Página, dá pra obter o token da Página a partir do token do usuário. Se não vier,
// cai no próprio token (System User costuma funcionar direto nas páginas que admin).
async function obterPageToken(pageId: string, userToken: string): Promise<string> {
  try {
    const r = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string };
    if (r.ok && j.access_token) return j.access_token;
  } catch {}
  return userToken;
}

/** Publica uma foto única ou um álbum (várias fotos) na Página do Facebook. */
export async function publicarFacebook(
  pageId: string,
  userToken: string,
  imagensEstaticas: string[],
  mensagem: string
): Promise<ResultadoFB> {
  if (!pageId || !userToken) return { ok: false, erro: "Sem conexão com o Facebook (falta a Página ou o token)." };
  const imgs = imagensEstaticas.filter(Boolean);
  if (imgs.length === 0) return { ok: false, erro: "Nada pra postar (sem imagens)." };

  const token = await obterPageToken(pageId, userToken);
  try {
    let postId: string;
    if (imgs.length === 1) {
      const j = await fbPostRetry(`${pageId}/photos`, { url: imgs[0], caption: mensagem, published: "true" }, token);
      postId = String(j.post_id ?? j.id);
    } else {
      // Sobe cada foto sem publicar e junta tudo num post de álbum.
      const fbids: string[] = [];
      for (const url of imgs) {
        const j = await fbPostRetry(`${pageId}/photos`, { url, published: "false" }, token);
        fbids.push(String(j.id));
      }
      const attached = JSON.stringify(fbids.map((id) => ({ media_fbid: id })));
      const j = await fbPostRetry(`${pageId}/feed`, { message: mensagem, attached_media: attached }, token);
      postId = String(j.id);
    }
    const permalink = postId ? `https://www.facebook.com/${postId}` : null;
    return { ok: true, postId, permalink };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido na Meta API (Facebook)." };
  }
}

/** Publica um VÍDEO na Página do Facebook (POST /{pageId}/videos com file_url). O vídeo já está no
 *  Blob (URL pública) — a Meta baixa e processa. Usado pra espelhar os Reels/vídeos no Facebook. */
export async function publicarVideoFacebook(
  pageId: string,
  userToken: string,
  videoUrl: string,
  descricao: string
): Promise<ResultadoFB> {
  if (!pageId || !userToken) return { ok: false, erro: "Sem conexão com o Facebook (falta a Página ou o token)." };
  if (!videoUrl || !videoUrl.startsWith("http")) return { ok: false, erro: "Sem vídeo pra postar." };
  const token = await obterPageToken(pageId, userToken);
  try {
    const j = await fbPostRetry(`${pageId}/videos`, { file_url: videoUrl, description: descricao.slice(0, 2200) }, token);
    const postId = String(j.id ?? "");
    return { ok: true, postId, permalink: postId ? `https://www.facebook.com/${postId}` : null };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido na Meta API (Facebook vídeo)." };
  }
}

/** Espelha um vídeo na Página do Facebook SE a marca tiver Facebook conectado (best-effort). */
export async function espelharVideoFacebook(
  marca: { fbPageId?: string | null; accessToken?: string | null },
  videoUrl: string,
  descricao: string
): Promise<ResultadoFB | undefined> {
  if (!marcaTemFacebook({ fbPageId: marca.fbPageId ?? undefined, accessToken: marca.accessToken ?? undefined })) return undefined;
  return publicarVideoFacebook(marca.fbPageId as string, marca.accessToken as string, videoUrl, descricao);
}

/** Lista as Páginas que o token administra (id + nome) — pra escolher na conexão. */
export async function listarPaginas(userToken: string): Promise<{ id: string; nome: string }[]> {
  const r = await fetch(`${GRAPH}/me/accounts?fields=id,name&limit=100&access_token=${userToken}`, { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { data?: { id: string; name: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message || `Graph API ${r.status}`);
  return (j.data ?? []).map((p) => ({ id: p.id, nome: p.name }));
}
