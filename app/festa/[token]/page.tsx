import { prisma } from "@/lib/prisma";
import { festaPorTokenAlbum } from "@/lib/festa";
import { AlbumFesta } from "@/components/album-festa";
import { montarDadosAlbum } from "@/lib/album-dados";
import { bannerDaCampanha } from "@/lib/campanha";
import { linkAvaliacaoGoogle } from "@/lib/google-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Álbum da Festa" };

// Página PÚBLICA e SÓ-LEITURA do "Álbum pros pais" — o buffet manda este link pros pais com as
// fotos da festa. Autorização = tokenAlbum (separado do link de edição do gerente, /f/[token]):
// quem tem só este link vê e baixa, nunca edita. Campanha/avaliação/Instagram entram quando os
// campos/abas correspondentes existirem (por ora não aparecem).

function aviso(emoji: string, titulo: string, msg: string) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-preto px-5">
      <div className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-8 text-center">
        <p className="text-3xl">{emoji}</p>
        <h1 className="mt-3 text-lg font-bold text-white">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">{msg}</p>
      </div>
    </div>
  );
}

export default async function FestaAlbumPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const festa = await festaPorTokenAlbum(token);
  if (!festa) return aviso("🔒", "Álbum não encontrado", "Esse link não está ativo. Peça um novo ao buffet.");

  const fotos = await prisma.imagemMarca.findMany({
    where: { festaId: festa.id },
    select: { url: true, momento: true, descricao: true },
    orderBy: { criadoEm: "asc" },
  });
  if (!fotos.length) return aviso("📸", "Álbum em preparação", "As fotos dessa festa ainda estão sendo organizadas. Volte em breve! 💜");

  // Campanha que aparece no álbum = a ATIVA mais recente da marca (uma campanha vale pra marca toda).
  const campAtiva = await prisma.campanha.findFirst({
    where: { marcaId: festa.marcaId, ativa: true },
    orderBy: { criadoEm: "desc" },
    select: { selo: true, titulo: true, texto: true, ctaTexto: true, ctaTipo: true, ctaValor: true },
  });
  const campanha = campAtiva ? bannerDaCampanha(campAtiva, festa.marca.telefone) : null;

  const dados = montarDadosAlbum(festa, fotos, {
    preview: false,
    campanha,
    googleReviewUrl: linkAvaliacaoGoogle(festa.marca.slug, festa.marca.nome),
  });
  return <AlbumFesta dados={dados} />;
}
