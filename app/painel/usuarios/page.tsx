import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClientesAdmin } from "@/components/clientes-admin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (!s.admin) redirect("/painel"); // cliente não acessa a gestão de clientes

  const usuarios = await prisma.usuario.findMany({
    where: { admin: false },
    orderBy: { criadoEm: "asc" },
    select: { id: true, nome: true, marcas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } } },
  });
  const marcas = await prisma.marca.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, usuarioId: true },
  });

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <ClientesAdmin usuarios={usuarios} marcas={marcas} />
    </div>
  );
}
