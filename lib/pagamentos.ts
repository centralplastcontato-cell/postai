import { prisma } from "@/lib/prisma";
import { ehPlano, ehPeriodo, mesesDoPeriodo, precoDoPedido } from "@/lib/plano";

// Aplica um pagamento APROVADO: registra (idempotente por refExterna) e estende o acesso do
// cliente pelos meses do pedido. É o ponto ÚNICO de liberação — usado tanto pelo webhook
// (Pix que cai depois, ou confirmação assíncrona) quanto pelo processamento embutido do
// cartão (aprovado na hora). A idempotência (Pagamento.refExterna @unique) garante que, se
// os dois caminhos rodarem pro mesmo pagamento, o acesso não é estendido duas vezes.
export async function liberarAcessoPorPagamento(opts: {
  refExterna: string; // id do pagamento no Mercado Pago
  usuarioId: string;
  plano: string;
  periodo: string;
}): Promise<boolean> {
  const { refExterna, usuarioId, plano, periodo } = opts;
  if (!ehPlano(plano) || !ehPeriodo(periodo)) return false;

  const existente = await prisma.pagamento.findUnique({ where: { refExterna } });
  if (existente && existente.status === "aprovado") return true; // já liberado — idempotente

  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u) return false;

  const meses = mesesDoPeriodo(periodo);
  const valor = precoDoPedido(plano, periodo);
  const agora = new Date();
  // Soma a partir do MAIOR entre hoje e a validade atual (não queima dias que sobraram).
  const base = u.acessoAte && u.acessoAte > agora ? new Date(u.acessoAte) : agora;
  const novoAcesso = new Date(base);
  novoAcesso.setMonth(novoAcesso.getMonth() + meses);

  await prisma.$transaction([
    prisma.pagamento.upsert({
      where: { refExterna },
      create: { usuarioId, plano, periodo, meses, valor, refExterna, status: "aprovado", aprovadoEm: agora },
      update: { status: "aprovado", aprovadoEm: agora },
    }),
    prisma.usuario.update({ where: { id: usuarioId }, data: { plano, acessoAte: novoAcesso } }),
  ]);
  return true;
}
