import { prisma } from "@/lib/prisma";
import { sessaoAtual, type Sessao } from "@/lib/auth";
import { acessoExpirado } from "@/lib/plano";

// Camada de AUTORIZAÇÃO multi-tenant. Login (estaLogado) só diz "tem sessão"; aqui
// dizemos "ESSA sessão pode mexer NESSA marca?". Regra: admin pode tudo; cliente só
// nas marcas que são dele (Marca.usuarioId === sessao.id). Toda server action que
// toca dado de marca passa por uma destas guardas — assim um cliente nunca acessa a
// marca de outro, mesmo chamando a action direto com um id alheio (anti-IDOR).

export type Guarda = { ok: true; sessao: Sessao } | { ok: false; erro: string };

const NEGADO: { ok: false; erro: string } = { ok: false, erro: "Sem permissão." };
const VENCIDO: { ok: false; erro: string } = { ok: false, erro: "Seu acesso expirou. Fale com o suporte pra reativar." };

// O dono pode? (admin sempre; cliente só se for o dono da marca)
function pode(s: Sessao, donoId: string | null): boolean {
  return s.admin || (donoId !== null && donoId === s.id);
}

// Filtro Prisma das marcas que a sessão pode VER (admin = todas; cliente = só as dele).
export function filtroMarcaVisivel(s: Sessao): { usuarioId?: string } {
  return s.admin ? {} : { usuarioId: s.id };
}

// Exige sessão de ADMIN (criar/excluir marca, gerir clientes).
export async function exigirAdmin(): Promise<Guarda> {
  const s = await sessaoAtual();
  if (!s) return NEGADO;
  if (!s.admin) return NEGADO;
  return { ok: true, sessao: s };
}

// Guarda por marcaId direto.
export async function guardaMarca(marcaId: string): Promise<Guarda> {
  const s = await sessaoAtual();
  if (!s) return NEGADO;
  if (acessoExpirado(s)) return VENCIDO;
  if (!marcaId) return { ok: false, erro: "Marca não informada." };
  try {
    const m = await prisma.marca.findUnique({ where: { id: marcaId }, select: { usuarioId: true } });
    if (!m) return { ok: false, erro: "Marca não encontrada." };
    if (!pode(s, m.usuarioId)) return NEGADO;
    return { ok: true, sessao: s };
  } catch {
    return { ok: false, erro: "O banco demorou a responder. Tente de novo em instantes." };
  }
}

// Guarda por Conteúdo (carrossel) — resolve a marca pelo conteúdo.
export async function guardaConteudo(id: string): Promise<Guarda> {
  const s = await sessaoAtual();
  if (!s) return NEGADO;
  if (acessoExpirado(s)) return VENCIDO;
  if (!id) return { ok: false, erro: "Conteúdo não informado." };
  try {
    const c = await prisma.conteudo.findUnique({ where: { id }, select: { marca: { select: { usuarioId: true } } } });
    if (!c) return { ok: false, erro: "Conteúdo não encontrado." };
    if (!pode(s, c.marca.usuarioId)) return NEGADO;
    return { ok: true, sessao: s };
  } catch {
    return { ok: false, erro: "O banco demorou a responder. Tente de novo em instantes." };
  }
}

// Guarda por Publicação (feed) — resolve a marca pela publicação.
export async function guardaPublicacao(id: string): Promise<Guarda> {
  const s = await sessaoAtual();
  if (!s) return NEGADO;
  if (acessoExpirado(s)) return VENCIDO;
  if (!id) return { ok: false, erro: "Publicação não informada." };
  try {
    const p = await prisma.publicacao.findUnique({ where: { id }, select: { marca: { select: { usuarioId: true } } } });
    if (!p) return { ok: false, erro: "Publicação não encontrada." };
    if (!pode(s, p.marca.usuarioId)) return NEGADO;
    return { ok: true, sessao: s };
  } catch {
    return { ok: false, erro: "O banco demorou a responder. Tente de novo em instantes." };
  }
}

// Guarda por ImagemMarca — resolve a marca pela imagem.
export async function guardaImagem(id: string): Promise<Guarda> {
  const s = await sessaoAtual();
  if (!s) return NEGADO;
  if (acessoExpirado(s)) return VENCIDO;
  if (!id) return { ok: false, erro: "Imagem não informada." };
  try {
    const img = await prisma.imagemMarca.findUnique({ where: { id }, select: { marca: { select: { usuarioId: true } } } });
    if (!img) return { ok: false, erro: "Imagem não encontrada." };
    if (!pode(s, img.marca.usuarioId)) return NEGADO;
    return { ok: true, sessao: s };
  } catch {
    return { ok: false, erro: "O banco demorou a responder. Tente de novo em instantes." };
  }
}
