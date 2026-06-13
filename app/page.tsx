import Link from "next/link";
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_NAME} — sua marca postando sozinha no Instagram e Facebook`,
  description:
    "O Postaí cria carrosséis e posts com inteligência artificial no tom da sua marca e publica sozinho no Instagram e no Facebook, nos dias e horários que você escolher.",
};

// Contato de vendas (modo concierge). Troque por um link de WhatsApp quando quiser:
// const CONTATO = "https://wa.me/55SEUNUMERO";
const CONTATO = "mailto:centralplast.contato@gmail.com?subject=Quero%20o%20Postai%20na%20minha%20empresa";

const PASSOS: { n: string; titulo: string; texto: string }[] = [
  {
    n: "1",
    titulo: "Conecte sua marca",
    texto: "Cores, logo, jeito de falar e as contas do Instagram e Facebook. Você faz isso uma vez só.",
  },
  {
    n: "2",
    titulo: "A IA cria as artes",
    texto: "Carrosséis e posts prontos no seu estilo: promoções, preços, depoimentos, datas comemorativas e muito mais.",
  },
  {
    n: "3",
    titulo: "Posta sozinho",
    texto: "Você aprova ou deixa no automático. O Postaí publica nos dias e horas certos. Todo dia no ar.",
  },
];

const RECURSOS: { emoji: string; titulo: string; texto: string }[] = [
  { emoji: "🤖", titulo: "Arte com IA no seu tom", texto: "Títulos, legendas e imagens gerados no estilo da sua marca — não fica com cara de robô." },
  { emoji: "🗓️", titulo: "Piloto automático", texto: "Escolha os dias e horários. O Postaí posta sozinho, mesmo enquanto você dorme." },
  { emoji: "📱", titulo: "Instagram + Facebook", texto: "Um post só, publicado nas duas redes ao mesmo tempo, sem retrabalho." },
  { emoji: "🎨", titulo: "Vários modelos de arte", texto: "Promoção, preço, depoimento, data comemorativa, divulgação, dica, mosaico e capas especiais." },
  { emoji: "🏢", titulo: "Várias marcas num lugar", texto: "Gerencie quantos negócios quiser no mesmo painel — ideal para quem cuida de clientes." },
  { emoji: "✅", titulo: "Você no controle", texto: "Aprove, edite o texto, troque a foto ou a capa antes de publicar. Sem surpresa." },
];

const TEMPLATES: { emoji: string; nome: string }[] = [
  { emoji: "🎉", nome: "Promoção" },
  { emoji: "💰", nome: "Preço e Pacote" },
  { emoji: "⭐", nome: "Depoimento" },
  { emoji: "🎄", nome: "Data comemorativa" },
  { emoji: "🏆", nome: "Divulgação" },
  { emoji: "💡", nome: "Dica" },
  { emoji: "🖼️", nome: "Mosaico de fotos" },
  { emoji: "🪟", nome: "Capas especiais" },
];

const PLANOS: { nome: string; posts: string; destaque?: boolean; itens: string[] }[] = [
  {
    nome: "Essencial",
    posts: "1 post por dia",
    itens: ["Sua página sempre ativa", "Carrosséis e posts com IA", "Instagram + Facebook", "Piloto automático"],
  },
  {
    nome: "Profissional",
    posts: "2 posts por dia",
    destaque: true,
    itens: ["Presença forte e constante", "Todos os modelos de arte", "Horários diferentes no mesmo dia", "Aprovação e edição fácil"],
  },
  {
    nome: "Turbo",
    posts: "3 posts por dia",
    itens: ["Máximo de alcance e ofertas", "Mais conteúdo, mais venda", "Várias marcas no painel", "Suporte prioritário"],
  },
];

const FAQ: { p: string; r: string }[] = [
  { p: "Preciso saber design ou postar na mão?", r: "Não. O Postaí cria as artes e posta por você. Você só acompanha." },
  { p: "Funciona no Instagram e no Facebook?", r: "Sim, nas duas redes ao mesmo tempo — um post vira presença nos dois lugares." },
  { p: "Posso revisar antes de publicar?", r: "Pode. Aprove, edite o texto, troque a foto, ou deixe tudo no automático." },
  { p: "Atende mais de uma empresa?", r: "Sim. Você gerencia várias marcas no mesmo painel, cada uma no seu tom." },
  { p: "Como eu começo?", r: "Clique em Acessar o painel para entrar, ou fale com a gente que te colocamos no ar." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-preto text-white">
      {/* ===== NAV ===== */}
      <header className="sticky top-0 z-40 border-b border-linha/70 bg-preto/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <span className="display text-2xl tracking-tight">
            {APP_NAME}
            <span className="text-vermelho">.</span>
          </span>
          <div className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
            <a href="#recursos" className="transition hover:text-white">Recursos</a>
            <a href="#planos" className="transition hover:text-white">Planos</a>
          </div>
          <Link href="/login" className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
            Entrar
          </Link>
        </nav>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        {/* brilhos de fundo */}
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#7c3aed]/25 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute right-[-120px] top-40 h-[360px] w-[360px] rounded-full bg-[#ec4899]/20 blur-[110px]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1 text-xs font-semibold text-[#c7b2ff]">
              ✨ Piloto automático de Instagram + Facebook
            </span>
            <h1 className="display mt-5 text-4xl leading-[1.04] sm:text-5xl md:text-6xl">
              Sua marca postando<br />
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#ec4899] bg-clip-text text-transparent">todo dia</span>. Sem você<br />
              levantar um dedo.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              O {APP_NAME} cria os carrosséis e posts com inteligência artificial no tom da sua marca
              e publica sozinho no Instagram e no Facebook — nos dias e horários que você escolher.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="rounded-xl bg-vermelho px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition hover:bg-vermelho-hover">
                Acessar o painel →
              </Link>
              <a href="#como-funciona" className="rounded-xl border border-linha px-6 py-3.5 text-base font-semibold text-white transition hover:border-vermelho">
                Ver como funciona
              </a>
            </div>
            <p className="mt-5 text-sm text-muted">
              Feito para buffets, lojas e negócios locais que querem aparecer todos os dias.
            </p>
          </div>

          {/* MOCK de post (puro CSS, sem imagem) */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[#7c3aed]/30 to-[#ec4899]/30 blur-2xl" />
            <div className="relative rounded-[1.6rem] border border-linha bg-preto-card p-3 shadow-2xl">
              <div className="flex items-center gap-2 px-1 pb-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#ec4899]" />
                <div>
                  <div className="h-2.5 w-24 rounded-full bg-white/80" />
                  <div className="mt-1 h-2 w-16 rounded-full bg-white/25" />
                </div>
                <span className="ml-auto text-lg">⋯</span>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br from-[#7c3aed] via-[#9333ea] to-[#ec4899]">
                <div className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#7c3aed]">ATÉ 30/6</div>
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <p className="display text-3xl text-white drop-shadow">PACOTE IMPERDÍVEL</p>
                  <div className="mt-3 rounded-2xl bg-white/95 px-6 py-3 shadow-lg">
                    <p className="text-[10px] font-bold tracking-wide text-[#7c3aed]">A PARTIR DE</p>
                    <p className="display text-4xl text-[#111827]">R$ 5.990</p>
                  </div>
                  <div className="mt-3 rounded-full bg-[#22c55e] px-4 py-1.5 text-xs font-bold text-white">📲 chamar no WhatsApp</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-1 pt-3 text-lg">
                <span>❤️</span><span>💬</span><span>📤</span>
                <span className="ml-auto rounded-full bg-vermelho px-2.5 py-1 text-[10px] font-bold text-white">postado pelo {APP_NAME}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== DOR -> SOLUÇÃO ===== */}
      <section className="border-y border-linha bg-preto-card/40">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center">
          <p className="text-lg leading-relaxed text-muted sm:text-xl">
            Postar todo dia cansa. Falta tempo, falta ideia, falta arte. Aí a página fica parada
            e o cliente esquece de você.{" "}
            <span className="font-semibold text-white">O {APP_NAME} cuida disso no automático</span> — para sua marca nunca mais sumir do feed.
          </p>
        </div>
      </section>

      {/* ===== COMO FUNCIONA ===== */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Como funciona</p>
          <h2 className="display mt-2 text-3xl sm:text-4xl">Três passos e pronto</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Configura uma vez e a sua marca passa a aparecer todos os dias, sozinha.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PASSOS.map((p) => (
            <div key={p.n} className="relative rounded-2xl border border-linha bg-preto-card p-7">
              <span className="display absolute -top-5 left-7 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-xl text-white shadow-lg">{p.n}</span>
              <h3 className="mt-4 text-lg font-bold text-white">{p.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== RECURSOS ===== */}
      <section id="recursos" className="border-y border-linha bg-preto-card/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Recursos</p>
            <h2 className="display mt-2 text-3xl sm:text-4xl">Tudo para postar sem esforço</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((r) => (
              <div key={r.titulo} className="rounded-2xl border border-linha bg-preto-card p-6 transition hover:border-vermelho">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7c3aed]/15 text-2xl">{r.emoji}</div>
                <h3 className="mt-4 text-base font-bold text-white">{r.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TEMPLATES ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Modelos de arte</p>
          <h2 className="display mt-2 text-3xl sm:text-4xl">Um modelo para cada momento</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">A IA monta a arte certa para promoção, preço, depoimento, data comemorativa e muito mais.</p>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {TEMPLATES.map((t) => (
            <span key={t.nome} className="inline-flex items-center gap-2 rounded-full border border-linha bg-preto-card px-5 py-2.5 text-sm font-semibold text-white transition hover:border-vermelho">
              <span className="text-lg">{t.emoji}</span> {t.nome}
            </span>
          ))}
        </div>
      </section>

      {/* ===== PILOTO AUTOMÁTICO (destaque) ===== */}
      <section className="relative overflow-hidden border-y border-linha">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#7c3aed]/15 via-transparent to-[#ec4899]/15" />
        <div className="relative mx-auto max-w-5xl px-5 py-20 text-center">
          <span className="text-5xl">🗓️</span>
          <h2 className="display mt-4 text-3xl sm:text-5xl">
            Configure uma vez.<br />
            <span className="bg-gradient-to-r from-[#a78bfa] to-[#ec4899] bg-clip-text text-transparent">Apareça todos os dias.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Escolha os dias e horários — até vários posts no mesmo dia. O {APP_NAME} publica sozinho na hora certa,
            no Instagram e no Facebook. Você cuida do seu negócio; a sua presença online roda no automático.
          </p>
          <Link href="/login" className="mt-8 inline-block rounded-xl bg-vermelho px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition hover:bg-vermelho-hover">
            Quero no automático →
          </Link>
        </div>
      </section>

      {/* ===== PLANOS ===== */}
      <section id="planos" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Planos</p>
          <h2 className="display mt-2 text-3xl sm:text-4xl">Escolha o ritmo da sua marca</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Quanto mais posts por dia, mais a sua marca aparece e vende. Valor mensal por marca.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLANOS.map((pl) => (
            <div
              key={pl.nome}
              className={`relative flex flex-col rounded-2xl border p-7 ${pl.destaque ? "border-vermelho bg-preto-card ring-2 ring-[#7c3aed]/40" : "border-linha bg-preto-card"}`}
            >
              {pl.destaque && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Mais popular</span>
              )}
              <h3 className="display text-2xl text-white">{pl.nome}</h3>
              <p className="mt-1 text-sm font-semibold text-vermelho">{pl.posts}</p>
              <p className="mt-4 text-3xl font-bold text-white">Sob consulta</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-muted">
                {pl.itens.map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-400">✓</span> {i}
                  </li>
                ))}
              </ul>
              <a
                href={CONTATO}
                className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-semibold transition ${pl.destaque ? "bg-vermelho text-white hover:bg-vermelho-hover" : "border border-linha text-white hover:border-vermelho"}`}
              >
                Quero esse plano
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="border-t border-linha bg-preto-card/30">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Perguntas frequentes</p>
            <h2 className="display mt-2 text-3xl sm:text-4xl">Ainda na dúvida?</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details key={f.p} className="group rounded-xl border border-linha bg-preto-card p-5 open:border-vermelho">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-white">
                  {f.p}
                  <span className="text-vermelho transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7c3aed]/20 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
          <h2 className="display text-4xl sm:text-5xl">Pronto para sua marca postar sozinha?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            Deixe o {APP_NAME} cuidar das postagens enquanto você cuida do que importa: o seu negócio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="rounded-xl bg-vermelho px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition hover:bg-vermelho-hover">
              Acessar o painel →
            </Link>
            <a href={CONTATO} className="rounded-xl border border-linha px-7 py-3.5 text-base font-semibold text-white transition hover:border-vermelho">
              Falar com a gente
            </a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-linha">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row">
          <span className="display text-lg text-white">
            {APP_NAME}<span className="text-vermelho">.</span>
          </span>
          <span>Feito para negócios locais que querem aparecer todo dia.</span>
          <Link href="/login" className="transition hover:text-white">Entrar →</Link>
        </div>
      </footer>
    </main>
  );
}
