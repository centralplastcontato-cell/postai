"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { marcaPorTokenFotos, festaPorToken, gerarTokenFesta } from "@/lib/festa";
import { parseAniversariantes, nomesAniversariantes } from "@/lib/aniversariantes";
import { normalizarMomento, categoriaDoMomento, LIMITE_FOTOS_MOMENTO, LIMITE_FOTOS_FESTA } from "@/lib/momentos-festa";
import { descreverImagem } from "@/lib/imagem-ia";

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
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string },
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
  input: { dataISO: string; aniversariantes: { nome: string; idade: number | null }[]; tema?: string },
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
      data,
      aniversariante: nomesAniversariantes(lista), // label de exibição derivado
      aniversariantes: JSON.stringify(lista),
      tema: (input.tema || "").trim().slice(0, 80),
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

// O gerente marca a festa como FINALIZADA (terminou de subir) — ou REABRE pra adicionar mais.
// Pelo LINK DA FESTA (validado por festaToken). Sinaliza ao dono que está completa.
export async function finalizarFestaPublica(festaToken: string, finalizar: boolean) {
  const f = await festaPorToken(festaToken);
  if (!f) return { ok: false as const, erro: "Link inválido ou desativado." };
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
