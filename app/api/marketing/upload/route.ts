import { put } from "@vercel/blob";
import { estaLogado } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await estaLogado())) {
    return Response.json({ ok: false, erro: "Sem permissão." }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, erro: "Arquivo ausente." });
    }
    const nome = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const blob = await put(`upload/${Date.now()}-${nome}`, file, {
      access: "public",
      contentType: file.type || "image/png",
    });
    return Response.json({ ok: true, url: blob.url });
  } catch (e) {
    console.error("Erro no upload:", e);
    return Response.json({ ok: false, erro: "Falha no upload (confira o Vercel Blob)." });
  }
}
