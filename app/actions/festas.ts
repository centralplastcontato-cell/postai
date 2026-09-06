"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaPorTokenFotos, festaPorToken, gerarTokenFesta, gerarTokenAlbum } from "@/lib/festa";
import { parseAniversariantes, nomesAniversariantes, tituloCapaFesta } from "@/lib/aniversariantes";
import { normalizarMomento, categoriaDoMomento, LIMITE_FOTOS_MOMENTO, LIMITE_FOTOS_FESTA } from "@/lib/momentos-festa";
import { descreverImagem } from "@/lib/imagem-ia";
import { publicarReelsNasRedes, criarContainerReels, statusContainerReels, publicarContainerReels } from "@/lib/instagram";
import { dispararMotorReels } from "@/lib/video-engine";
import { horaSelParaHHMM } from "@/lib/horarios";
import { musicaBuffet } from "@/lib/musica-buffet";
import { baseUrl } from "@/lib/config";

// Hash curto e estável (djb2) pra chave de cache (?v=) das artes desenhadas por nós.
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

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
// Normaliza o @ do Instagram do anfitrião: tira "@", espaços e a URL se colarem o link inteiro.
// Guardamos só o username (sem @) — o "@" é colado na hora de usar (legenda do Reels). "" = sem.
function limparInsta(s?: string): string {
  return (s || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[@\s/?]/g, "").slice(0, 60);
}

export async function editarFesta(
  festaId: string,
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string; horario?: string; instagramAnfitriao?: string },
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
      ...(input.instagramAnfitriao !== undefined && { instagramAnfitriao: limparInsta(input.instagramAnfitriao) }),
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
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string; horario?: string; instagramAnfitriao?: string },
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
      instagramAnfitriao: limparInsta(input.instagramAnfitriao),
    },
  });
  return { ok: true as const, festaId: festa.id, festaToken };
}

// O gerente CORRIGE os dados da festa (data, horário, aniversariantes, tema, @ da família) —
// pelo LINK DA FESTA (validado por festaToken). Mesmos campos e validações do editarFesta do
// painel; o link só mexe NESTA festa. Existe porque quem cria no balcão erra digitação, e é
// o gerente que percebe na hora ("é com Y", "a festa mudou pras 15h").
export async function editarFestaPublica(
  festaToken: string,
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string; horario?: string; instagramAnfitriao?: string },
) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
  const lista = parseAniversariantes(JSON.stringify(input.aniversariantes || [])).slice(0, 10);
  if (!lista.length) return { ok: false as const, erro: "Informe o nome de pelo menos um aniversariante." };
  const data = dataDoDiaBRT(input.dataISO);
  if (!data) return { ok: false as const, erro: "Data inválida." };
  await prisma.festa.update({
    where: { id: f.id },
    data: {
      data,
      aniversariante: nomesAniversariantes(lista),
      aniversariantes: JSON.stringify(lista),
      tema: (input.tema || "").trim().slice(0, 80),
      horario: (input.horario || "").trim().slice(0, 5),
      instagramAnfitriao: limparInsta(input.instagramAnfitriao),
    },
  });
  revalidatePath(`/f/${festaToken}`);
  return { ok: true as const };
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

