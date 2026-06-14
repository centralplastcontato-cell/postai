import Link from "next/link";
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_NAME} — o Instagram do seu buffet infantil postando sozinho`,
  description:
    "O Postaí cria e publica sozinho os posts do seu buffet infantil no Instagram e no Facebook: pacotes, promoções, depoimentos de famílias e datas comemorativas — no tom da sua festa, todos os dias.",
};

// Contato de vendas (modo concierge). Troque por um link de WhatsApp quando quiser:
// const CONTATO = "https://wa.me/55SEUNUMERO";
const CONTATO = "mailto:centralplast.contato@gmail.com?subject=Quero%20o%20Postai%20no%20meu%20buffet%20infantil";

const PASSOS: { n: string; titulo: string; texto: string }[] = [
  {
    n: "1",
    titulo: "Conecte seu buffet",
    texto: "Cores, logo, jeito de falar e as contas do Instagram e Facebook do buffet. Você faz isso uma vez só.",
  },
  {
    n: "2",
    titulo: "A IA cria as artes da festa",
    texto: "Carrosséis e posts prontos no estilo do seu buffet: pacotes, promoções, depoimentos de famílias, datas comemorativas e muito mais.",
  },
  {
    n: "3",
    titulo: "Posta sozinho",
    texto: "Você aprova ou deixa no automático. O Postaí publica nos dias e horas certos. Seu buffet todo dia no feed.",
  },
];

const RECURSOS: { emoji: string; titulo: string; texto: string }[] = [
  { emoji: "🤖", titulo: "Arte com IA no tom do buffet", texto: "Títulos, legendas e imagens no clima de festa infantil — alegre, caloroso e com a cara do seu espaço." },
  { emoji: "🗓️", titulo: "Piloto automático", texto: "Escolha os dias e horários. O Postaí posta sozinho, até quando você está no meio de uma festa." },
  { emoji: "📱", titulo: "Instagram + Facebook", texto: "Um post só, publicado no Instagram e no Facebook do buffet ao mesmo tempo." },
  { emoji: "🎨", titulo: "Modelos pensados pra festa", texto: "Pacote de festa, promoção, depoimento de família, data comemorativa, tour pelo espaço e capas especiais." },
  { emoji: "🎂", titulo: "Seu espaço sempre em evidência", texto: "Mostre o salão, os brinquedos e o que está incluso no pacote — o que faz a família escolher você." },
  { emoji: "✅", titulo: "Você no controle", texto: "Aprove, edite o texto, troque a foto do salão ou a capa antes de publicar. Sem surpresa." },
];

const TEMPLATES: { emoji: string; nome: string }[] = [
  { emoji: "💰", nome: "Pacote de festa" },
  { emoji: "🎉", nome: "Promoção" },
  { emoji: "⭐", nome: "Depoimento de família" },
  { emoji: "🎈", nome: "Data comemorativa" },
  { emoji: "🏆", nome: "Por que nos escolher" },
  { emoji: "💡", nome: "Dica pros pais" },
  { emoji: "🖼️", nome: "Tour pelo espaço" },
  { emoji: "🪟", nome: "Capas especiais" },
];

const PLANOS: { nome: string; posts: string; destaque?: boolean; itens: string[] }[] = [
  {
    nome: "Essencial",
    posts: "1 post por dia",
    itens: ["Seu buffet sempre ativo no feed", "Carrosséis e posts com IA", "Instagram + Facebook", "Piloto automático"],
  },
  {
    nome: "Profissional",
    posts: "2 posts por dia",
    destaque: true,
    itens: ["Presença forte na temporada de festas", "Todos os modelos de arte", "Horários diferentes no mesmo dia", "Aprovação e edição fácil"],
  },
  {
    nome: "Turbo",
    posts: "3 posts por dia",
    itens: ["Máximo de alcance e reservas", "Mais conteúdo, mais festas fechadas", "Prioridade nas datas quentes", "Suporte prioritário"],
  },
];

const FAQ: { p: string; r: string }[] = [
  { p: "Preciso saber design ou postar na mão?", r: "Não. O Postaí cria as artes e posta pelo seu buffet. Você só acompanha." },
  { p: "Funciona no Instagram e no Facebook?", r: "Sim, nas duas redes ao mesmo tempo — um post vira presença do buffet nos dois lugares." },
  { p: "Posso revisar antes de publicar?", r: "Pode. Aprove, edite o texto, troque a foto do salão, ou deixe tudo no automático." },
  { p: "Tenho mais de uma unidade de buffet. Dá pra usar?", r: "Sim. Você gerencia mais de um buffet no mesmo painel, cada um no seu tom." },
  { p: "Como eu começo?", r: "Clique em Acessar o painel para entrar, ou fale com a gente que colocamos o seu buffet no ar." },
];

// Exemplos de publicações que rolam no feed do hero (um por template).
// "foto" e "espaco" simulam FOTO de um buffet fictício (cena de festa em SVG).
const ARTES = ["foto", "preco", "depo", "espaco", "promo", "data"] as const;

// Cena ilustrada de um buffet infantil fictício (bandeirolas, balões, mesa com bolo)
// — serve de "foto" de fundo nas artes que usam imagem real. Tudo em SVG: sempre
// renderiza, sem depender de imagem externa. Sem <defs>/id pra não duplicar ids.
function CenaBuffet() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#fde68a] via-[#fbcfe8] to-[#c4b5fd]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {/* chão / tapete */}
        <rect x="0" y="80" width="100" height="20" fill="#7c3aed" opacity="0.2" />
        {/* bandeirolas */}
        <path d="M0 12 Q50 22 100 12" stroke="#ffffff" strokeWidth="0.5" fill="none" opacity="0.7" />
        <path d="M6 13 l5 0 l-2.5 5 z" fill="#ef4444" />
        <path d="M17 14 l5 0 l-2.5 5 z" fill="#f59e0b" />
        <path d="M28 15 l5 0 l-2.5 5 z" fill="#22c55e" />
        <path d="M40 16 l5 0 l-2.5 5 z" fill="#3b82f6" />
        <path d="M52 16 l5 0 l-2.5 5 z" fill="#a855f7" />
        <path d="M64 15 l5 0 l-2.5 5 z" fill="#ef4444" />
        <path d="M75 14 l5 0 l-2.5 5 z" fill="#f59e0b" />
        <path d="M86 13 l5 0 l-2.5 5 z" fill="#22c55e" />
        {/* cordões dos balões */}
        <g stroke="#ffffff" strokeWidth="0.3" opacity="0.9">
          <line x1="16" y1="30" x2="16" y2="44" />
          <line x1="26" y1="30" x2="26" y2="44" />
          <line x1="84" y1="32" x2="84" y2="46" />
        </g>
        {/* balões */}
        <ellipse cx="16" cy="24" rx="6" ry="7.5" fill="#ef4444" />
        <ellipse cx="26" cy="24" rx="5.5" ry="7" fill="#22c55e" />
        <ellipse cx="84" cy="26" rx="6" ry="7.5" fill="#f59e0b" />
        <ellipse cx="90" cy="20" rx="5" ry="6.5" fill="#ec4899" />
        {/* mesa + bolo + velinha */}
        <rect x="33" y="70" width="34" height="3.5" rx="1.5" fill="#ffffff" opacity="0.9" />
        <rect x="44" y="58" width="12" height="12" rx="1.5" fill="#ec4899" />
        <rect x="46" y="52" width="8" height="6" rx="1" fill="#f9a8d4" />
        <rect x="49.3" y="47" width="1.4" height="5" fill="#fbbf24" />
        <circle cx="50" cy="46" r="1.2" fill="#fde047" />
      </svg>
    </div>
  );
}

// Mini publicação (cabeçalho + arte + ações) — exemplo de arte gerada pelo Postaí.
function MiniPost({ v }: { v: string }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-linha bg-preto shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#ec4899]" />
        <span className="text-[11px] font-semibold text-white">seu.buffet</span>
        <span className="ml-auto text-sm leading-none text-muted">•••</span>
      </div>
      <div className="relative aspect-square overflow-hidden">
        {v === "preco" && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[#7c3aed] via-[#9333ea] to-[#ec4899] px-4 text-center">
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-[#7c3aed]">ATÉ 30/6</span>
            <p className="display text-2xl text-white drop-shadow">PACOTE IMPERDÍVEL</p>
            <div className="mt-2 rounded-xl bg-white/95 px-5 py-2 shadow">
              <p className="text-[8px] font-bold tracking-wide text-[#7c3aed]">A PARTIR DE</p>
              <p className="display text-3xl text-[#111827]">R$ 5.990</p>
            </div>
            <span className="mt-2.5 rounded-full bg-[#25D366] px-3 py-1 text-[10px] font-bold text-white">CHAMAR NO WHATSAPP</span>
          </div>
        )}
        {v === "depo" && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] px-4 text-center">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-lg">
              <div className="text-sm tracking-widest text-amber-400">★★★★★</div>
              <p className="display mt-1 text-lg text-[#111827]">FESTA INESQUECÍVEL!</p>
              <p className="mt-1 text-[9px] leading-snug text-gray-500">Atendimento nota 10, a criançada amou. Super recomendo!</p>
              <p className="mt-1.5 text-[10px] font-bold text-[#6366f1]">— Família Souza</p>
            </div>
          </div>
        )}
        {v === "promo" && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[#f97316] to-[#ef4444] px-4 text-center">
            <p className="display text-5xl leading-none text-white drop-shadow">10</p>
            <p className="display text-2xl text-white">CRIANÇAS GRÁTIS</p>
            <p className="mt-1.5 text-[10px] font-semibold text-white/90">Nos pacotes de aniversário</p>
          </div>
        )}
        {v === "data" && (
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#ec4899] via-[#a855f7] to-[#6366f1] px-4 text-center">
            <span className="absolute left-4 top-5 h-2 w-2 rounded-full bg-amber-300" />
            <span className="absolute right-6 top-8 h-1.5 w-1.5 rounded-full bg-white" />
            <span className="absolute bottom-8 left-8 h-1.5 w-1.5 rounded-full bg-emerald-300" />
            <span className="absolute bottom-6 right-5 h-2 w-2 rounded-full bg-amber-200" />
            <p className="display text-2xl leading-tight text-white drop-shadow">FELIZ DIA<br />DAS CRIANÇAS!</p>
          </div>
        )}
        {v === "foto" && (
          <div className="relative h-full">
            <CenaBuffet />
            {/* degradê embaixo pra leitura do título (igual ao template Foto) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-center">
              <p className="display text-xl leading-tight text-white drop-shadow-lg">A FESTA DOS SONHOS COMEÇA AQUI</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-white/90">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></svg>
                seu buffet infantil
              </p>
            </div>
          </div>
        )}
        {v === "espaco" && (
          <div className="relative h-full">
            <CenaBuffet />
            <div className="absolute inset-0 bg-black/15" />
            {/* faixa diagonal com o título (igual ao template Faixa) */}
            <div className="absolute left-1/2 top-1/2 w-[170%] -translate-x-1/2 -translate-y-1/2 -rotate-6 bg-vermelho py-2 text-center shadow-lg">
              <p className="display text-lg text-white">CONHEÇA NOSSO ESPAÇO</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 px-3 py-2 text-white/85">
        <svg viewBox="0 0 24 24" fill="#ef4444" className="h-4 w-4"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M7.5 8.25h9m-9 3H12m8.25.75c0 4.556-3.694 8.25-8.25 8.25a8.2 8.2 0 0 1-3.59-.82L3 21l1.32-3.96A8.21 8.21 0 0 1 3.75 12c0-4.556 3.694-8.25 8.25-8.25s8.25 3.694 8.25 8.25z" /></svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 12 3.27 3.13A59.77 59.77 0 0 1 21.49 12 59.77 59.77 0 0 1 3.27 20.88L6 12zm0 0h7.5" /></svg>
        <span className="ml-auto text-[9px] font-bold text-[#c7b2ff]">✓ pelo {APP_NAME}</span>
      </div>
    </div>
  );
}

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
              🎈 Marketing automático para buffet infantil
            </span>
            <h1 className="display mt-5 text-4xl leading-[1.04] sm:text-5xl md:text-6xl">
              Seu buffet infantil<br />
              postando <span className="bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#ec4899] bg-clip-text text-transparent">todo dia</span>.<br />
              Sem você levantar um dedo.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              O {APP_NAME} cria os carrosséis e posts do seu buffet com inteligência artificial — pacotes,
              promoções e depoimentos — e publica sozinho no Instagram e no Facebook, nos dias e horários que você escolher.
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
              Feito para donos de buffet infantil que querem encher a agenda de festas — sem perder tempo postando.
            </p>
          </div>

          {/* MOCK: feed do buffet rolando sozinho (carrossel vertical de publicações) */}
          <div className="relative mx-auto w-full max-w-[300px]">
            <div aria-hidden className="pointer-events-none absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[#7c3aed]/25 to-[#ec4899]/25 blur-3xl" />
            <div className="relative h-[500px] overflow-hidden rounded-[1.8rem] border border-linha bg-preto-card p-3 shadow-2xl">
              {/* fade no topo e na base, pra dar sensação de feed contínuo */}
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-preto-card to-transparent" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-preto-card to-transparent" />
              <div className="flex flex-col animate-postai-feed hover:[animation-play-state:paused]">
                {[...ARTES, ...ARTES].map((v, i) => (
                  <MiniPost key={i} v={v} />
                ))}
              </div>
            </div>
            <span className="absolute -bottom-3.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-vermelho px-3.5 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-[#7c3aed]/40">
              ✨ postando no automático
            </span>
          </div>
        </div>
      </section>

      {/* ===== DOR -> SOLUÇÃO ===== */}
      <section className="border-y border-linha bg-preto-card/40">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center">
          <p className="text-lg leading-relaxed text-muted sm:text-xl">
            Entre uma festa e outra, ninguém tem tempo de postar. Aí o Instagram do buffet fica parado
            e a família que ia fechar acaba escolhendo quem aparece.{" "}
            <span className="font-semibold text-white">O {APP_NAME} cuida disso no automático</span> — pro seu buffet nunca mais sumir do feed.
          </p>
        </div>
      </section>

      {/* ===== COMO FUNCIONA ===== */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">Como funciona</p>
          <h2 className="display mt-2 text-3xl sm:text-4xl">Três passos e pronto</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Configura uma vez e o seu buffet passa a aparecer todos os dias, sozinho.</p>
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
            <h2 className="display mt-2 text-3xl sm:text-4xl">Tudo para o buffet postar sem esforço</h2>
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
          <h2 className="display mt-2 text-3xl sm:text-4xl">Um modelo para cada momento da festa</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">A IA monta a arte certa: pacote de festa, promoção, depoimento de família, data comemorativa e muito mais.</p>
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
            no Instagram e no Facebook. Você cuida das festas; a divulgação do buffet roda no automático.
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
          <h2 className="display mt-2 text-3xl sm:text-4xl">Escolha o ritmo do seu buffet</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Quanto mais posts por dia, mais famílias veem o seu buffet. Valor mensal por buffet.</p>
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
          <h2 className="display text-4xl sm:text-5xl">Pronto para o seu buffet postar sozinho?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            Deixe o {APP_NAME} cuidar da divulgação enquanto você cuida do que importa: as festas e as famílias.
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
          <span>Feito para buffets infantis que querem encher a agenda de festas.</span>
          <Link href="/login" className="transition hover:text-white">Entrar →</Link>
        </div>
      </footer>
    </main>
  );
}
