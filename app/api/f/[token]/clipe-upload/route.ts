import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { festaPorToken } from "@/lib/festa";

export const runtime = "nodejs";

// Upload de VÍDEO da festa DIRETO do navegador pro Vercel Blob, pelo LINK DA FESTA (token isolado
// dela). Vídeo passa do limite de 4,5MB do corpo das funções da Vercel, então sobe direto pro Blob
// e só pede o "crachá" (token) aqui — autorizado pelo festaToken (quem tem o link é o gerente). Os
// vídeos viram CLIPES do Reels daquela festa (o cliente chama adicionarClipeFestaPublico depois);
// NÃO aparecem no álbum dos pais.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // O token da festa É a autorização (o gerente não faz login). Link inválido = sem upload.
        const festa = await festaPorToken(token);
        if (!festa) throw new Error("Link inválido ou desativado.");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: 120 * 1024 * 1024, // 120MB — clipes curtos cabem folgado
          addRandomSuffix: true,
        };
      },
      // Nada a fazer aqui: a tela recebe a URL do retorno do upload e chama a action pra salvar.
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha no upload." }, { status: 400 });
  }
}
