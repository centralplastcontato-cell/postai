"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function slugUnico(base: string): Promise<string> {
  const raiz = slugify(base) || "marca";
  let slug = raiz;
  let i = 2;
  while (await prisma.marca.findUnique({ where: { slug } })) {
    slug = `${raiz}-${i++}`;
  }
  return slug;
}

// Cria uma marca nova (mínimo: nome). Redireciona pra tela dela.
export async function criarMarca(formData: FormData) {
  if (!(await estaLogado())) return;
  const nome = String(formData.get("nome") || "").trim();
  if (!nome) return;
  const slug = await slugUnico(nome);
  const m = await prisma.marca.create({
    data: { nome, slug, logoTexto: nome.toUpperCase() },
  });
  revalidatePath("/painel");
  redirect(`/painel/marcas/${m.id}`);
}

type DadosMarca = {
  id: string;
  nome?: string;
  corPrimaria?: string;
  corFundo?: string;
  logoTexto?: string;
  site?: string;
  telefone?: string;
  igUserId?: string;
  accessToken?: string;
  diasCarrossel?: string;
  diasFeed?: string;
  horaPost?: number;
  descricao?: string;
  ativa?: boolean;
};

export async function salvarMarca(input: DadosMarca) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const { id, ...resto } = input;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resto)) {
    if (v !== undefined) data[k] = v;
  }
  await prisma.marca.update({ where: { id }, data });
  revalidatePath(`/painel/marcas/${id}`);
  revalidatePath("/painel");
  return { ok: true as const };
}

export async function excluirMarca(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  await prisma.marca.delete({ where: { id } });
  revalidatePath("/painel");
  return { ok: true as const };
}

// Testa a conexão com o Instagram da marca (lê o @ e valida o token na Meta).
export async function testarConexao(input: { igUserId: string; accessToken: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const { igUserId, accessToken } = input;
  if (!igUserId || !accessToken) {
    return { ok: false as const, erro: "Preencha o IG User ID e o token primeiro." };
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      { cache: "no-store" }
    );
    const j = (await r.json()) as {
      username?: string;
      name?: string;
      error?: { message?: string };
    };
    if (j.error?.message) return { ok: false as const, erro: j.error.message };
    if (!j.username) return { ok: false as const, erro: "Não consegui ler a conta. Confira os dados." };
    return { ok: true as const, username: j.username, nome: j.name ?? "" };
  } catch (e) {
    return {
      ok: false as const,
      erro: e instanceof Error ? e.message : "Falha ao falar com a Meta.",
    };
  }
}
