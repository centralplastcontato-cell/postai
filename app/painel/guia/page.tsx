import Link from "next/link";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PASSOS: { n: string; titulo: string; corpo: React.ReactNode }[] = [
  {
    n: "1",
    titulo: "Criar a marca do buffet",
    corpo: (
      <>
        Em <strong className="text-white">🏷️ Marcas → Nova marca</strong>, coloca o nome do buffet. Isso cria o espaço dele no Postaí.
      </>
    ),
  },
  {
    n: "2",
    titulo: "Configurar a cara da marca",
    corpo: (
      <>
        Abre a marca → <strong className="text-white">⚙️ Configurações</strong>. Sobe o <strong className="text-white">logo</strong> (e usa o botão de extrair as cores),
        preenche <strong className="text-white">site</strong> e <strong className="text-white">telefone/WhatsApp</strong> (aparecem nas artes), e define os <strong className="text-white">dias e horários</strong>
        (usa os botões ⭐ dos melhores horários).
      </>
    ),
  },
  {
    n: "3",
    titulo: "⭐ Conectar o Instagram do cliente (o passo técnico)",
    corpo: (
      <>
        É o passo mais chatinho — exige acesso ao <strong className="text-white">Gerenciador de Negócios (Business Manager)</strong> do cliente. Pré-requisito:
        a conta do Instagram dele precisa ser <strong className="text-white">Profissional (Business/Creator)</strong> e estar ligada a uma <strong className="text-white">Página do Facebook</strong>.
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>No Business Manager do cliente, use/crie um <strong className="text-white">Usuário do Sistema</strong> com acesso à Página + ao app.</li>
          <li>Gere um <strong className="text-white">token</strong> com as permissões: <code className="text-[11px] text-amber-300">instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts, business_management</code>.</li>
          <li>Pegue o <strong className="text-white">IG User ID</strong> da conta dele.</li>
          <li>No Postaí (Configurações → <strong className="text-white">Conexão com o Instagram</strong>), cola o IG User ID + token e clica <strong className="text-white">Testar e salvar</strong>.</li>
        </ul>
        <span className="mt-2 block text-[12px] text-muted">💡 Token de Usuário do Sistema costuma <strong className="text-white/80">não expirar</strong> — conexão pra sempre. (Foi assim que o Castelo ficou.)</span>
      </>
    ),
  },
  {
    n: "4",
    titulo: "Conectar o Facebook (opcional, recomendado)",
    corpo: (
      <>
        Na mesma tela, seção <strong className="text-white">Conexão com o Facebook</strong> → <strong className="text-white">Buscar páginas</strong> → escolhe a Página do buffet. Aí cada post sai no
        Instagram <strong className="text-white">e</strong> no Facebook ao mesmo tempo.
      </>
    ),
  },
  {
    n: "5",
    titulo: "Criar o login do cliente + pacote",
    corpo: (
      <>
        Em <strong className="text-white">👥 Clientes → Novo cliente</strong>: usuário, senha, <strong className="text-white">Pacote</strong> (Essencial/Profissional/Turbo) e <strong className="text-white">Acesso</strong>
        (1 mês, 3 meses…). <strong className="text-white">Anote a senha</strong> pra passar pro cliente.
      </>
    ),
  },
  {
    n: "6",
    titulo: "Atribuir a marca ao cliente",
    corpo: (
      <>
        Ainda em Clientes, na seção <strong className="text-white">🏷️ Dono de cada marca</strong>, define o buffet como <strong className="text-white">dono = aquele cliente</strong>. Aí ele entra
        e vê só a marca dele.
      </>
    ),
  },
  {
    n: "7",
    titulo: "Gerar os primeiros posts",
    corpo: (
      <>
        Abre a marca → <strong className="text-white">📱 Redes Sociais</strong>. Gera alguns carrosséis, feeds e stories (clica num dia no calendário e usa os temas prontos).
        Pode adiantar a semana/mês inteiro de uma vez.
      </>
    ),
  },
  {
    n: "8",
    titulo: "Ativar o piloto",
    corpo: (
      <>
        Em <strong className="text-white">⚙️ Configurações</strong>, confirma <strong className="text-white">✅ Piloto automático ativo</strong>. Pronto — o despertador (cron) já cobre essa marca de hora
        em hora e posta sozinho nos horários agendados.
      </>
    ),
  },
  {
    n: "9",
    titulo: "Entregar pro cliente",
    corpo: (
      <>
        Passa o <strong className="text-white">usuário e a senha</strong> pro cliente. Ele entra em <strong className="text-white">meupostai.com.br</strong> → vê só a marca dele, acompanha os posts e
        aprova. <strong className="text-white">Ele não vê a configuração nem o token</strong> (é só seu). ✅
      </>
    ),
  },
];

export default async function GuiaPage() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (!s.admin) redirect("/painel"); // guia é só pro admin

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-3xl text-white">📋 Colocar um cliente no ar</h1>
      <p className="mt-1 text-sm text-muted">Passo a passo pra ativar um buffet novo do zero — uns 10-15 min. Siga na ordem.</p>

      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        <strong className="text-white">Antes de começar:</strong> a conta de Instagram do cliente precisa ser <strong className="text-white">Profissional</strong> (Business/Creator)
        e estar ligada a uma <strong className="text-white">Página do Facebook</strong>. E você precisa de acesso ao <strong className="text-white">Gerenciador de Negócios</strong> dele (ele te adiciona como admin).
      </div>

      <ol className="mt-6 space-y-4">
        {PASSOS.map((p) => (
          <li key={p.n} className="flex gap-4 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
            <span className="display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-lg text-white">{p.n}</span>
            <div>
              <h3 className="text-base font-bold text-white">{p.titulo}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.corpo}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-xl border border-linha bg-preto-card p-4 text-sm text-muted">
        <strong className="text-white">Depois que estiver no ar:</strong> acompanhe pelo cartão <strong className="text-white">🛰️ Atividades do piloto</strong> (mostra o que postou ou
        se algo falhou) e pelo <strong className="text-white">📊 Resumo do negócio</strong> (em Clientes). E renove o acesso antes de vencer (o sistema avisa).
      </div>

      <div className="mt-6">
        <Link href="/painel/usuarios" className="rounded-lg bg-vermelho px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover">👥 Ir pra Clientes</Link>
      </div>
    </div>
  );
}
