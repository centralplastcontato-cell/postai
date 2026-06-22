"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaPorTokenFotos, festaPorToken, gerarTokenFesta, gerarTokenAlbum } from "@/lib/festa";
import { parseAniversariantes, nomesAniversariantes } from "@/lib/aniversariantes";
import { normalizarMomento, categoriaDoMomento, LIMITE_FOTOS_MOMENTO, LIMITE_FOTOS_FESTA } from "@/lib/momentos-festa";
import { descreverImagem } from "@/lib/imagem-ia";
import { publicarReelsNasRedes } from "@/lib/instagram";
import { dispararMotorReels } from "@/lib/video-engine";
import { musicaBuffet } from "@/lib/musica-buffet";
import { baseUrl } from "@/lib/config";

// ===========================================================================
// ÁLBUM DA FESTA — server actions
//
// Duas frentes:
//  • PAINEL (com sessão): o dono gera/revoga o link e administra as festas.
//    Passa por guardaMarca (multi-tenant, anti-IDOR).
//  • PÚBLICO (sem sessão): o gerente cria a festa pelo link. Autorizado pelo
//    TOKEN (marcaPorTokenFotos), não pela sessão — quem tem o link, mexe nas fotos.
// ===========================================================================

// Converte "aaaa-mm-dd" num Date ao MEIO-DIA de Brasília (-03:00). Usar meia-noite UTC faria
// a data "voltar" um dia ao exibir em BRT (ex: 20/06 viraria 19/06). Retorna null se inválida.
function dataDoDiaBRT(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const d = new Date(`${iso}T12:00:00-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

// --- PAINEL -----------------------------------------------------------------

// Código curto e LEGÍVEL pro fim do link (sem caracteres ambíguos: nada de i/l/o/0/1).
// É a credencial secreta do link — 6 chars de um alfabeto de 31 = ~887 milhões de combinações,
// inviável de adivinhar. O slug da marca antes dele é só identidade (bonito, dá confiança).
function codigoCurto(n = 6): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
}

// Gera (ou regenera) o link público do Álbum da Festa pra marca. Regerar REVOGA o link
// anterior (o token antigo deixa de existir) — útil se o link vazou. Formato bonito:
// "<slug-da-marca>-<código>" (ex: castelo-da-diversao-k7p9w2).
export async function gerarLinkFotos(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const m = await prisma.marca.findUnique({ where: { id: marcaId }, select: { slug: true } });
  const token = `${m?.slug || "festa"}-${codigoCurto()}`;
  await prisma.marca.update({ where: { id: marcaId }, data: { tokenFotos: token } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, token };
}

// Revoga o link (limpa o token): o link antigo para de funcionar na hora.
export async function revogarLinkFotos(marcaId: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.marca.update({ where: { id: marcaId }, data: { tokenFotos: "" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

// Edita as infos da festa pelo PAINEL (com sessão/dono): data, aniversariantes (nome+idade)
// e tema. Atualiza o label derivado (`aniversariante`) junto.
export async function editarFesta(
  festaId: string,
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string; horario?: string },
) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!f) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const lista = parseAniversariantes(JSON.stringify(input.aniversariantes || [])).slice(0, 10);
  if (!lista.length) return { ok: false as const, erro: "Informe o nome de pelo menos um aniversariante." };
  const data = dataDoDiaBRT(input.dataISO);
  if (!data) return { ok: false as const, erro: "Data inválida." };
  await prisma.festa.update({
    where: { id: festaId },
    data: {
      data,
      aniversariante: nomesAniversariantes(lista),
      aniversariantes: JSON.stringify(lista),
      tema: (input.tema || "").trim().slice(0, 80),
      horario: (input.horario || "").trim().slice(0, 5),
    },
  });
  revalidatePath(`/painel/marcas/${f.marcaId}`);
  return { ok: true as const };
}

// O ADMIN/dono adiciona uma foto a uma festa pelo PAINEL (com sessão). A foto já vem subida
// no Blob (via /api/marketing/upload). Mapeia categoria do momento, respeita os limites e
// descreve com IA — igual ao upload do gerente, mas autorizado por sessão (guardaMarca).
export async function adicionarFotoFestaPainel(festaId: string, url: string, momento: string) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!f) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const u = (url || "").trim();
  if (!u) return { ok: false as const, erro: "Foto sem URL." };
  const mom = normalizarMomento(momento);
  const totalFesta = await prisma.imagemMarca.count({ where: { festaId } });
  if (totalFesta >= LIMITE_FOTOS_FESTA) return { ok: false as const, erro: `Esta festa já atingiu o limite de ${LIMITE_FOTOS_FESTA} fotos.` };
  const noMomento = await prisma.imagemMarca.count({ where: { festaId, momento: mom } });
  if (noMomento >= LIMITE_FOTOS_MOMENTO) return { ok: false as const, erro: `Este momento já tem ${LIMITE_FOTOS_MOMENTO} fotos (o máximo).` };
  const img = await prisma.imagemMarca.create({
    data: { marcaId: f.marcaId, url: u, categoria: categoriaDoMomento(mom), festaId, momento: mom },
  });
  const descricao = await descreverImagem(u);
  if (descricao) await prisma.imagemMarca.update({ where: { id: img.id }, data: { descricao } }).catch(() => {});
  revalidatePath(`/painel/marcas/${f.marcaId}`);
  return { ok: true as const };
}

// Exclui uma festa. As FOTOS não somem do banco — o festaId delas vira null (SetNull no
// schema), então elas seguem alimentando as artes; só perdem o agrupamento por festa.
export async function excluirFesta(festaId: string) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!f) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.festa.delete({ where: { id: festaId } });
  revalidatePath(`/painel/marcas/${f.marcaId}`);
  return { ok: true as const };
}

// --- PÚBLICO (validado por TOKEN, sem sessão) -------------------------------

// O gerente cria uma festa pelo LINK DE CRIAR (tokenMarca). Gera o token PRÓPRIO da festa e
// o devolve — a página redireciona pro link isolado dela. Aceita vários aniversariantes.
export async function criarFestaPublica(
  tokenMarca: string,
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string; horario?: string },
) {
  const m = await marcaPorTokenFotos(tokenMarca);
  if (!m) return { ok: false as const, erro: "Link inválido ou desativado. Peça um novo ao buffet." };
  // parseAniversariantes limpa/normaliza a lista (descarta sem nome, idade 0–130 ou null).
  const lista = parseAniversariantes(JSON.stringify(input.aniversariantes || [])).slice(0, 10);
  if (!lista.length) return { ok: false as const, erro: "Informe o nome de pelo menos um aniversariante." };
  const data = dataDoDiaBRT(input.dataISO);
  if (!data) return { ok: false as const, erro: "Data inválida." };
  const festaToken = gerarTokenFesta();
  const festa = await prisma.festa.create({
    data: {
      marcaId: m.id,
      token: festaToken,
      // Link público SÓ-LEITURA do álbum pros pais — BONITO: "<buffet>-<criança>-<código>".
      tokenAlbum: gerarTokenAlbum(m.slug, lista[0]?.nome || ""),
      data,
      aniversariante: nomesAniversariantes(lista), // label de exibição derivado
      aniversariantes: JSON.stringify(lista),
      tema: (input.tema || "").trim().slice(0, 80),
      horario: (input.horario || "").trim().slice(0, 5),
    },
  });
  return { ok: true as const, festaId: festa.id, festaToken };
}

// O gerente remove uma foto que subiu errada — pelo LINK DA FESTA (validado por festaToken).
// Só apaga foto DESTA festa: o link não mexe em outras festas nem nas fotos do banco geral.
export async function removerFotoPublica(festaToken: string, fotoId: string) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  const foto = await prisma.imagemMarca.findUnique({ where: { id: fotoId }, select: { festaId: true } });
  if (!foto || foto.festaId !== f.id) return { ok: false as const, erro: "Foto não encontrada." };
  await prisma.imagemMarca.delete({ where: { id: fotoId } });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// O gerente registra o NOME dele (quem está documentando a festa). Pelo link da festa.
export async function salvarGerenteFesta(festaToken: string, nome: string) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  await prisma.festa.update({ where: { id: f.id }, data: { gerente: (nome || "").trim().slice(0, 60) } });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// O gerente registra a AUTORIZAÇÃO de uso de imagem (os pais autorizam a divulgação?). Pelo
// link da festa. autoriza=true → "autorizada" (libera álbum + posts + funções futuras);
// false → "negada" (+ motivo obrigatório; as fotos nunca viram divulgação pública).
export async function salvarAutorizacaoFesta(festaToken: string, autoriza: boolean, motivo: string) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  if (!autoriza && !(motivo || "").trim()) return { ok: false as const, erro: "Diga o motivo de não autorizar." };
  await prisma.festa.update({
    where: { id: f.id },
    data: {
      autorizacao: autoriza ? "autorizada" : "negada",
      motivoNaoAutoriza: autoriza ? "" : (motivo || "").trim().slice(0, 300),
    },
  });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// Liga/desliga o card "Avalie no Google" no álbum dos pais (gerente, pela tela pública por token).
export async function salvarMostrarAvaliacao(festaToken: string, mostrar: boolean) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  await prisma.festa.update({ where: { id: f.id }, data: { mostrarAvaliacao: mostrar } });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// O gerente marca a festa como FINALIZADA (terminou de subir) — ou REABRE pra adicionar mais.
// Pelo LINK DA FESTA (validado por festaToken). Sinaliza ao dono que está completa. EXIGE que a
// autorização de uso de imagem já tenha sido decidida (não pode finalizar com "pendente").
export async function finalizarFestaPublica(festaToken: string, finalizar: boolean) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  if (finalizar && f.autorizacao === "pendente") {
    return { ok: false as const, erro: "Antes de finalizar, registre a autorização de uso de imagem dos pais." };
  }
  await prisma.festa.update({ where: { id: f.id }, data: { finalizadaEm: finalizar ? new Date() : null } });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// O gerente MOVE uma foto pro momento certo (subiu no lugar errado). Pelo LINK DA FESTA.
// Atualiza o momento E a categoria do banco — a foto volta a casar com o post certo.
// Respeita o limite por momento no destino.
export async function moverFotoMomento(festaToken: string, fotoId: string, novoMomento: string) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  const mom = normalizarMomento(novoMomento);
  const foto = await prisma.imagemMarca.findUnique({ where: { id: fotoId }, select: { festaId: true, momento: true } });
  if (!foto || foto.festaId !== f.id) return { ok: false as const, erro: "Foto não encontrada." };
  if (foto.momento === mom) return { ok: true as const }; // já está no momento pedido
  const noDestino = await prisma.imagemMarca.count({ where: { festaId: f.id, momento: mom } });
  if (noDestino >= LIMITE_FOTOS_MOMENTO) return { ok: false as const, erro: `Esse momento já tem ${LIMITE_FOTOS_MOMENTO} fotos (o máximo).` };
  await prisma.imagemMarca.update({ where: { id: fotoId }, data: { momento: mom, categoria: categoriaDoMomento(mom) } });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
}

// Salva a SELEÇÃO ordenada de fotos pro VÍDEO/Reels da festa (do PAINEL — guardaMarca). Só aceita
// fotos que SÃO desta festa; guarda os IDs na ordem escolhida (máx 30). Lista vazia volta pro automático.
export async function salvarFotosVideo(festaId: string, fotoIds: string[]) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const validas = await prisma.imagemMarca.findMany({ where: { festaId, id: { in: fotoIds } }, select: { id: true } });
  const set = new Set(validas.map((v) => v.id));
  const ordenadas = fotoIds.filter((id) => set.has(id)).slice(0, 30); // mantém a ordem escolhida
  await prisma.festa.update({ where: { id: festaId }, data: { videoFotos: JSON.stringify(ordenadas) } });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, total: ordenadas.length };
}

// Cria um POST DE REELS agendado a partir do vídeo JÁ montado da festa. Entra na Agenda como
// Publicacao formato="reels" (status a_postar), pronto pra revisar e ser postado pelo piloto.
// TRAVA LGPD: festa sem autorização dos pais NUNCA vira divulgação pública.
export async function agendarReelsDaFesta(festaId: string, dataYMD: string, legendaManual?: string, horaSel?: number) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, videoUrl: true, autorizacao: true, tema: true, aniversariante: true, aniversariantes: true, marca: { select: { nome: true, horaPost: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (festa.autorizacao !== "autorizada") return { ok: false as const, erro: "Esta festa não tem autorização de uso de imagem — não pode ser divulgada." };
  if (!festa.videoUrl) return { ok: false as const, erro: "Esta festa ainda não tem vídeo gerado." };

  const horaFinal = (typeof horaSel === "number" && horaSel >= 0 && horaSel <= 23) ? horaSel : (festa.marca.horaPost ?? 10);
  const hh = String(horaFinal).padStart(2, "0");
  const data = new Date(`${dataYMD}T${hh}:00:00-03:00`); // BRT
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };

  const nome = festa.aniversariante || "a criança";
  const legenda = (legendaManual && legendaManual.trim())
    || (await legendaReelsIA({ aniversariante: festa.aniversariante, aniversariantes: festa.aniversariantes, tema: festa.tema, buffet: festa.marca.nome }));

  const slug = `reels-${festaId.slice(-6)}-${randomBytes(3).toString("hex")}`;
  const pub = await prisma.publicacao.create({
    data: {
      marcaId: festa.marcaId,
      slug,
      data,
      template: "divulgacao",
      titulo: `Reels — ${nome}`,
      legenda,
      formato: "reels",
      videoUrl: festa.videoUrl,
      categoria: "prova_social",
      status: "a_postar",
      aprovado: false,
    },
  });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, id: pub.id };
}

// Gera (via IA, com fallback) uma legenda CALOROSA pro Reels da festa, conectada ao aniversariante
// (nome, idade, tema). Usada tanto no agendamento automático quanto no botão "Escrever com a Bia".
async function legendaReelsIA(d: { aniversariante: string; aniversariantes: string; tema: string; buffet: string }): Promise<string> {
  const anivs = parseAniversariantes(d.aniversariantes);
  const nome = anivs[0]?.nome || d.aniversariante || "o aniversariante";
  const idade = anivs[0]?.idade;
  const tema = (d.tema || "").trim();
  const temaSlug = tema.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const hashTema = temaSlug ? ` #${temaSlug}` : "";
  const fallback = `✨ Que festa inesquecível! ${nome}${idade ? ` comemorou ${idade} aninhos` : " fez aniversário"}${tema ? ` com o tema ${tema}` : ""} aqui no ${d.buffet}. 🎉 Cada sorriso desse dia ficou guardado nesse vídeo 💛\n\nQuer uma festa assim pra quem você ama? Chama a gente! 🥳\n\n#festainfantil #buffetinfantil #aniversario${hashTema}`;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;

  const sistema = `Você é a social media de um buffet infantil chamado "${d.buffet}". Escreva a LEGENDA de um Reels (vídeo) que reúne as melhores fotos de uma festa real. Regras:
- Tom caloroso, emocional e brasileiro; celebre a CRIANÇA pelo nome.
- Frase de abertura com impacto.
- Use de 3 a 5 emojis no total (sem exagero).
- Termine com um convite SUTIL pra outras famílias marcarem a festa delas no buffet.
- Inclua de 3 a 5 hashtags no final (festa infantil, o tema).
- Máximo de 600 caracteres. Sem aspas. Não invente preço nem data.`;
  const pedido = `Festa de ${nome}${idade ? `, ${idade} anos` : ""}${tema ? `, tema ${tema}` : ""}, no buffet ${d.buffet}.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.8, max_tokens: 350, messages: [{ role: "system", content: sistema }, { role: "user", content: pedido }] }),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? String(content).trim() : fallback;
  } catch {
    return fallback;
  }
}

// Botão "✨ Escrever com a Bia": gera a legenda pro dono VER e editar antes de agendar.
export async function gerarLegendaReels(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, tema: true, aniversariante: true, aniversariantes: true, marca: { select: { nome: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const legenda = await legendaReelsIA({ aniversariante: festa.aniversariante, aniversariantes: festa.aniversariantes, tema: festa.tema, buffet: festa.marca.nome });
  return { ok: true as const, legenda };
}

// Edita um Reels JÁ agendado (data, hora e legenda) — só enquanto NÃO foi postado.
export async function atualizarReels(pubId: string, dataYMD: string, horaSel: number, legenda: string) {
  const pub = await prisma.publicacao.findUnique({ where: { id: pubId }, select: { marcaId: true, formato: true, status: true } });
  if (!pub) return { ok: false as const, erro: "Reels não encontrado." };
  if (pub.formato !== "reels") return { ok: false as const, erro: "Não é um Reels." };
  if (pub.status === "postado") return { ok: false as const, erro: "Esse Reels já foi postado." };
  const g = await guardaMarca(pub.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const hh = String((horaSel >= 0 && horaSel <= 23) ? horaSel : 10).padStart(2, "0");
  const data = new Date(`${dataYMD}T${hh}:00:00-03:00`); // BRT
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };
  await prisma.publicacao.update({ where: { id: pubId }, data: { data, legenda: legenda.trim() ? legenda.trim() : undefined } });
  revalidatePath(`/painel/marcas/${pub.marcaId}`);
  return { ok: true as const };
}

// POSTA o Reels AGORA no Instagram (botão "Postar agora"). Claim atômico (não posta 2x) e
// reverte se a Meta falhar. Usa a Meta API de Reels (processa o vídeo + publica) — pode levar
// até ~1 min por causa do processamento do vídeo.
export async function postarReelsAgora(pubId: string) {
  const pub = await prisma.publicacao.findUnique({
    where: { id: pubId },
    select: { marcaId: true, formato: true, status: true, videoUrl: true, legenda: true, marca: { select: { igUserId: true, accessToken: true } } },
  });
  if (!pub) return { ok: false as const, erro: "Reels não encontrado." };
  if (pub.formato !== "reels") return { ok: false as const, erro: "Não é um Reels." };
  const g = await guardaMarca(pub.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!pub.videoUrl) return { ok: false as const, erro: "Esse Reels não tem vídeo." };
  if (!pub.marca.igUserId || !pub.marca.accessToken) return { ok: false as const, erro: "A marca não está conectada ao Instagram." };

  // claim: marca como postado ANTES de postar (evita 2 cliques publicarem 2x). Reverte se falhar.
  const claim = await prisma.publicacao.updateMany({ where: { id: pubId, status: "a_postar" }, data: { status: "postado", postadoEm: new Date() } });
  if (claim.count === 0) return { ok: false as const, erro: "Esse Reels já foi postado." };

  const r = await publicarReelsNasRedes({ igUserId: pub.marca.igUserId, accessToken: pub.marca.accessToken }, pub.videoUrl, pub.legenda);
  if (!r.ig.ok) {
    await prisma.publicacao.update({ where: { id: pubId }, data: { status: "a_postar", postadoEm: null } });
    return { ok: false as const, erro: r.ig.erro };
  }
  await prisma.publicacao.update({ where: { id: pubId }, data: { mediaId: r.ig.mediaId } });
  revalidatePath(`/painel/marcas/${pub.marcaId}`);
  return { ok: true as const, permalink: r.ig.permalink };
}

// Dispara o MOTOR DE VÍDEO pra gerar o Reels da festa (botão "⚡ Gerar vídeo"). Marca a festa
// como "gerando"; o motor monta em segundo plano e o /api/video-pronto salva a URL no fim.
// videoUrl = "" (sem vídeo) | "gerando" (em montagem) | URL http (pronto).
export async function gerarVideoDaFesta(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, videoFotos: true, videoUrl: true, aniversariante: true, aniversariantes: true, marca: { select: { logoUrl: true, slug: true } }, fotos: { select: { id: true, url: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (festa.videoUrl === "gerando") return { ok: false as const, erro: "Já estou gerando esse vídeo — aguarde um pouquinho." };
  if (!festa.marca.logoUrl) return { ok: false as const, erro: "A marca precisa de um logo pra montar o vídeo." };

  // fotos na ORDEM escolhida (ou as primeiras, se não houve seleção manual)
  let ids: string[] = [];
  try { ids = JSON.parse(festa.videoFotos || "[]"); } catch {}
  const mapa = new Map(festa.fotos.map((f) => [f.id, f.url]));
  let fotos = ids.map((id) => mapa.get(id)).filter((u): u is string => !!u);
  if (fotos.length === 0) fotos = festa.fotos.slice(0, 28).map((f) => f.url);
  if (fotos.length === 0) return { ok: false as const, erro: "Suba fotos antes de gerar o vídeo." };

  const anivs = parseAniversariantes(festa.aniversariantes);
  const nome = anivs[0]?.nome || festa.aniversariante || "a criança";
  const idade = anivs[0]?.idade;
  const textoCapa = idade ? `${nome} fez ${idade} aninhos` : `Festa da ${nome}`;
  const musicaUrl = musicaBuffet(festa.marca.slug) || undefined;

  await prisma.festa.update({ where: { id: festaId }, data: { videoUrl: "gerando" } });
  const r = await dispararMotorReels({
    fotos,
    logoUrl: festa.marca.logoUrl,
    musicaUrl,
    textoCapa,
    nomeArquivo: festa.marca.slug || "reels",
    festaId,
    callbackUrl: process.env.VIDEO_CALLBACK_URL || `${baseUrl()}/api/video-pronto`,
    callbackToken: process.env.VIDEO_CALLBACK_SECRET || "",
  });
  if (!r.ok) {
    await prisma.festa.update({ where: { id: festaId }, data: { videoUrl: "" } });
    return { ok: false as const, erro: r.erro };
  }
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const };
}
