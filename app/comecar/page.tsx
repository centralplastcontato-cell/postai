import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { ComecarTeste } from "@/components/comecar-teste";

export const dynamic = "force-dynamic";

// Porta de entrada do TESTE GRÁTIS (vinda da landing). Quem já está logado vai direto pro
// painel; o visitante novo cria a conta aqui e cai na degustação.
export default async function ComecarPage() {
  const s = await sessaoAtual();
  if (s) redirect("/painel");
  return <ComecarTeste />;
}
