import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { marcaConectada } from "@/lib/instagram";
import { MarcaHub } from "@/components/marca-hub";
import { type Post } from "@/components/marketing-calendario";
import { type PublicacaoView } from "@/components/publicacoes-aba";
import { type MarcaView } from "@/components/marca-form";
import { type ImagemView } from "@/components/banco-imagens";

export const dynamic = "force-dynamic";

// Hash curto pra furar cache da arte quando o conteúdo muda (?v=).
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export default async function MarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marca = await prisma.marca.findUnique({ where: { id } });
  if (!marca) notFound();

  const conteudos = await prisma.conteudo.findMany({
    where: { marcaId: id },
    orderBy: { data: "asc" },
  });
  const posts: Post[] = conteudos.map((c) => {
    let slides: string[] = [];
    try {
      slides = JSON.parse(c.slides);
    } catch {}
    let imagensSlides: (string | null)[] = [];
    try {
      const st = JSON.parse(c.slidesTexto || "[]") as { imagemUrl?: string }[];
      imagensSlides = st.map((s) => s?.imagemUrl ?? null);
    } catch {}
    const v = hashCurto(c.slidesTexto || "");
    return {
      id: c.id,
      slug: c.slug,
      data: c.data.toISOString(),
      titulo: c.titulo,
      legenda: c.legenda,
      hashtags: c.hashtags,
      slides: slides.map((s) => `${s}?v=${v}`),
      status: c.status,
      tema: c.tema,
      imagensSlides,
    };
  });

  const pubs = await prisma.publicacao.findMany({
    where: { marcaId: id },
    orderBy: { data: "asc" },
  });
  const publicacoes: PublicacaoView[] = pubs.map((p) => ({
    id: p.id,
    slug: p.slug,
    data: p.data.toISOString(),
    template: p.template,
    titulo: p.titulo,
    texto: p.texto,
    legenda: p.legenda,
    hashtags: p.hashtags,
    imagemUrl: p.imagemUrl,
    status: p.status,
    tema: p.tema,
  }));

  const imgs = await prisma.imagemMarca.findMany({
    where: { marcaId: id },
    orderBy: { criadoEm: "desc" },
  });
  const imagens: ImagemView[] = imgs.map((i) => ({ id: i.id, url: i.url, categoria: i.categoria }));

  const marcaView: MarcaView = {
    id: marca.id,
    nome: marca.nome,
    corPrimaria: marca.corPrimaria,
    corFundo: marca.corFundo,
    paleta: marca.paleta,
    logoTexto: marca.logoTexto,
    logoUrl: marca.logoUrl,
    site: marca.site,
    telefone: marca.telefone,
    igUserId: marca.igUserId,
    accessToken: marca.accessToken,
    diasCarrossel: marca.diasCarrossel,
    diasFeed: marca.diasFeed,
    horaPost: marca.horaPost,
    descricao: marca.descricao,
    ativa: marca.ativa,
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <MarcaHub
        marca={marcaView}
        posts={posts}
        publicacoes={publicacoes}
        imagens={imagens}
        conectada={marcaConectada(marca)}
      />
    </div>
  );
}
