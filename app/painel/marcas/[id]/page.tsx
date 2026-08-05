import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { ehTrial } from "@/lib/plano";
import { marcaConectada } from "@/lib/instagram";
import { MarcaHub } from "@/components/marca-hub";
import { type Post } from "@/components/marketing-calendario";
import { type PublicacaoView } from "@/components/publicacoes-aba";
import { type MarcaView } from "@/components/marca-form";
import { type ImagemView } from "@/components/banco-imagens";
import { type CampanhaView } from "@/components/campanhas-painel";
import { type FestaView } from "@/lib/festa-tipos";
import { parseAniversariantes } from "@/lib/aniversariantes";
import { gerarTokenFesta, gerarTokenAlbum } from "@/lib/festa";
import { baseUrl } from "@/lib/config";
import { OnboardingMarca } from "@/components/onboarding-marca";
import { analisarEngajamento, sugerirProximoPost, type AnaliseInsights } from "@/lib/inteligencia";

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
  const [conteudos, pubs, imgs, metricas, ativ, festasRaw, campanhasRaw, tematicosRaw] = await Promise.all([
    prisma.conteudo.findMany({ where: { marcaId: id }, orderBy: { data: "asc" } }),
    prisma.publicacao.findMany({ where: { marcaId: id }, orderBy: { data: "asc" } }),
    prisma.imagemMarca.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" } }),
    prisma.metricaMarca.findMany({ where: { marcaId: id }, orderBy: { dia: "desc" }, take: 90, select: { dia: true, seguidores: true, posts: true } }),
    prisma.atividadeAgente.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" }, take: 25, select: { id: true, agente: true, texto: true, criadoEm: true } }),
    prisma.festa.findMany({ where: { marcaId: id }, orderBy: [{ data: "desc" }, { criadoEm: "desc" }], include: { fotos: { select: { id: true, url: true, momento: true, descricao: true }, orderBy: { criadoEm: "desc" } } } }),
    prisma.campanha.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" } }),
    prisma.videoTematico.findMany({ where: { marcaId: id }, orderBy: { criadoEm: "desc" } }),
  ]);
  const campanhas: CampanhaView[] = campanhasRaw.map((c) => ({
    id: c.id, selo: c.selo, titulo: c.titulo, texto: c.texto, ctaTexto: c.ctaTexto, ctaTipo: c.ctaTipo, ctaValor: c.ctaValor, ativa: c.ativa,
  }));
  // Backfill: festas antigas podem não ter token (link de edição) nem tokenAlbum (álbum pros
  // pais). Geramos APENAS os que estiverem VAZIOS — uma vez criado, o token NUNCA muda (senão um
  // link já enviado pros pais quebraria). Festas novas já nascem com tokenAlbum bonito na criação.
  const slugBuffet = marca.slug;
  // Reels JÁ postados pelo Postaí (pra o card de Vídeo marcar "Postado" NA HORA, sem esperar o
  // arquivamento de 24h). Casa pelo videoUrl — a publicação reels carrega o mesmo do vídeo da festa.
  const urlsReelsPostados = new Set(
    pubs.filter((p) => p.formato === "reels" && p.status === "postado" && (p.videoUrl || "").startsWith("http")).map((p) => p.videoUrl),
  );
  // Reels de festa NA FILA (agendado, ainda não postado) → o card da aba Vídeo marca "⏰ Agendado
  // dd/mm", pra o dono bater o olho e não agendar a mesma festa duas vezes. O vínculo é o id da
  // festa embutido no slug ("reels-<6 últimos>-…") — exato, não confunde dois "Pedro". Só quando
  // o slug NÃO tem esse id (agendados antigos) é que caímos no nome do título, de reserva.
  // Guardamos a data MAIS PRÓXIMA: é a próxima vez que aquele vídeo vai ao ar.
  const agendadoPorId = new Map<string, Date>();
  const agendadoPorNome = new Map<string, Date>();
  const maisCedo = (m: Map<string, Date>, k: string, d: Date) => {
    const atual = m.get(k);
    if (!atual || d < atual) m.set(k, d);
  };
  for (const p of pubs) {
    if (p.formato !== "reels" || p.status === "postado" || p.videoTematicoId) continue;
    const suf = (p.slug.match(/^reels-([a-z0-9]{6})-/) || [])[1];
    if (suf) { maisCedo(agendadoPorId, suf, p.data); continue; }
    const nome = (p.titulo || "").replace(/^Reels\s*[—–-]\s*/i, "").trim();
    if (nome) maisCedo(agendadoPorNome, nome, p.data);
  }
  const festas: FestaView[] = await Promise.all(festasRaw.map(async (f) => {
    const anivs = parseAniversariantes(f.aniversariantes);
    let token = f.token;
    let tokenAlbum = f.tokenAlbum;
    const patch: { token?: string; tokenAlbum?: string } = {};
    if (!token) patch.token = token = gerarTokenFesta();
    if (!tokenAlbum) patch.tokenAlbum = tokenAlbum = gerarTokenAlbum(slugBuffet, anivs[0]?.nome || "");
    if (Object.keys(patch).length) {
      await prisma.festa.update({ where: { id: f.id }, data: patch }).catch(() => {});
    }
    return {
      id: f.id,
      token,
      tokenAlbum,
      dataISO: f.data.toISOString(),
      aniversariantes: anivs,
      tema: f.tema,
      gerente: f.gerente,
      instagramAnfitriao: f.instagramAnfitriao,
      horario: f.horario,
      finalizadaEm: f.finalizadaEm ? f.finalizadaEm.toISOString() : null,
      autorizacao: f.autorizacao,
      motivoNaoAutoriza: f.motivoNaoAutoriza,
      videoFotos: (() => { try { const a = JSON.parse(f.videoFotos || "[]"); return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : []; } catch { return []; } })(),
      videoCapa: f.videoCapa || "",
      videoMoldura: f.videoMoldura || "branca",
      videoTextoFinal: f.videoTextoFinal || "",
      videoTituloCapa: f.videoTituloCapa || "",
      videoMusica: f.videoMusica || "",
      videoUrl: f.videoUrl || "",
      videoPostado: !!f.videoUrl && urlsReelsPostados.has(f.videoUrl),
      videoAgendadoEm: (agendadoPorId.get(f.id.slice(-6)) ?? agendadoPorNome.get((f.aniversariante || "").trim()))?.toISOString() ?? null,
      mostrarAvaliacao: f.mostrarAvaliacao,
      fotos: f.fotos.map((foto) => ({ id: foto.id, url: foto.url, momento: foto.momento, descricao: foto.descricao })),
    };
  }));
  const atividades = ativ.map((a) => ({ id: a.id, agente: a.agente, texto: a.texto, criadoEm: a.criadoEm.toISOString() }));

  // Resumo de valor: o que o piloto JÁ publicou sozinho, pelos 3 tipos (as 3 abas:
  // Carrosséis, Publicações, Story). A soma fecha certinho (carrosseis + feed + stories
  // = total).
  const carrosseisPostados = conteudos.filter((c) => c.status === "postado" && c.postadoEm).length;
  const feedPostados = pubs.filter((p) => p.formato !== "story" && p.formato !== "reels" && p.status === "postado" && p.postadoEm).length;
  const storiesPostados = pubs.filter((p) => p.formato === "story" && p.status === "postado" && p.postadoEm).length;
  const reelsPostados = pubs.filter((p) => p.formato === "reels" && p.status === "postado" && p.postadoEm).length;
  const entregue = {
    carrosseis: carrosseisPostados,
    feed: feedPostados,
    stories: storiesPostados,
    reels: reelsPostados,
    total: carrosseisPostados + feedPostados + storiesPostados + reelsPostados,
  };

  const posts: Post[] = conteudos.map((c) => {
    let slides: string[] = [];
    try {
      slides = JSON.parse(c.slides);
    } catch {}
    let st: { imagemUrl?: string; tipo?: string; titulo?: string; texto?: string; semTexto?: boolean }[] = [];
    try {
      st = JSON.parse(c.slidesTexto || "[]") as { imagemUrl?: string; tipo?: string; titulo?: string; texto?: string; semTexto?: boolean }[];
    } catch {}
    const imagensSlides: (string | null)[] = st.map((s) => s?.imagemUrl ?? null);
    const tiposSlides: (string | undefined)[] = st.map((s) => s?.tipo);
    const semTextoSlides: boolean[] = st.map((s) => !!s?.semTexto);
    const textosSlides = st.map((s) => ({ titulo: s?.titulo ?? "", texto: s?.texto ?? "" }));
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
      semTextoSlides,
      textosSlides,
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
    formato: p.formato,
    videoUrl: p.videoUrl,
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
  const publicacoes: PublicacaoView[] = pubs.filter((p) => p.formato !== "story" && p.formato !== "reels").map(mapPub);
  const stories: PublicacaoView[] = pubs.filter((p) => p.formato === "story").map(mapPub);
  // capa pro card de Reels quando o vídeo já foi ARQUIVADO: foto da FESTA CERTA (a escolhida
  // pra capa, ou a 1ª). O vínculo principal é o ID embutido no slug do Reels
  // ("reels-<6 últimos do festaId>-…") — exato, não confunde festas de aniversariantes com o
  // mesmo nome (ex: dois "Pedro"). O nome fica só de RESERVA pra reels antigos sem esse slug.
  // Replica a regra do MOTOR do vídeo (gerarVideoDaFesta): capa = a foto ESCOLHIDA
  // (videoCapa) → senão a 1ª da SEQUÊNCIA do vídeo (videoFotos) → senão a foto mais
  // antiga da festa. Assim o card mostra a MESMA imagem que abre o Reels no Instagram.
  const capaDaFesta = (f: (typeof festasRaw)[number]): string | undefined => {
    const porId = new Map(f.fotos.map((x) => [x.id, x.url]));
    if (f.videoCapa && porId.has(f.videoCapa)) return porId.get(f.videoCapa);
    try {
      for (const id of JSON.parse(f.videoFotos || "[]") as string[]) {
        if (porId.has(id)) return porId.get(id);
      }
    } catch {}
    // fotos vêm ordenadas da mais NOVA pra mais antiga → a última é a 1ª subida.
    return f.fotos[f.fotos.length - 1]?.url;
  };
  const capaPorNome = new Map<string, string>();
  for (const f of festasRaw) {
    const nome = (f.aniversariante || "").trim();
    const cap = capaDaFesta(f);
    if (nome && cap && !capaPorNome.has(nome)) capaPorNome.set(nome, cap);
  }
  const reels: PublicacaoView[] = pubs.filter((p) => p.formato === "reels").map((p) => {
    const suf = (p.slug.match(/^reels-([a-z0-9]{6})-/) || [])[1];
    const festaDoSlug = suf ? festasRaw.find((f) => f.id.endsWith(suf)) : undefined;
    return {
      ...mapPub(p),
      capaReel: (festaDoSlug && capaDaFesta(festaDoSlug)) || capaPorNome.get((p.titulo || "").replace(/^Reels\s*[—–-]\s*/i, "").trim()) || null,
    };
  });
  // Festas com vídeo já montado → alimentam o agendador de Reels na aba Redes Sociais.
  const festasComVideo = festasRaw
    .filter((f) => (f.videoUrl || "").startsWith("http"))
    .map((f) => ({ tipo: "festa" as const, id: f.id, nome: f.aniversariante || "Festa", videoUrl: f.videoUrl, data: f.data.toISOString(), horario: f.horario }));

  // Vídeos TEMÁTICOS do buffet (Reels institucionais do acervo) — aba 🎬 Vídeo + agendador de
  // Reels. A capa do card sai de `imgs` (o acervo já veio no Promise.all — sem query extra).
  const urlDaFoto = new Map(imgs.map((i) => [i.id, i.url]));
  // Quantas vezes cada vídeo temático já foi POSTADO (o vínculo é a FK Publicacao.videoTematicoId).
  // Diferente da festa, o temático é evergreen: mostra "📮 Postado" mas segue repostável.
  // Junto com isso, QUANDO foi a última vez e QUANTOS ainda estão na fila — o seletor de Reels
  // mostra esse histórico, já que o vídeo do buffet não tem festa nem data pra se orientar.
  const vezesPostadoTema = new Map<string, number>();
  const ultimoPostTema = new Map<string, Date>();
  const naFilaTema = new Map<string, number>();
  const proximoTema = new Map<string, Date>(); // a próxima data agendada (a mais perto de hoje)
  for (const p of pubs) {
    if (p.formato !== "reels" || !p.videoTematicoId) continue;
    if (p.status === "postado") {
      vezesPostadoTema.set(p.videoTematicoId, (vezesPostadoTema.get(p.videoTematicoId) || 0) + 1);
      const quando = p.postadoEm ?? p.data;
      const atual = ultimoPostTema.get(p.videoTematicoId);
      if (!atual || quando > atual) ultimoPostTema.set(p.videoTematicoId, quando);
    } else {
      naFilaTema.set(p.videoTematicoId, (naFilaTema.get(p.videoTematicoId) || 0) + 1);
      maisCedo(proximoTema, p.videoTematicoId, p.data);
    }
  }
  const videosTematicos = tematicosRaw.map((v) => {
    const ids = (() => { try { const a = JSON.parse(v.videoFotos || "[]"); return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : []; } catch { return [] as string[]; } })();
    return {
      id: v.id,
      titulo: v.titulo,
      videoUrl: v.videoUrl,
      videoFotos: ids,
      videoCapa: v.videoCapa,
      videoMoldura: v.videoMoldura,
      videoTextoFinal: v.videoTextoFinal,
      videoFundo: v.videoFundo || "",
      videoMusica: v.videoMusica || "",
      videoTextos: (() => { try { const m = JSON.parse(v.videoTextos || "{}"); return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, string>) : {}; } catch { return {}; } })(),
      narracao: { texto: v.narracaoTexto, voz: v.narracaoVoz, estilo: v.narracaoEstilo, url: v.narracaoUrl, segundos: v.narracaoSeg },
      capaUrl: (v.videoCapa && urlDaFoto.get(v.videoCapa)) || (ids[0] && urlDaFoto.get(ids[0])) || null,
      postadoVezes: vezesPostadoTema.get(v.id) || 0,
      naFila: naFilaTema.get(v.id) || 0,
      agendadoEm: proximoTema.get(v.id)?.toISOString() ?? null,
    };
  });
  // Temáticos prontos entram no seletor do agendador de Reels, na frente das festas. Como não
  // têm festa, `data` = quando o VÍDEO ficou pronto (videoEm; nos antigos, a criação do tema) e
  // vão junto o histórico de posts — é o que o seletor mostra no lugar do "Fulano · 12/07".
  const tematicosComVideo = tematicosRaw
    .filter((v) => v.videoUrl.startsWith("http"))
    .map((v) => ({
      tipo: "tema" as const,
      id: v.id,
      nome: v.titulo,
      videoUrl: v.videoUrl,
      data: (v.videoEm ?? v.criadoEm).toISOString(),
      horario: "",
      postadoVezes: vezesPostadoTema.get(v.id) || 0,
      ultimoPostEm: ultimoPostTema.get(v.id)?.toISOString() ?? null,
      naFila: naFilaTema.get(v.id) || 0,
    }));

  // Banco da aba Imagens = só as fotos-BASE PURAS que o dono sobe (sem festa E sem `momento`).
  // Foto vinda de festa tem `momento` preenchido (salão/brinquedos/…) — então, mesmo que perca o
  // vínculo (festa excluída → festaId null), ela NÃO polui a aba Imagens. Continua no rodízio dos
  // posts mesmo assim: a Bia (lib/imagens) busca por marcaId sem filtrar momento.
  const imagens: ImagemView[] = imgs.filter((i) => !i.festaId && !i.momento).map((i) => ({ id: i.id, url: i.url, categoria: i.categoria, descricao: i.descricao }));
  const evolucao = metricas.reverse().map((m) => ({ dia: m.dia.toISOString(), seguidores: m.seguidores, posts: m.posts }));

  // Inteligência: cruza categoria × horário × intenção (carrossel + feed; Story fica fora,
  // suas métricas não se comparam). Calculado aqui (servidor) com os posts já carregados —
  // sem query extra — e passado pronto pro cartão da Bia.
  const analiseLocal = analisarEngajamento([
    ...conteudos.map((c) => ({ categoria: c.categoria, curtidas: c.curtidas, comentarios: c.comentarios, alcance: c.alcance, salvamentos: c.salvamentos, quando: c.postadoEm ?? c.data, titulo: c.titulo })),
    ...pubs.filter((p) => p.formato !== "story").map((p) => ({ categoria: p.categoria, curtidas: p.curtidas, comentarios: p.comentarios, alcance: p.alcance, salvamentos: p.salvamentos, quando: p.postadoEm ?? p.data, titulo: p.titulo })),
  ]);
  // GALHO 2 — quando a Bia já ESTUDOU O FEED (aba Instagram), a análise do histórico fica
  // cacheada na marca. O histórico inclui TUDO (até posts feitos fora do Postaí), então se ele
  // mede mais posts que a análise local, o cérebro oficial da Bia passa a usar ELE.
  const intel = marca.intelHistorico as unknown as AnaliseInsights | null;
  const analise = intel && intel.total >= analiseLocal.total ? intel : analiseLocal;

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

  // Cliente (não-admin) cujo buffet ainda está VAZIO (zero conteúdo) → cai no ONBOARDING:
  // sobe logo (cores automáticas) + fotos e o Postaí gera a semana inteira. Assim que existe
  // conteúdo, mostra o painel/calendário normal. O admin nunca cai aqui (ele monta concierge).
  if (!sessao.admin && conteudos.length === 0 && pubs.length === 0) {
    return <OnboardingMarca marcaId={marca.id} nome={marca.nome} logoUrl={marca.logoUrl} fotosIniciais={imagens.map((i) => ({ id: i.id, url: i.url }))} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <MarcaHub
        marca={marcaView}
        posts={posts}
        publicacoes={publicacoes}
        stories={stories}
        reels={reels}
        festasComVideo={[...tematicosComVideo, ...festasComVideo]}
        videosTematicos={videosTematicos}
        imagens={imagens}
        festas={festas}
        campanhas={campanhas}
        atividades={atividades}
        linkBase={baseUrl()}
        tokenFotos={marca.tokenFotos}
        evolucao={evolucao}
        conectada={marcaConectada(marca)}
        assinatura={assinatura}
        ehAdmin={sessao.admin}
        ehTrial={ehTrial(sessao)}
        entregue={entregue}
        analise={analise}
        sugestao={sugestao}
      />
    </div>
  );
}
