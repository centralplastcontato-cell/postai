import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BAIXAR O VÍDEO passando pelo NOSSO servidor (mesma origem). Isso conserta o download no
// COMPUTADOR: o host do vídeo (motor de vídeo / Blob) nem sempre libera o navegador a baixar
// direto pra outro site (trava de CORS), e aí o "fetch" no navegador falha. Como o SERVIDOR
// busca sem essa trava, ele pega o MP4 e devolve já marcado como "baixar arquivo".
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  const nomeBruto = (searchParams.get("nome") || "video").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "video";
  const nomeArquivo = nomeBruto.toLowerCase().endsWith(".mp4") ? nomeBruto : `${nomeBruto}.mp4`;

  if (!/^https:\/\//i.test(url)) {
    return new Response("URL inválida.", { status: 400 });
  }

  // Segurança: só baixamos vídeos que REALMENTE existem no banco (impede usar isso pra buscar
  // qualquer endereço da internet — anti-SSRF). Confere festa, vídeo do buffet e clipe do mascote.
  const [festa, tema, clipe] = await Promise.all([
    prisma.festa.findFirst({ where: { videoUrl: url }, select: { id: true } }),
    prisma.videoTematico.findFirst({ where: { videoUrl: url }, select: { id: true } }),
    prisma.marca.findFirst({ where: { mascoteClipes: { contains: url } }, select: { id: true } }),
  ]);
  if (!festa && !tema && !clipe) {
    return new Response("Vídeo não encontrado.", { status: 404 });
  }

  const upstream = await fetch(url).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("Não consegui buscar o vídeo agora.", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(upstream.body, { status: 200, headers });
}
