"use server";

import { sessaoAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/config";
import { ehPlano, ehPeriodo, rotuloPlano, precoDoPedido } from "@/lib/plano";
import { criarPreferencia } from "@/lib/mercadopago";

// Cria o checkout do plano escolhido e devolve a URL do Mercado Pago (o cliente é levado pra
// lá pra pagar com Pix ou cartão). NADA é liberado aqui — o acesso só estende quando o MP
// confirmar o pagamento, lá no webhook (/api/pagamento/webhook).
export async function criarCheckout(plano: string, periodo: string) {
  const s = await sessaoAtual();
  if (!s) return { ok: false as const, erro: "Faça login pra assinar." };
  // O admin (você) não assina — use uma conta de cliente pra testar o checkout de ponta a ponta.
  if (s.admin) return { ok: false as const, erro: "O admin não assina. Pra testar o checkout, entre com uma conta de cliente." };
  if (!ehPlano(plano) || !ehPeriodo(periodo)) return { ok: false as const, erro: "Plano ou período inválido." };

  // Confirma que é um usuário real (é o acesso dele que vai ser estendido na aprovação).
  const u = await prisma.usuario.findUnique({ where: { id: s.id }, select: { id: true } });
  if (!u) return { ok: false as const, erro: "Conta não encontrada." };

  const valor = precoDoPedido(plano, periodo);
  const titulo = `Postaí ${rotuloPlano(plano)} — ${periodo === "anual" ? "Plano anual (12 meses)" : "Plano mensal"}`;

  const r = await criarPreferencia({
    titulo,
    valor,
    // O webhook lê isto pra saber QUEM liberar, QUAL plano e por QUANTOS meses.
    externalReference: `${s.id}:${plano}:${periodo}`,
    base: baseUrl(),
  });
  if (!r.ok) return { ok: false as const, erro: r.erro };
  return { ok: true as const, url: r.url };
}
