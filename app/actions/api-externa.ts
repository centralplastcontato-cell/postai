"use server";

import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/acesso";
import { gerarChave, apagarMidiasDoRegistro } from "@/lib/api-externa";
import { registrarAtividade } from "@/lib/atividade";
import { revalidatePath } from "next/cache";

// Painel da API de automação externa (cartão "🔌 Automação"). Só o admin mexe por enquanto.

// Gera uma chave NOVA pra marca (a anterior para de funcionar na hora). A chave em si só
// aparece AGORA, nesta resposta — no banco fica só o hash.
export async function gerarChaveApi(marcaId: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const { chave, hash, prefixo } = gerarChave();
  try {
    await prisma.marca.update({ where: { id: marcaId }, data: { apiChaveHash: hash, apiChavePrefixo: prefixo, apiChaveEm: new Date() } });
  } catch {
    return { ok: false as const, erro: "Não consegui salvar a chave. Tente de novo." };
  }
  await registrarAtividade("Painel", "Gerou uma nova chave da API de automação (a anterior foi revogada).", marcaId).catch(() => {});
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, chave, prefixo };
}

export async function revogarChaveApi(marcaId: string) {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  try {
    await prisma.marca.update({ where: { id: marcaId }, data: { apiChaveHash: null, apiChavePrefixo: "", apiChaveEm: null } });
  } catch {
    return { ok: false as const, erro: "Não consegui revogar. Tente de novo." };
  }
  await registrarAtividade("Painel", "Revogou a chave da API de automação.", marcaId).catch(() => {});
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const };
}

// ✓ Aprovar: o post sai de "aguardando_aprovacao" e entra na fila do piloto. Se o horário já
// passou, ele sai na próxima passada do piloto (até ~10 min).
export async function aprovarPostApi(id: string, tipo: "carrossel" | "publicacao") {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const onde = { id, status: "aguardando_aprovacao" };
  const dados = { status: "a_postar", aprovado: true };
  const r = tipo === "carrossel" ? await prisma.conteudo.updateMany({ where: onde, data: dados }) : await prisma.publicacao.updateMany({ where: onde, data: dados });
  if (r.count === 0) return { ok: false as const, erro: "Esse post não está mais aguardando aprovação." };
  const reg = tipo === "carrossel" ? await prisma.conteudo.findUnique({ where: { id }, select: { marcaId: true } }) : await prisma.publicacao.findUnique({ where: { id }, select: { marcaId: true } });
  if (reg) revalidatePath(`/painel/marcas/${reg.marcaId}`);
  return { ok: true as const };
}

// ✕ Recusar: apaga o post e as mídias que a API copiou (a automação vê 404 no GET).
export async function recusarPostApi(id: string, tipo: "carrossel" | "publicacao") {
  const g = await exigirAdmin();
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const onde = { id, origem: "api", status: "aguardando_aprovacao" };
  if (tipo === "carrossel") {
    const c = await prisma.conteudo.findFirst({ where: onde });
    if (!c) return { ok: false as const, erro: "Esse post não está mais aguardando aprovação." };
    const r = await prisma.conteudo.deleteMany({ where: onde });
    if (r.count) await apagarMidiasDoRegistro({ tipo: "carrossel", c });
    revalidatePath(`/painel/marcas/${c.marcaId}`);
  } else {
    const p = await prisma.publicacao.findFirst({ where: onde });
    if (!p) return { ok: false as const, erro: "Esse post não está mais aguardando aprovação." };
    const r = await prisma.publicacao.deleteMany({ where: onde });
    if (r.count) await apagarMidiasDoRegistro({ tipo: "publicacao", p });
    revalidatePath(`/painel/marcas/${p.marcaId}`);
  }
  return { ok: true as const };
}