// Pelo PAINEL do dono (guardaMarca): finaliza/reabre uma festa que o gerente esqueceu de fechar.
// Mesma trava da pública: não finaliza com autorização "pendente" (LGPD).
export async function finalizarFestaPainel(festaId: string, finalizar: boolean) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true, autorizacao: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (finalizar && festa.autorizacao === "pendente") {
    return { ok: false as const, erro: "Antes de finalizar, registre a autorização de uso de imagem dos pais (abra a festa)." };
  }
  await prisma.festa.update({ where: { id: festaId }, data: { finalizadaEm: finalizar ? new Date() : null } });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
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
const MOLDURAS = ["nenhuma", "branca", "grossa", "marca"];
export async function salvarFotosVideo(festaId: string, fotoIds: string[], capa?: string, moldura?: string, textoFinal?: string, tituloCapa?: string, musica?: string) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const validas = await prisma.imagemMarca.findMany({ where: { festaId, id: { in: fotoIds } }, select: { id: true } });
  const set = new Set(validas.map((v) => v.id));
  const ordenadas = fotoIds.filter((id) => set.has(id)).slice(0, 30); // mantém a ordem escolhida
  const data: { videoFotos: string; videoCapa?: string; videoMoldura?: string; videoTextoFinal?: string; videoTituloCapa?: string; videoMusica?: string } = { videoFotos: JSON.stringify(ordenadas) };
  // capa: só aceita "" (automático) ou um fotoId que SEJA desta festa
  if (capa !== undefined) {
    const capaOk = capa === "" ? true : (await prisma.imagemMarca.count({ where: { festaId, id: capa } })) > 0;
    data.videoCapa = capaOk ? capa : "";
  }
  if (moldura !== undefined) data.videoMoldura = MOLDURAS.includes(moldura) ? moldura : "branca";
  if (textoFinal !== undefined) data.videoTextoFinal = textoFinal.trim().slice(0, 60); // limpa e limita
  if (tituloCapa !== undefined) data.videoTituloCapa = tituloCapa.trim().slice(0, 60); // "" = volta pro automático
  // música: "" = usa a padrão do buffet; senão só aceita URL http (do nosso upload no Blob)
  if (musica !== undefined) data.videoMusica = musica.startsWith("http") ? musica : "";
  await prisma.festa.update({ where: { id: festaId }, data });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, total: ordenadas.length };
}

// MASCOTE na CAPA do vídeo da festa: canto ("" não | dir | esq | cima-dir | cima-esq) + tamanho.
// Muda como o /api/capa-festa desenha a abertura (cola o mascote da marca no canto escolhido).
export async function definirMascoteFesta(festaId: string, canto: string, tam: string) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const c = ["", "dir", "esq", "cima-dir", "cima-esq"].includes(canto) ? canto : "";
  const t = ["p", "m", "g"].includes(tam) ? tam : "m";
  await prisma.festa.update({ where: { id: festaId }, data: { mascoteCanto: c, mascoteTam: t } });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, canto: c, tam: t };
}

// Biblioteca de MÚSICAS da marca: as trilhas que o dono já enviou, pra reusar em qualquer vídeo.
type MusicaBanco = { url: string; nome: string };
function lerMusicas(json: string | null): MusicaBanco[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((m): m is MusicaBanco => !!m && typeof m.url === "string" && m.url.startsWith("http")) : [];
  } catch { return []; }
}

// Lista as trilhas da biblioteca da marca + o link da música PADRÃO do buffet (pra dar play nela
// também). Recebe o festaId só pra descobrir/guardar a marca.
export async function listarMusicasDaMarca(festaId: string) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada.", musicas: [] as MusicaBanco[], buffetUrl: "" };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro, musicas: [] as MusicaBanco[], buffetUrl: "" };
  const marca = await prisma.marca.findUnique({ where: { id: festa.marcaId }, select: { musicas: true, slug: true } });
  return { ok: true as const, musicas: lerMusicas(marca?.musicas ?? "[]"), buffetUrl: musicaBuffet(marca?.slug ?? "") || "" };
}

// Adiciona uma trilha recém-enviada à biblioteca da marca (dedup por URL; mantém as últimas 40).
export async function adicionarMusicaAoBanco(festaId: string, url: string, nome: string) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada.", musicas: [] as MusicaBanco[] };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro, musicas: [] as MusicaBanco[] };
  if (!url.startsWith("http")) return { ok: false as const, erro: "URL inválida.", musicas: [] as MusicaBanco[] };
  const marca = await prisma.marca.findUnique({ where: { id: festa.marcaId }, select: { musicas: true } });
  const atuais = lerMusicas(marca?.musicas ?? "[]").filter((m) => m.url !== url);
  const lista = [{ url, nome: (nome || "música").slice(0, 80) }, ...atuais].slice(0, 40);
  await prisma.marca.update({ where: { id: festa.marcaId }, data: { musicas: JSON.stringify(lista) } });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, musicas: lista };
}

