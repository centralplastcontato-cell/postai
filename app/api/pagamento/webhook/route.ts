import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buscarPagamento } from "@/lib/mercadopago";
import { ehPlano, ehPeriodo, mesesDoPeriodo, precoDoPedido } from "@/lib/plano";

export const dynamic = "force-dynamic";

// Webhook do Mercado Pago: chamado quando um pagamento muda de estado. Aqui está a regra de
// ouro de segurança: a notificação só traz um ID — a gente RE-BUSCA o pagamento no MP (fonte
// autoritativa) e só age se ele estiver "approved". Assim ninguém libera acesso forjando uma
// chamada falsa. Idempotente: registra o pagamento por `refExterna` (única); se já estava
// aprovado, não estende o acesso de novo.
export async function POST(req: NextRequest) {
  try {
    // O MP manda o id ora na query (?type=payment&data.id=…), ora no corpo. Cobrimos os dois.
    const url = new URL(req.url);
    let tipo = url.searchParams.get("type") || url.searchParams.get("topic") || "";
    let id = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
    if (!id) {
      try {
        const body = (await req.json()) as { type?: string; topic?: string; data?: { id?: string }; id?: string };
        tipo = tipo || body?.type || body?.topic || "";
        id = body?.data?.id || body?.id || "";
      } catch {
        /* corpo vazio/não-JSON — segue com o que veio na query */
      }
    }
    // Só tratamos notificação de PAGAMENTO (ignora merchant_order, etc.) — sempre 200 pro MP
    // não ficar reenviando o que a gente decidiu ignorar.
    if (tipo && tipo !== "payment") return new Response("ok", { status: 200 });
    if (!id) return new Response("sem id", { status: 200 });

    const pag = await buscarPagamento(String(id));
    if (!pag) return new Response("nao encontrado", { status: 200 });
    if (pag.status !== "approved") return new Response("nao aprovado", { status: 200 });

    const [usuarioId, plano, periodo] = (pag.externalReference || "").split(":");
    if (!usuarioId || !ehPlano(plano) || !ehPeriodo(periodo)) return new Response("ref invalida", { status: 200 });

    // Idempotência: se já registramos este pagamento como aprovado, não faz nada.
    const existente = await prisma.pagamento.findUnique({ where: { refExterna: String(id) } });
    if (existente && existente.status === "aprovado") return new Response("ok", { status: 200 });

    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!u) return new Response("usuario inexistente", { status: 200 });

    // Estende a partir do MAIOR entre hoje e a validade atual (não queima dias que sobraram).
    const meses = mesesDoPeriodo(periodo);
    const valor = precoDoPedido(plano, periodo);
    const agora = new Date();
    const base = u.acessoAte && u.acessoAte > agora ? new Date(u.acessoAte) : agora;
    const novoAcesso = new Date(base);
    novoAcesso.setMonth(novoAcesso.getMonth() + meses);

    await prisma.$transaction([
      prisma.pagamento.upsert({
        where: { refExterna: String(id) },
        create: { usuarioId, plano, periodo, meses, valor, refExterna: String(id), status: "aprovado", aprovadoEm: agora },
        update: { status: "aprovado", aprovadoEm: agora },
      }),
      prisma.usuario.update({ where: { id: usuarioId }, data: { plano, acessoAte: novoAcesso } }),
    ]);

    return new Response("ok", { status: 200 });
  } catch {
    // Erro inesperado: 500 faz o MP reenviar depois (a re-busca garante que não duplica).
    return new Response("erro", { status: 500 });
  }
}

// O MP às vezes faz um GET de verificação da URL.
export async function GET() {
  return new Response("ok", { status: 200 });
}
