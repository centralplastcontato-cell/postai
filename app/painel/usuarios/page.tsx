import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClientesAdmin } from "@/components/clientes-admin";
import { ehPlano, acessoExpirado, precoPlano } from "@/lib/plano";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (!s.admin) redirect("/painel"); // cliente não acessa a gestão de clientes

  const usuariosRaw = await prisma.usuario.findMany({
    where: { admin: false },
    orderBy: { criadoEm: "asc" },
    select: { id: true, nome: true, plano: true, acessoAte: true, valorMensal: true, marcas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } } },
  });
  const usuarios = usuariosRaw.map((u) => ({ ...u, acessoAte: u.acessoAte ? u.acessoAte.toISOString() : null }));
  const marcas = await prisma.marca.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, usuarioId: true },
  });

  // Métricas de negócio (só admin): total de clientes, ativos (pagantes), receita mensal
  // (MRR) e distribuição de pacotes. "Ativo" = tem pacote definido E acesso não vencido.
  // Receita REAL: usa o valorMensal de cada cliente (o que de fato se cobra); cai no preço do
  // pacote só se o valor não foi definido.
  const ativos = usuarios.filter((u) => ehPlano(u.plano) && !acessoExpirado({ admin: false, acessoAte: u.acessoAte }));
  const porPacote = { essencial: 0, profissional: 0, turbo: 0 };
  for (const u of ativos) if (ehPlano(u.plano)) porPacote[u.plano]++;
  const resumo = {
    total: usuarios.length,
    ativos: ativos.length,
    mrr: ativos.reduce((s, u) => s + (u.valorMensal ?? precoPlano(u.plano)), 0),
    porPacote,
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <ClientesAdmin usuarios={usuarios} marcas={marcas} resumo={resumo} />
    </div>
  );
}