// Remove UMA trilha da biblioteca de músicas da marca (pra limpar repetidas). Só tira da lista de
// reuso — NÃO mexe na música que já está escolhida em festas/vídeos (o vídeo daquela festa segue igual).
export async function removerMusicaDoBanco(festaId: string, url: string) {
  const festa = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada.", musicas: [] as MusicaBanco[] };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro, musicas: [] as MusicaBanco[] };
  const marca = await prisma.marca.findUnique({ where: { id: festa.marcaId }, select: { musicas: true } });
  const lista = lerMusicas(marca?.musicas ?? "[]").filter((m) => m.url !== url);
  await prisma.marca.update({ where: { id: festa.marcaId }, data: { musicas: JSON.stringify(lista) } });
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const, musicas: lista };
}

// CLIPES DE VÍDEO da festa (URLs no Blob) — intercalam com as fotos no vídeo (entram mudos). Máx 6.
export async function definirClipesFesta(festaId: string, clipes: string[], posicao?: string, duracao?: string) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true } });
  if (!f) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const urls = (Array.isArray(clipes) ? clipes : []).filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 6);
  const data: { videoClipes: string; videoClipesPos?: string; videoClipesDur?: string } = { videoClipes: JSON.stringify(urls) };
  if (posicao && ["espalhados", "comeco", "fim"].includes(posicao)) data.videoClipesPos = posicao;
  if (duracao && ["curto", "medio", "completo"].includes(duracao)) data.videoClipesDur = duracao;
  await prisma.festa.update({ where: { id: festaId }, data });
  revalidatePath(`/painel/marcas/${f.marcaId}`);
  return { ok: true as const, clipes: urls };
}

