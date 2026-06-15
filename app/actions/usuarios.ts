"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/acesso";
import { hashSenha } from "@/lib/auth";
import { ehPlano } from "@/lib/plano";

// Gestão de CLIENTES (logins) — tudo aqui é só pro admin (você). Um cliente nunca
// cria/exclui outro cliente nem reatribui marcas.

// Soma N meses a uma data (mantém o dia; pula meses curtos sem estourar).
function addMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// Cria um login de cliente (admin=false) — opcionalmente já com pacote + validade.
export async function criarCliente(nome: string, senha: string, plano?: string, meses?: number) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const n = (nome || "").trim().toLowerCase();
  if (!n || (senha || "").length < 4) return { ok: false as const, erro: "Informe usuário e senha (mínimo 4 caracteres)." };
  if (n === "admin") return { ok: false as const, erro: "Esse nome é reservado." };
  if (await prisma.usuario.findUnique({ where: { nome: n } })) {
    return { ok: false as const, erro: "Já existe um cliente com esse usuário." };
  }
  await prisma.usuario.create({
    data: {
      nome: n,
      senhaHash: hashSenha(senha),
      admin: false,
      plano: ehPlano(plano) ? plano : null,
      acessoAte: typeof meses === "number" && meses > 0 ? addMeses(new Date(), meses) : null,
    },
  });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Define o pacote do cliente (essencial|profissional|turbo, ou vazio pra limpar).
export async function definirPacote(id: string, plano: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.usuario.update({ where: { id }, data: { plano: ehPlano(plano) ? plano : null } });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Renova/estende o acesso em N meses. Se ainda está válido, soma a partir do vencimento
// atual (não perde dias); se vencido/sem data, conta a partir de HOJE.
export async function renovarAcesso(id: string, meses: number) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const u = await prisma.usuario.findUnique({ where: { id }, select: { acessoAte: true } });
  if (!u) return { ok: false as const, erro: "Cliente não encontrado." };
  const base = u.acessoAte && u.acessoAte.getTime() > Date.now() ? u.acessoAte : new Date();
  await prisma.usuario.update({ where: { id }, data: { acessoAte: addMeses(base, Math.max(1, meses)) } });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Remove a validade — acesso aberto (sem expiração). Use pra liberar geral.
export async function removerValidade(id: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  await prisma.usuario.update({ where: { id }, data: { acessoAte: null } });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Exclui um cliente. As marcas dele ficam SEM dono (SetNull) — voltam a aparecer só
// pra você (admin). Não apaga nenhuma marca nem conteúdo.
export async function excluirCliente(id: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const u = await prisma.usuario.findUnique({ where: { id }, select: { admin: true } });
  if (!u) return { ok: false as const, erro: "Cliente não encontrado." };
  if (u.admin) return { ok: false as const, erro: "Não dá pra excluir um admin por aqui." };
  await prisma.usuario.delete({ where: { id } });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Redefine a senha de um cliente.
export async function redefinirSenhaCliente(id: string, senha: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!id || (senha || "").length < 4) return { ok: false as const, erro: "Senha de no mínimo 4 caracteres." };
  await prisma.usuario.update({ where: { id }, data: { senhaHash: hashSenha(senha) } });
  revalidatePath("/painel/usuarios");
  return { ok: true as const };
}

// Atribui (ou tira) o dono de uma marca. usuarioId vazio = sem dono (só admin vê).
export async function atribuirMarca(marcaId: string, usuarioId: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!marcaId) return { ok: false as const, erro: "Marca não informada." };
  if (usuarioId) {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
    if (!u) return { ok: false as const, erro: "Cliente não encontrado." };
  }
  await prisma.marca.update({ where: { id: marcaId }, data: { usuarioId: usuarioId || null } });
  revalidatePath("/painel/usuarios");
  revalidatePath("/painel");
  return { ok: true as const };
}
