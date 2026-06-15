"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sessaoAtual } from "@/lib/auth";
import { exigirAdmin, guardaChamado } from "@/lib/acesso";

// Helpdesk — abrir/responder/fechar chamados de suporte. O cliente abre, o admin (Victor)
// responde dentro do painel. Tudo passa por guarda anti-IDOR (guardaChamado/exigirAdmin).

const lim = (v: FormDataEntryValue | null, n: number) => String(v || "").trim().slice(0, n);

// Abre um chamado novo (geralmente o cliente). A 1ª mensagem já entra junto.
export async function abrirChamado(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const s = await sessaoAtual();
  if (!s) return { ok: false, erro: "Faça login pra abrir um chamado." };

  const assunto = lim(formData.get("assunto"), 120);
  const texto = lim(formData.get("texto"), 4000);
  const marcaId = lim(formData.get("marcaId"), 60) || null;
  if (!assunto) return { ok: false, erro: "Escreva um assunto pro chamado." };
  if (!texto) return { ok: false, erro: "Escreva a sua mensagem." };

  try {
    const c = await prisma.chamado.create({
      data: {
        usuarioId: s.id,
        marcaId,
        assunto,
        // quem abre já "leu"; a novidade é pro OUTRO lado.
        naoLidoAdmin: !s.admin,
        naoLidoCliente: s.admin,
        mensagens: { create: { deAdmin: s.admin, texto } },
      },
    });
    revalidatePath("/painel/chamados");
    return { ok: true, id: c.id };
  } catch {
    return { ok: false, erro: "Não consegui abrir o chamado agora. Tente de novo em instantes." };
  }
}

// Adiciona uma resposta a um chamado existente (cliente OU admin).
export async function responderChamado(
  formData: FormData
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const id = lim(formData.get("id"), 60);
  const texto = lim(formData.get("texto"), 4000);
  const g = await guardaChamado(id);
  if (!g.ok) return { ok: false, erro: g.erro };
  if (!texto) return { ok: false, erro: "Escreva uma mensagem." };

  const ehAdmin = g.sessao.admin;
  try {
    await prisma.$transaction([
      prisma.chamadoMensagem.create({ data: { chamadoId: id, deAdmin: ehAdmin, texto } }),
      prisma.chamado.update({
        where: { id },
        data: ehAdmin
          ? { naoLidoCliente: true, naoLidoAdmin: false } // admin respondeu → novidade pro cliente
          : { naoLidoAdmin: true, naoLidoCliente: false, status: "aberto" }, // cliente escreveu → reabre + novidade pro admin
      }),
    ]);
    revalidatePath(`/painel/chamados/${id}`);
    revalidatePath("/painel/chamados");
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não consegui enviar agora. Tente de novo." };
  }
}

// Resolve ou reabre um chamado — só o admin.
export async function mudarStatusChamado(
  formData: FormData
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false, erro: g.erro };
  const id = lim(formData.get("id"), 60);
  const status = lim(formData.get("status"), 20);
  if (status !== "aberto" && status !== "resolvido") return { ok: false, erro: "Status inválido." };
  try {
    await prisma.chamado.update({ where: { id }, data: { status } });
    revalidatePath(`/painel/chamados/${id}`);
    revalidatePath("/painel/chamados");
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não consegui atualizar agora." };
  }
}
