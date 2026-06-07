import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { PainelSidebar } from "@/components/painel-sidebar";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await sessaoAtual();
  if (!s) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <PainelSidebar nome={s.nome} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