// ZERA o vídeo da festa: volta TODAS as escolhas do vídeo ao começo (fotos, capa, moldura, mascote,
// música, clipes, textos) e apaga o MP4 montado — como se o vídeo nunca tivesse sido feito. A FESTA
// e as FOTOS do álbum NÃO são tocadas. Usado pro botão "Recomeçar vídeo".
export async function zerarVideoFesta(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, videoUrl: true, videoClipes: true },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (festa.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar pra recomeçar." };

  // Volta tudo do vídeo ao padrão (mantém a festa e as fotos).
  await prisma.festa.update({
    where: { id: festaId },
    data: {
      videoFotos: "[]", videoCapa: "", videoMoldura: "branca", mascoteCanto: "", mascoteTam: "m",
      videoTextoFinal: "", videoTituloCapa: "", videoMusica: "", videoClipes: "[]",
      videoClipesPos: "espalhados", videoClipesDur: "completo", videoUrl: "",
    },
  });

  // Limpa o Blob (best-effort, em segundo plano): os CLIPES (só entram no motor, ninguém mais usa)
  // e o MP4 montado — este só se NENHUM post agendado ainda apontar pra ele (o post guarda a mesma
  // URL). A música NÃO é apagada (pode estar na biblioteca da marca).
  import("@vercel/blob").then(async ({ del }) => {
    let clipes: string[] = [];
    try { clipes = (JSON.parse(festa.videoClipes || "[]") as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http")); } catch {}
    for (const c of clipes) del(c).catch(() => {});
    if (festa.videoUrl?.startsWith("http")) {
      const emUso = await prisma.publicacao.count({ where: { status: "a_postar", videoUrl: festa.videoUrl } });
      if (emUso === 0) del(festa.videoUrl).catch(() => {});
    }
  }).catch(() => {});

  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const };
}

// Cria um POST DE REELS agendado a partir do vídeo JÁ montado da festa. Entra na Agenda como
// Publicacao formato="reels" (status a_postar), pronto pra revisar e ser postado pelo piloto.
// TRAVA LGPD: festa sem autorização dos pais NUNCA vira divulgação pública.
export async function agendarReelsDaFesta(festaId: string, dataYMD: string, legendaManual?: string, horaSel?: number | string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, videoUrl: true, autorizacao: true, tema: true, aniversariante: true, aniversariantes: true, instagramAnfitriao: true, marca: { select: { nome: true, horaPost: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (festa.autorizacao !== "autorizada") return { ok: false as const, erro: "Esta festa não tem autorização de uso de imagem — não pode ser divulgada." };
  if (!festa.videoUrl) return { ok: false as const, erro: "Esta festa ainda não tem vídeo gerado." };

  const hh = horaSelParaHHMM(horaSel, festa.marca.horaPost ?? 10);
  const data = new Date(`${dataYMD}T${hh}:00-03:00`); // BRT
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };

  const nome = festa.aniversariante || "a criança";
  const legendaBase = (legendaManual && legendaManual.trim())
    || (await legendaReelsIA({ aniversariante: festa.aniversariante, aniversariantes: festa.aniversariantes, tema: festa.tema, buffet: festa.marca.nome }));
  // MARCA a família: o @ entra na legenda → eles são notificados e o post alcança os seguidores deles.
  const legenda = festa.instagramAnfitriao ? `${legendaBase}\n\n📸 @${festa.instagramAnfitriao}` : legendaBase;

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

// Botão "✨ Bia escreve" do SLIDE FINAL do vídeo: gera uma FRASE CURTA de encerramento (cabe em 1 linha).
export async function gerarTextoFinalVideo(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, tema: true, aniversariante: true, aniversariantes: true, marca: { select: { nome: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };

  const anivs = parseAniversariantes(festa.aniversariantes);
  const nome = anivs[0]?.nome || festa.aniversariante || "";
  const idade = anivs[0]?.idade;
  const tema = (festa.tema || "").trim();
  const fallback = nome ? `Obrigado por esse dia, ${nome}! 💛` : "Que dia inesquecível! 💛";

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: true as const, texto: fallback.slice(0, 48) };

  const sistema = `Você escreve a FRASE FINAL (encerramento) de um vídeo de festa infantil do buffet "${festa.marca.nome}". Regras ESTRITAS:
- UMA frase curta, no MÁXIMO 42 caracteres (cabe em 1 linha grande na tela).
- Tom carinhoso e brasileiro; pode citar o nome da criança.
- Apenas 1 emoji, no fim.
- Sem aspas, sem hashtag.`;
  const pedido = `Festa de ${nome || "uma criança"}${idade ? `, ${idade} anos` : ""}${tema ? `, tema ${tema}` : ""}.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.9, max_tokens: 40, messages: [{ role: "system", content: sistema }, { role: "user", content: pedido }] }),
    });
    if (!resp.ok) return { ok: true as const, texto: fallback.slice(0, 48) };
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    const texto = raw ? String(raw).trim().replace(/^["']|["']$/g, "").slice(0, 48) : fallback;
    return { ok: true as const, texto: texto || fallback.slice(0, 48) };
  } catch {
    return { ok: true as const, texto: fallback.slice(0, 48) };
  }
}

// A Bia sugere o TÍTULO DA CAPA (o gancho da 1ª tela). Diferente do texto final: aqui ela cita
// o(s) nome(s) e a idade e faz uma frase que dá vontade de assistir. Fallback = o título
// automático (tituloCapaFesta) — se a IA/chave falhar, nunca volta vazio.
export async function gerarTituloCapaVideo(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, tema: true, aniversariante: true, aniversariantes: true, marca: { select: { nome: true } } },
  });
  if (!festa) return { ok: false as const, erro: "Festa não encontrada." };
  const g = await guardaMarca(festa.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };

  const anivs = parseAniversariantes(festa.aniversariantes);
  const nomes = nomesAniversariantes(anivs) || festa.aniversariante || "";
  const idade = anivs[0]?.idade;
  const tema = (festa.tema || "").trim();
  const fallback = tituloCapaFesta(anivs, festa.aniversariante) || "Que festa inesquecível!";

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: true as const, texto: fallback.slice(0, 60) };

  const sistema = `Você escreve o TÍTULO DA CAPA (a 1ª tela, o gancho que segura o dedo de quem rola o feed) de um vídeo de festa infantil do buffet "${festa.marca.nome}". Regras ESTRITAS:
- UMA frase curta e forte, no MÁXIMO 52 caracteres.
- CITE o(s) nome(s) da(s) criança(s); use a idade se fizer sentido.
- Tom alegre e brasileiro, que dá vontade de assistir.
- No MÁXIMO 1 emoji (pode ser nenhum).
- Sem aspas, sem hashtag.`;
  const pedido = `${anivs.length > 1 ? "Aniversariantes" : "Aniversariante"}: ${nomes || "uma criança"}${idade != null ? `, ${idade} anos` : ""}${tema ? `, tema ${tema}` : ""}.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.9, max_tokens: 40, messages: [{ role: "system", content: sistema }, { role: "user", content: pedido }] }),
    });
    if (!resp.ok) return { ok: true as const, texto: fallback.slice(0, 60) };
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    const texto = raw ? String(raw).trim().replace(/^["']|["']$/g, "").slice(0, 60) : fallback;
    return { ok: true as const, texto: texto || fallback.slice(0, 60) };
  } catch {
    return { ok: true as const, texto: fallback.slice(0, 60) };
  }
}

