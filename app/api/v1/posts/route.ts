import { marcaDaChave, criarPostApi, respostaErro, buscarPorExternalId, postParaJson, type EntradaPost } from "@/lib/api-externa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// API de automação externa — documentação em docs/API.md.
//   POST /api/v1/posts                  cria (e agenda) um post
//   GET  /api/v1/posts?external_id=...  acha um post pelo external_id (ex.: depois de um timeout)

export async function POST(req: Request) {
  const auth = await marcaDaChave(req);
  if (!auth.ok) return respostaErro(auth.status, auth.erro);

  const tipo = req.headers.get("content-type") || "";
  let entrada: EntradaPost;
  try {
    if (tipo.includes("multipart/form-data")) {
      // Upload direto: campos de texto + arquivo(s) em "midias" (pode repetir) e "capa".
      const f = await req.formData();
      const txt = (k: string) => {
        const v = f.get(k);
        return typeof v === "string" ? v : undefined;
      };
      const capa = f.get("capa");
      entrada = {
        formato: txt("formato"),
        legenda: txt("legenda"),
        hashtags: txt("hashtags"),
        horario: txt("horario"),
        status: txt("status"),
        external_id: txt("external_id"),
        midias: f.getAll("midias").filter((m) => (typeof m === "string" ? m.trim() !== "" : m.size > 0)),
        capa: capa && (typeof capa === "string" ? capa.trim() : capa.size > 0) ? capa : null,
      };
    } else {
      const j = (await req.json()) as Record<string, unknown>;
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
      const m = j.midias;
      const midias = Array.isArray(m) ? m : typeof m === "string" ? [m] : [];
      if (midias.some((x) => typeof x !== "string")) {
        return respostaErro(400, [{ campo: "midias", codigo: "MIDIAS_INVALIDAS", mensagem: "midias deve ser uma lista de links (texto)." }]);
      }
      if (j.capa !== undefined && j.capa !== null && typeof j.capa !== "string") {
        return respostaErro(400, [{ campo: "capa", codigo: "CAPA_INVALIDA", mensagem: "capa deve ser um link (texto)." }]);
      }
      entrada = {
        formato: j.formato,
        legenda: j.legenda,
        hashtags: j.hashtags,
        horario: j.horario,
        status: j.status,
        external_id: j.external_id,
        midias: midias as string[],
        capa: (j.capa as string | undefined) || null,
      };
    }
  } catch {
    return respostaErro(400, [{ campo: "", codigo: "CORPO_INVALIDO", mensagem: "Corpo inválido: envie JSON (Content-Type: application/json) ou multipart/form-data." }]);
  }

  const r = await criarPostApi(auth.marca, entrada);
  if (!r.ok) return respostaErro(r.status, r.erros);
  // 201 = criado agora; 200 = esse external_id já existia (reenvio) → devolve o mesmo post.
  return Response.json({ ok: true, criado: r.criado, post: r.post, avisos: r.avisos }, { status: r.criado ? 201 : 200 });
}

export async function GET(req: Request) {
  const auth = await marcaDaChave(req);
  if (!auth.ok) return respostaErro(auth.status, auth.erro);
  const externalId = new URL(req.url).searchParams.get("external_id")?.trim();
  if (!externalId) {
    return respostaErro(400, [{ campo: "external_id", codigo: "EXTERNAL_ID_OBRIGATORIO", mensagem: "Informe ?external_id=... (ou consulte GET /api/v1/posts/{id})." }]);
  }
  const reg = await buscarPorExternalId(auth.marca.id, externalId).catch(() => null);
  if (!reg) return respostaErro(404, [{ campo: "external_id", codigo: "NAO_ENCONTRADO", mensagem: "Nenhum post com esse external_id nesta marca." }]);
  return Response.json({ ok: true, post: await postParaJson(reg, auth.marca) });
}
