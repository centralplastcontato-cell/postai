"use server";

import { sessaoAtual, abrirSessao, hashSenha } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/config";
import { ehPlano, ehPeriodo, rotuloPlano, precoDoPedido } from "@/lib/plano";
import { criarPagamento } from "@/lib/mercadopago";
import { liberarAcessoPorPagamento } from "@/lib/pagamentos";

// Cadastro self-service (na landing/checkout): cria a conta do cliente e já abre a sessão,
// pra o pagamento em seguida cair na conta certa. O e-mail é o login (campo `nome`). A
// conexão do Instagram continua sendo feita depois (concierge) — aqui só nasce o acesso.
export async function criarConta(input: { email: string; senha: string }) {
  const email = (input.email || "").trim().toLowerCase();
  const senha = input.senha || "";
  if (!email || !email.includes("@") || email.length < 5) return { ok: false as const, erro: "Informe um e-mail válido." };
  if (senha.length < 6) return { ok: false as const, erro: "A senha precisa ter ao menos 6 caracteres." };

  const existe = await prisma.usuario.findUnique({ where: { nome: email } });
  if (existe) return { ok: false as const, erro: "Já existe uma conta com esse e-mail. Faça login pra assinar." };

  const u = await prisma.usuario.create({ data: { nome: email, senhaHash: hashSenha(senha), admin: false } });
  await abrirSessao(u.id);
  return { ok: true as const };
}

// Processa o pagamento do checkout EMBUTIDO (Mercado Pago Bricks). Recebe o que o Brick
// montou (cartão tokenizado ou Pix) e cria o pagamento pela API. Cartão aprovado libera o
// acesso na hora; Pix volta com o QR (a confirmação cai no webhook). NUNCA confia em valor
// vindo do cliente — o preço é recalculado aqui a partir do plano+período.
export async function processarPagamento(input: { formData: unknown; plano: string; periodo: string }) {
  const s = await sessaoAtual();
  if (!s) return { ok: false as const, erro: "Crie sua conta ou faça login pra pagar." };
  if (s.admin) return { ok: false as const, erro: "O admin não assina. Use uma conta de cliente." };
  if (!ehPlano(input.plano) || !ehPeriodo(input.periodo)) return { ok: false as const, erro: "Plano ou período inválido." };

  const u = await prisma.usuario.findUnique({ where: { id: s.id }, select: { id: true } });
  if (!u) return { ok: false as const, erro: "Conta não encontrada." };

  const valor = precoDoPedido(input.plano, input.periodo);
  const descricao = `Postaí ${rotuloPlano(input.plano)} — ${input.periodo === "anual" ? "Plano anual (12 meses)" : "Plano mensal"}`;

  const r = await criarPagamento({
    valor,
    descricao,
    externalReference: `${s.id}:${input.plano}:${input.periodo}`,
    base: baseUrl(),
    formData: (input.formData || {}) as never,
  });
  if (!r.ok) return { ok: false as const, erro: r.erro };

  // Cartão aprovado na hora → libera já (idempotente; o webhook é a rede de segurança).
  let liberado = false;
  if (r.status === "approved") {
    liberado = await liberarAcessoPorPagamento({ refExterna: r.id, usuarioId: s.id, plano: input.plano, periodo: input.periodo });
  }
  return { ok: true as const, status: r.status, statusDetail: r.statusDetail, liberado, pix: r.pix };
}
