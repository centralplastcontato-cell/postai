import { prisma } from "@/lib/prisma";
import { marcaPorTokenFotos } from "@/lib/festa";
import { AlbumFestaPublico, type FestaView } from "@/components/album-festa-publico";

export const dynamic = "force-dynamic";

// Link PÚBLICO do Álbum da Festa. O gerente abre sem login; o token do link é a credencial.
export default async function FestaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const marca = await marcaPorTokenFotos(token);

  if (!marca) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-preto px-5">
        <div className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-8 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-lg font-bold text-white">Link inválido ou desativado</h1>
          <p className="mt-2 text-sm text-muted">Esse link de fotos não está mais ativo. Peça um novo ao buffet.</p>
        </div>
      </div>
    );
  }

  const festas = await prisma.festa.findMany({
    where: { marcaId: marca.id },
    orderBy: { data: "desc" },
    include: { fotos: { select: { id: true, url: true }, orderBy: { criadoEm: "desc" } } },
  });

  const festasView: FestaView[] = festas.map((f) => ({
    id: f.id,
    dataISO: f.data.toISOString(),
    aniversariante: f.aniversariante,
    tema: f.tema,
    fotos: f.fotos.map((foto) => ({ id: foto.id, url: foto.url })),
  }));

  return (
    <AlbumFestaPublico
      token={token}
      marca={{ nome: marca.nome, logoUrl: marca.logoUrl, corPrimaria: marca.corPrimaria }}
      festas={festasView}
    />
  );
}
