"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  abrirSessao,
  fecharSessao,
  verificarSenha,
} from "@/lib/auth";

// Login: admin mestre (ADMIN_SENHA) ou usuário cadastrado.
export async function entrar(
  _prev: { erro?: string } | null,
  formData: FormData
): Promise<{ erro?: string } | null> {
  const nome = String(formData.get("nome") || "").trim().toLowerCase();
  const senha = String(formData.get("senha") || "");
  if (!nome || !senha) return { erro: "Preencha usuário e senha." };

  // Admin mestre: usuário "admin" + ADMIN_SENHA.
  const senhaMestre = process.env.ADMIN_SENHA;
  if (nome === "admin") {
    if (senhaMestre && senha === senhaMestre) {
      await abrirSessao("master");
      redirect("/painel");
    }
    return { erro: "Senha incorreta." };
  }

  // Usuários cadastrados no banco.
  const u = await prisma.usuario.findUnique({ where: { nome } });
  if (!u || !verificarSenha(senha, u.senhaHash)) {
    return { erro: "Usuário ou senha inválidos." };
  }
  await abrirSessao(u.id);
  redirect("/painel");
}

export async function sair() {
  await fecharSessao();
  redirect("/login");
}