// Edita um Reels JÁ agendado (data, hora e legenda) — só enquanto NÃO foi postado.
export async function atualizarReels(pubId: string, dataYMD: string, horaSel: number | string, legenda: string) {
  const pub = await prisma.publicacao.findUnique({ where: { id: pubId }, select: { marcaId: true, formato: true, status: true } });
  if (!pub) return { ok: false as const, erro: "Reels não encontrado." };
  if (pub.formato !== "reels") return { ok: false as const, erro: "Não é um Reels." };
  if (pub.status === "postado") return { ok: false as const, erro: "Esse Reels já foi postado." };
  const g = await guardaMarca(pub.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const hh = horaSelParaHHMM(horaSel, 10);
  const data = new Date(`${dataYMD}T${hh}:00-03:00`); // BRT
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
    select: { marcaId: true, formato: true, status: true, videoUrl: true, legenda: true, marca: { select: { igUserId: true, accessToken: true, fbPageId: true } } },
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
  // Espelha no Facebook (best-effort) se a marca tiver Facebook conectado.
  const { espelharVideoFacebook } = await import("@/lib/facebook");
  const fb = await espelharVideoFacebook(pub.marca, pub.videoUrl, pub.legenda).catch(() => undefined);
  revalidatePath(`/painel/marcas/${pub.marcaId}`);
  return { ok: true as const, permalink: r.ig.permalink, facebook: fb ? fb.ok : null };
}

// "Postar agora" em 2 FASES (igual o piloto): postar tudo de uma vez estourava o limite de 60s da
// função (a Meta leva até ~1min PROCESSANDO o vídeo). Aqui a FASE 1 só cria o container (rápido) e
// devolve o id; a tela fica consultando a FASE 2 até o vídeo ficar pronto e aí publica. Cada chamada
// é curta — nenhuma passa dos 60s.
export async function prepararReelsAgora(pubId: string) {
  const pub = await prisma.publicacao.findUnique({
    where: { id: pubId },
    select: { marcaId: true, formato: true, status: true, videoUrl: true, legenda: true, marca: { select: { igUserId: true, accessToken: true } } },
  });
  if (!pub) return { ok: false as const, erro: "Reels não encontrado." };
  if (pub.formato !== "reels") return { ok: false as const, erro: "Não é um Reels." };
  const g = await guardaMarca(pub.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (pub.status === "postado") return { ok: false as const, erro: "Esse Reels já foi postado." };
  if (!pub.videoUrl) return { ok: false as const, erro: "Esse Reels não tem vídeo." };
  if (!pub.marca.igUserId || !pub.marca.accessToken) return { ok: false as const, erro: "A marca não está conectada ao Instagram." };
  const c = await criarContainerReels({ igUserId: pub.marca.igUserId, accessToken: pub.marca.accessToken }, pub.videoUrl, pub.legenda);
  if (!c.ok) return { ok: false as const, erro: c.erro };
  return { ok: true as const, containerId: c.containerId };
}

// FASE 2: a tela chama de tempos em tempos. Enquanto a Meta processa → { pronto: false }. Quando
// FINISHED → marca como postado (trava contra 2 cliques) e publica de verdade. ERRO/EXPIRED → falha.
export async function concluirReelsAgora(pubId: string, containerId: string) {
  const pub = await prisma.publicacao.findUnique({
    where: { id: pubId },
    select: { marcaId: true, status: true, videoUrl: true, legenda: true, marca: { select: { igUserId: true, accessToken: true, fbPageId: true } } },
  });
  if (!pub) return { ok: false as const, erro: "Reels não encontrado." };
  const g = await guardaMarca(pub.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (pub.status === "postado") return { ok: false as const, erro: "Esse Reels já foi postado." };
  if (!pub.marca.igUserId || !pub.marca.accessToken) return { ok: false as const, erro: "A marca não está conectada ao Instagram." };
  const conn = { igUserId: pub.marca.igUserId, accessToken: pub.marca.accessToken };
  const st = await statusContainerReels(conn, containerId);
  if (st === "IN_PROGRESS" || st === "UNKNOWN") return { ok: true as const, pronto: false as const };
  if (st === "ERROR" || st === "EXPIRED") return { ok: false as const, erro: `A Meta não conseguiu processar o vídeo (${st}). Tente de novo.` };
  // FINISHED → trava (só um clique publica) e publica.
  const claim = await prisma.publicacao.updateMany({ where: { id: pubId, status: "a_postar" }, data: { status: "postado", postadoEm: new Date() } });
  if (claim.count === 0) return { ok: false as const, erro: "Esse Reels já foi postado." };
  const r = await publicarContainerReels(conn, containerId);
  if (!r.ok) {
    await prisma.publicacao.update({ where: { id: pubId }, data: { status: "a_postar", postadoEm: null } });
    return { ok: false as const, erro: r.erro };
  }
  await prisma.publicacao.update({ where: { id: pubId }, data: { mediaId: r.mediaId } });
  // Espelha no Facebook (best-effort) se a marca tiver Facebook conectado.
  let facebook: boolean | null = null;
  if (pub.videoUrl) {
    const { espelharVideoFacebook } = await import("@/lib/facebook");
    const fb = await espelharVideoFacebook(pub.marca, pub.videoUrl, pub.legenda || "").catch(() => undefined);
    if (fb) facebook = fb.ok;
  }
  revalidatePath(`/painel/marcas/${pub.marcaId}`);
  return { ok: true as const, pronto: true as const, permalink: r.permalink, facebook };
}

// Dispara o MOTOR DE VÍDEO pra gerar o Reels da festa (botão "⚡ Gerar vídeo"). Marca a festa
// como "gerando"; o motor monta em segundo plano e o /api/video-pronto salva a URL no fim.
// videoUrl = "" (sem vídeo) | "gerando" (em montagem) | URL http (pronto).
// Só o STATUS do vídeo da festa (leve): o seletor fica consultando enquanto o motor monta, pra
// mostrar "gerando…" e deixar o dono ASSISTIR sem sair da tela de edição quando ficar pronto.
export async function statusVideoFesta(festaId: string) {
  const f = await prisma.festa.findUnique({ where: { id: festaId }, select: { marcaId: true, videoUrl: true } });
  if (!f) return { ok: false as const };
  const g = await guardaMarca(f.marcaId);
  if (!g.ok) return { ok: false as const };
  return { ok: true as const, videoUrl: f.videoUrl };
}

export async function gerarVideoDaFesta(festaId: string) {
  const festa = await prisma.festa.findUnique({
    where: { id: festaId },
    select: { marcaId: true, videoFotos: true, videoCapa: true, videoMoldura: true, videoTextoFinal: true, videoTituloCapa: true, videoMusica: true, videoClipes: true, videoClipesPos: true, videoClipesDur: true, videoUrl: true, mascoteCanto: true, mascoteTam: true, aniversariante: true, aniversariantes: true, marca: { select: { logoUrl: true, slug: true, corPrimaria: true, mascoteUrl: true } }, fotos: { select: { id: true, url: true } } },
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

  // capa: a foto escolhida (videoCapa) — ou, sem escolha, a 1ª da sequência.
  const capaUrl = (festa.videoCapa && mapa.get(festa.videoCapa)) || fotos[0];
  // a foto da capa NÃO se repete no slideshow (ela já abre o vídeo como capa).
  const semCapa = fotos.filter((u) => u !== capaUrl);
  if (semCapa.length > 0) fotos = semCapa;

  // música: a que o dono enviou pra ESTA festa (videoMusica) tem prioridade; senão, a padrão do buffet.
  const musicaUrl = (festa.videoMusica?.startsWith("http") ? festa.videoMusica : musicaBuffet(festa.marca.slug)) || undefined;

  // A CAPA é desenhada por NÓS (/api/capa-festa): o título "Fulano fez X aninhos" QUEBRA LINHA e a
  // fonte encolhe, então nome comprido / dois aniversariantes ("Luisa e Maria Sofia fez 11 aninhos")
  // não estouram mais a tela. O motor recebe a capa PRONTA e não escreve texto por cima (textoCapa="").
  // A URL precisa ser PÚBLICA: rodando local o motor não alcança o localhost — usamos o mesmo host do
  // callback (produção, mesmo banco), igual o vídeo temático faz.
  let base = baseUrl();
  try {
    if (process.env.VIDEO_CALLBACK_URL) base = new URL(process.env.VIDEO_CALLBACK_URL).origin;
  } catch {} // env torta não pode derrubar a geração
  base = base.replace(/\/$/, "");
  // ?v= é a única chave de cache da capa: muda quando QUALQUER coisa desenhada muda (título
  // automático OU o escrito à mão, qual foto é a capa, a URL dela e a cor da marca).
  const versaoCapa = hashCurto([festa.aniversariantes, festa.aniversariante, festa.videoTituloCapa, festa.videoCapa, capaUrl, festa.marca.corPrimaria, festa.mascoteCanto, festa.mascoteTam, festa.marca.mascoteUrl].join("|"));
  const capaDesenhada = `${base}/api/capa-festa/${festaId}.jpg?v=${versaoCapa}`;

  // clipes de vídeo (opcional) — entram MUDOS, intercalados com as fotos.
  let clipes: string[] = [];
  try { clipes = (JSON.parse(festa.videoClipes || "[]") as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http")); } catch {}

  await prisma.festa.update({ where: { id: festaId }, data: { videoUrl: "gerando" } });
  const r = await dispararMotorReels({
    fotos,
    clipes,
    posicaoClipes: festa.videoClipesPos || "espalhados",
    duracaoClipes: festa.videoClipesDur || "completo",
    // vídeo da festa NÃO usa narração — a música é o som; se ela for curta, REPETE pra não cortar o vídeo.
    naoCortarVideo: true,
    capaUrl: capaDesenhada,
    moldura: festa.videoMoldura || "branca",
    corMoldura: festa.marca.corPrimaria || "#FFFFFF",
    logoUrl: festa.marca.logoUrl,
    musicaUrl,
    // A capa JÁ traz o título (a nossa, que quebra linha) — o motor NÃO escreve nada por cima.
    textoCapa: "",
    nomeArquivo: festa.marca.slug || "reels",
    // texto FINAL escolhido pelo dono (ou pela Bia). Vazio = motor usa o padrão "Muito obrigado!".
    ...(festa.videoTextoFinal?.trim() ? { tituloFinal: festa.videoTextoFinal.trim(), subFinal: "" } : {}),
    festaId,
    callbackUrl: process.env.VIDEO_CALLBACK_URL || `${baseUrl()}/api/video-pronto`,
    callbackToken: process.env.VIDEO_CALLBACK_SECRET || "",
  });
  if (!r.ok) {
    await prisma.festa.update({ where: { id: festaId }, data: { videoUrl: "" } });
    return { ok: false as const, erro: r.erro };
  }
  // Motor aceitou e vai montar um vídeo NOVO → apaga o ANTIGO do Blob (não acumula lixo a cada
  // "refazer"; o storage tem limite). Best-effort, em segundo plano: nunca derruba o "gerar".
  if (festa.videoUrl?.startsWith("http")) {
    const antigo = festa.videoUrl;
    import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
  }
  revalidatePath(`/painel/marcas/${festa.marcaId}`);
  return { ok: true as const };
}
