import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
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

  // Autorização multi-tenant: o cliente só abre a própria marca; o admin abre qualquer
  // uma. notFound() (em vez de erro) pra nem revelar que a marca de outro existe.
  const sessao = await sessaoAtual();
  if (!sessao) notFound();
  if (!sessao.admin && marca.usuarioId !== sessao.id) notFound();

  const conteudos = await prisma.conteudo.findMany({
    where: { marcaId: id },
    orderBy: { data: "asc" },
  });
  const posts: Post[] = conteudos.map((c) => {
    let slides: string[] = [];
    try {
      slides = JSON.parse(c.slides);
    } catch {}
    let st: { imagemUrl?: string; tipo?: string }[] = [];
    try {
      st = JSON.parse(c.slidesTexto || "[]") as { imagemUrl?: string; tipo?: string }[];
    } catch {}
    const imagensSlides: (string | null)[] = st.map((s) => s?.imagemUrl ?? null);
    const tiposSlides: (string | undefined)[] = st.map((s) => s?.tipo);
    return {
      id: c.id,
      slug: c.slug,
      data: c.data.toISOString(),
      titulo: c.titulo,
      legenda: c.legenda,
      hashtags: c.hashtags,
      // ?v= POR SLIDE (hash só do conteúdo daquele slide): mudar um slide não troca a
      // URL dos outros, então só o slide alterado recarrega — o resto não "pisca".
      slides: slides.map((s, i) => `${s}?v=${hashCurto(JSON.stringify(st[i] ?? {}))}`),
      status: c.status,
      tema: c.tema,
      aprovado: c.aprovado,
      postadoEm: c.postadoEm?.toISOString() ?? null,
      imagensSlides,
      tiposSlides,
    };
  });

  const pubs = await prisma.publicacao.findMany({
    where: { marcaId: id },
    orderBy: { data: "asc" },
  });
  const mapPub = (p: (typeof pubs)[number]): PublicacaoView => ({
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
    aprovado: p.aprovado,
    postadoEm: p.postadoEm?.toISOString() ?? null,
    extra: p.extra ?? null, // JSON dos campos do template — pra pré-preencher a edição
    categoria: (() => { try { return JSON.parse(p.extra || "{}").categoria ?? null; } catch { return null; } })(),
  });
  // Feed (4:5) vai pra aba Publicações; Story (9:16) vai pra aba Story.
  const publicacoes: PublicacaoView[] = pubs.filter((p) => p.formato !== "story").map(mapPub);
  const stories: PublicacaoView[] = pubs.filter((p) => p.formato === "story").map(mapPub);

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
    fbPageId: marca.fbPageId,
    diasCarrossel: marca.diasCarrossel,
    diasFeed: marca.diasFeed,
    horaPost: marca.horaPost,
    horaCarrossel: marca.horaCarrossel,
    descricao: marca.descricao,
    ativa: marca.ativa,
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <MarcaHub
        marca={marcaView}
        posts={posts}
        publicacoes={publicacoes}
        stories={stories}
        imagens={imagens}
        conectada={marcaConectada(marca)}
      />
    </div>
  );
}
