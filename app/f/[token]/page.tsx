import { prisma } from "@/lib/prisma";
import { marcaPorTokenFotos, festaPorToken } from "@/lib/festa";
import { parseAniversariantes } from "@/lib/aniversariantes";
import { CriarFestaPublico } from "@/components/criar-festa-publico";
import { FestaPublico } from "@/components/festa-publico";
import { type FestaView } from "@/lib/festa-tipos";
import { baseUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

// Link PÚBLICO do Álbum da Festa. O mesmo path serve dois tipos de token:
//  • token de FESTA  → mostra SÓ aquela festa (isolada): subir fotos, finalizar.
//  • token de MARCA  → mostra o formulário de CRIAR festa (não lista as existentes).
export default async function FestaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 1) É o link de uma FESTA? (token próprio dela) → mostra só ela.
  const festa = await festaPorToken(token);
  if (festa) {
    const fotos = await prisma.imagemMarca.findMany({
      where: { festaId: festa.id },
      select: { id: true, url: true, momento: true, descricao: true },
      orderBy: { criadoEm: "desc" },
    });
    const festaView: FestaView = {
      id: festa.id,
      token,
      tokenAlbum: festa.tokenAlbum,
      dataISO: festa.data.toISOString(),
      aniversariantes: parseAniversariantes(festa.aniversariantes),
      tema: festa.tema,
      gerente: festa.gerente,
      instagramAnfitriao: festa.instagramAnfitriao,
      horario: festa.horario,
      finalizadaEm: festa.finalizadaEm ? festa.finalizadaEm.toISOString() : null,
      autorizacao: festa.autorizacao,
      motivoNaoAutoriza: festa.motivoNaoAutoriza,
      videoFotos: [],
      videoCapa: "",
      videoMoldura: "branca",
      videoTextoFinal: "",
      videoUrl: "",
      mostrarAvaliacao: festa.mostrarAvaliacao,
      fotos: fotos.map((f) => ({ id: f.id, url: f.url, momento: f.momento, descricao: f.descricao })),
    };
    return <FestaPublico token={token} marca={festa.marca} festa={festaView} linkAlbum={`${baseUrl()}/festa/${festa.tokenAlbum}`} />;
  }

  // 2) É o link de CRIAR? (token da marca) → mostra o form de nova festa.
  const marca = await marcaPorTokenFotos(token);
  if (marca) {
    return <CriarFestaPublico tokenMarca={token} marca={{ nome: marca.nome, logoUrl: marca.logoUrl, corPrimaria: marca.corPrimaria }} />;
  }

  // 3) Nenhum dos dois → link inválido.
  return (
    <div className="flex min-h-screen items-center justify-center bg-preto px-5">
      <div className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-8 text-center">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-white">Link inválido ou desativado</h1>
        <p className="mt-2 text-sm text-muted">Esse link não está mais ativo. Peça um novo ao buffet.</p>
      </div>
    </div>
  );
}
