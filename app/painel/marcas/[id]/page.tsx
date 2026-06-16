import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { marcaConectada } from "@/lib/instagram";
import { MarcaHub } from "@/components/marca-hub";
import { type Post } from "@/components/marketing-calendario";
import { type PublicacaoView } from "@/components/publicacoes-aba";
import { type MarcaView } from "@/components/marca-form";
import { type ImagemView } from "@/components/banco-imagens";
import { AtividadesRecentes } from "@/components/atividades-recentes";
import { analisarEngajamento, sugerirProximoPost } from "@/lib/inteligencia";

export const dynamic = "force-dynamic";

// Hash curto pra furar cache da arte quando o conteúdo muda (?v=).
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export default async function MarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marca = await prisma.marca.findUnique({
    where: { id },
    include: { usuario: { select: { nome: true, plano: true, acessoAte: true } } },
  });
  if (!marca) notFound();

  // Autorização multi-tenant: o cliente só abre a própria marca; o admin abre qualquer
  // uma. notFound() (em vez de erro) pra nem revelar que a marca de outro existe.
  const sessao = await sessaoAtual();
  if (!sessao) notFound();
  if (!sessao.admin && marca.usuarioId !== sessao.id) notFound();

  // Assinatura do dono (cliente) — mostrada no topo da página da marca. null = marca sem
  // dono (sua, admin) → sem cartão de assinatura.
  const assinatura = marca.usuario
    ? { cliente: marca.usuario.nome, plano: marca.usuario.plano, acessoAte: marca.usuario.acessoAte ? marca.usuario.acessoAte.toISOString() : null }
    : null;

  // Todas as queries da marca em PARALELO (Promise.all) — antes eram sequenciais e
  // somavam ~4-5s + pressionavam o pool de conexões. Em paralelo cai pra ~1 query.
  const [conteudos, pubs, imgs, metricas, ativ] = await Promise.all([
    prisma.conteudo.findMany({ where: { marcaId: id }, orderBy: { data: "asc" } }),
    prisma.publicacao.findMany({ where: { marcaId: id }, orderBy: { data: "asc" } }),
    prisma.imagemMarca.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" } }),
    prisma.metricaMarca.findMany({ where: { marcaId: id }, orderBy: { dia: "desc" }, take: 90, select: { dia: true, seguidores: true, posts: true } }),
    prisma.atividadeAgente.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" }, take: 25, select: { id: true, agente: true, texto: true, criadoEm: true } }),
  ]);
  const atividades = ativ.map((a) => ({ id: a.id, agente: a.agente, texto: a.texto, criadoEm: a.criadoEm.toISOString() }));

  // Resumo de valor: o que o piloto JÁ publicou sozinho, pelos 3 tipos (as 3 abas:
  // Carrosséis, Publicações, Story). A soma fecha certinho (carrosseis + feed + stories
  // = total).
  const carrosseisPostados = conteudos.filter((c) => c.status === "postado" && c.postadoEm).length;
  const feedPostados = pubs.filter((p) => p.formato !== "story" && p.status === "postado" && p.postadoEm).length;
  const storiesPostados = pubs.filter((p) => p.formato === "story" && p.status === "postado" && p.postadoEm).length;
  const entregue = {
    carrosseis: carrosseisPostados,
    feed: feedPostados,
    stories: storiesPostados,
    total: carrosseisPostados + feedPostados + storiesPostados,
  };

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
      categoria: c.categoria,
      curtidas: c.curtidas,
      comentarios: c.comentarios,
      alcance: c.alcance,
      salvamentos: c.salvamentos,
    };
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
    categoriaIntencao: p.categoria, // categoria de intenção (coluna do banco) — pra etiqueta
    espelhar: p.espelhar ?? null,
    curtidas: p.curtidas,
    comentarios: p.comentarios,
    alcance: p.alcance,
    salvamentos: p.salvamentos,
  });
  // Feed (4:5) vai pra aba Publicações; Story (9:16) vai pra aba Story.
  const publicacoes: PublicacaoView[] = pubs.filter((p) => p.formato !== "story").map(mapPub);
  const stories: PublicacaoView[] = pubs.filter((p) => p.formato === "story").map(mapPub);

  const imagens: ImagemView[] = imgs.map((i) => ({ id: i.id, url: i.url, categoria: i.categoria, descricao: i.descricao }));
  const evolucao = metricas.reverse().map((m) => ({ dia: m.dia.toISOString(), seguidores: m.seguidores, posts: m.posts }));

  // Inteligência: cruza categoria × horário × intenção (carrossel + feed; Story fica fora,
  // suas métricas não se comparam). Calculado aqui (servidor) com os posts já carregados —
  // sem query extra — e passado pronto pro cartão da Bia.
  const analise = analisarEngajamento([
    ...conteudos.map((c) => ({ categoria: c.categoria, curtidas: c.curtidas, comentarios: c.comentarios, alcance: c.alcance, salvamentos: c.salvamentos, quando: c.postadoEm ?? c.data, titulo: c.titulo })),
    ...pubs.filter((p) => p.formato !== "story").map((p) => ({ categoria: p.categoria, curtidas: p.curtidas, comentarios: p.comentarios, alcance: p.alcance, salvamentos: p.salvamentos, quando: p.postadoEm ?? p.data, titulo: p.titulo })),
  ]);

  // Sugestão da Bia pro próximo post de feed: o que vende × o que faz tempo que não sai.
  // Recência só conta os que JÁ foram postados (postadoEm preenchido).
  const sugestao = sugerirProximoPost(
    [...conteudos, ...pubs.filter((p) => p.formato !== "story")]
      .filter((p) => p.postadoEm)
      .map((p) => ({ categoria: p.categoria, postadoEm: p.postadoEm as Date })),
    analise,
  );

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
    accessToken: "", // SEGURANÇA: nunca enviar o token da Meta ao navegador (write-only)
    temToken: Boolean(marca.accessToken), // só sinaliza que já existe um token salvo
    fbPageId: marca.fbPageId,
    diasCarrossel: marca.diasCarrossel,
    diasFeed: marca.diasFeed,
    horaPost: marca.horaPost,
    horaCarrossel: marca.horaCarrossel,
    descricao: marca.descricao,
    ativa: marca.ativa,
    espelharStory: marca.espelharStory,
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <MarcaHub
        marca={marcaView}
        posts={posts}
        publicacoes={publicacoes}
        stories={stories}
        imagens={imagens}
        evolucao={evolucao}
        conectada={marcaConectada(marca)}
        assinatura={assinatura}
        ehAdmin={sessao.admin}
        entregue={entregue}
        analise={analise}
        sugestao={sugestao}
      />
      <AtividadesRecentes atividades={atividades} />
    </div>
  );
}
