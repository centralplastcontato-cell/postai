import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { estaLogado } from "@/lib/auth";

export const runtime = "nodejs";

// Upload de VÍDEO (e imagens grandes) DIRETO do navegador pro Vercel Blob, sem passar pelo
// nosso servidor. Vídeo costuma passar do limite de 4,5MB do corpo das funções da Vercel —
// esse caminho (client upload) sobe o arquivo direto pro Blob e só pede um "crachá" (token)
// aqui, então aguenta arquivos grandes. Usado pela aba "Minha arte" quando o dono manda vídeo.
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Só quem está logado no painel pode subir (o cookie de sessão vai junto — mesma origem).
        if (!(await estaLogado())) throw new Error("Sem permissão.");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png"],
          maximumSizeInBytes: 120 * 1024 * 1024, // 120MB — Reels/Story cabem folgado
          addRandomSuffix: true,
        };
      },
      // Nada a fazer ao concluir: a tela já recebe a URL do retorno do upload.
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha no upload." }, { status: 400 });
  }
}
