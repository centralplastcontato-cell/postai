import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { PainelHeader } from "@/components/painel-header";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <PainelHeader nome={s.nome} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
