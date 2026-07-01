"use client";

import { useState, useTransition, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { sortearImagemBancoAction } from "@/app/actions/imagens";
import { SeletorImagemBanco } from "./seletor-imagem-banco";
import {
  gerarCarrossel,
  trocarCapaCarrossel,
  reagendarCarrossel,
  remarcarCarrossel,
  regerarCarrossel,
  regerarCarrosselComoNova,
  alternarAprovacaoCarrossel,
  regerarSlide,
  gerarImagemSlide,
  definirImagemSlide,
  removerImagemSlide,
  editarLegendaCarrossel,
  alternarTextoSlide,
  postarInstagram,
  sugerirTemas,
  marcarConteudo,
} from "@/app/actions/marketing";
import { excluirConteudo } from "@/app/actions/excluir";
import { ConfirmDialog } from "./confirm-dialog";
import { CaixaPostando } from "./caixa-postando";
import { rotuloHora } from "@/lib/horarios";
import { CORES_EXTRAS } from "@/lib/cores-fundo";
import { SeloEngajamento } from "./selo-engajamento";
import { EtiquetaCategoria } from "./etiqueta-categoria";

// Temas prontos de carrossel (clique preenche o campo Tema). Ângulos que funcionam
// pro público de um buffet infantil — o dono ajusta ou pede "Sugerir temas com IA".
const MODELOS_CARROSSEL: { rotulo: string; tema: string }[] = [
  { rotulo: "🏰 Conheça o espaço", tema: "um tour pelo nosso espaço e tudo que ele oferece pra festa" },
  { rotulo: "🎠 Nossos brinquedos", tema: "os brinquedos e atrações que fazem a alegria da criançada" },
  { rotulo: "📋 Festa perfeita", tema: "os detalhes que tornam a festa perfeita quando é comemorada com a gente, com tudo pronto pra família só aproveitar" },
  { rotulo: "🍰 O que está incluso", tema: "tudo o que está incluso no nosso pacote de festa" },
  { rotulo: "❓ Dúvidas frequentes", tema: "respostas pras dúvidas mais comuns de quem vai contratar a festa" },
  { rotulo: "🎈 Ideias de tema", tema: "ideias de temas criativos para a festa do seu filho" },
  { rotulo: "😌 Festa sem stress", tema: "como ter uma festa tranquila enquanto a gente cuida de tudo" },
  { rotulo: "🛡️ Segurança", tema: "os cuidados de segurança e higiene com as crianças" },
  { rotulo: "📅 Como reservar", tema: "como reservar a sua data com a gente, do orçamento à festa" },
  { rotulo: "⭐ Por que escolher", tema: "por que tantas famílias escolhem e voltam a comemorar com a gente" },
];

// Estilos de CAPA do carrossel. 🎲 Surpresa sorteia entre os 5; os demais fixam o
// visual. O conteúdo dos slides segue sempre gerado pela IA.
const ESTILOS_CAPA: { valor: string; emoji: string; nome: string; dica: string }[] = [
  { valor: "aleatorio", emoji: "🎲", nome: "Surpresa", dica: "Sorteia um estilo de capa diferente a cada geração." },
  { valor: "festiva", emoji: "🎨", nome: "Colorida", dica: "Capa colorida festiva, com o título em destaque (sem foto)." },
  { valor: "foto", emoji: "📷", nome: "Foto", dica: "Uma foto real do seu banco ocupa a capa inteira, com o título por cima." },
  { valor: "mosaico", emoji: "🖼️", nome: "Mosaico", dica: "4 fotos reais do seu banco em círculos — mostra o espaço de verdade." },
  { valor: "moldura", emoji: "🪟", nome: "Moldura", dica: "Título dentro de uma moldura branca lúdica, sobre fundo festivo." },
  { valor: "faixa", emoji: "📐", nome: "Faixa", dica: "Foto de fundo com uma faixa diagonal trazendo o título." },
];

export type Post = {
  id: string;
  slug: string;
  data: string;
  titulo: string;
  legenda: string;
  hashtags: string;
  slides: string[];
  status: string;
  tema?: string | null;
  aprovado: boolean; // revisão interna do dono (não vai pra rede)
  postadoEm?: string | null; // ISO do momento real da publicação (null = não postado)
  imagensSlides?: (string | null)[];
  tiposSlides?: (string | undefined)[]; // tipo de cada slide (capa/conteudo/mosaico/capa-*)
  semTextoSlides?: boolean[]; // por slide: mostrar a foto PURA (sem os textos por cima)
  categoria?: string | null; // categoria de intenção (pra etiqueta + inteligência)
  // Engajamento no Instagram (coletado pelo piloto após postar)
  curtidas?: number | null;
  comentarios?: number | null;
  alcance?: number | null;
  salvamentos?: number | null;
};

// Formata o horário de publicação: "13/jun às 14:05" (fuso de São Paulo).
function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  const dm = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dm} às ${hm}`;
}

// Slides que NÃO usam foto de fundo ÚNICA → os botões de foto (banco/IA/upload) não têm efeito:
// mosaico (usa 4 fotos próprias), capa-festiva (só cor) e capa-moldura (só cor + texto).
// capa-foto e capa-faixa USAM 1 foto de fundo (slide.imagemUrl) — então os botões funcionam nelas.
const ehCapaEstilo = (tipo?: string) => tipo === "mosaico" || tipo === "capa-festiva" || tipo === "capa-moldura";

// Hora (0-23) de uma data ISO no fuso de São Paulo — pro seletor de hora do card.
function horaSP(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso));
  return parseInt(h, 10) || 0;
}
function ymd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

const POR_PAGINA = 6;

function chaveDiaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// Tooltip estilizado (tema escuro) que aparece à esquerda do botão no hover —
// substitui o title nativo do navegador (aquele branco cru).
function DicaSlide({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-linha bg-preto-card px-2 py-1 text-[11px] font-medium text-white shadow-xl group-hover:block">
      {children}
    </span>
  );
}

export function MarketingCalendario({
  marcaId,
  posts,
  selId,
  onSelId,
  dataAlvo,
  horaPadrao,
  onGerado,
  onLimparDia,
  temFacebook,
  slotGerador,
}: {
  marcaId: string;
  posts: Post[];
  selId: string | null;
  onSelId: (id: string | null) => void;
  dataAlvo: string | null;
  horaPadrao: number; // hora padrão do carrossel (BRT) — default do seletor de hora
  onGerado: (dia?: string) => void;
  onLimparDia?: () => void;
  temFacebook?: boolean; // posta também no Facebook → reflete na caixinha "Estamos postando"
  slotGerador?: ReactNode; // outro gerador (Aniversariantes) renderizado logo abaixo do principal
}) {
  const router = useRouter();
  // Gerador colapsável CONTEXTUAL: recolhido quando o dia (ou a lista) já tem carrossel; aberto
  // quando vazio. Re-sincroniza ao trocar de dia. Dá pra abrir/fechar na mão (▾/▸).
  const temCarrosseisNoContexto = (dataAlvo ? posts.filter((p) => chaveDiaSP(p.data) === dataAlvo) : posts).length > 0;
  const [geradorAberto, setGeradorAberto] = useState(!temCarrosseisNoContexto);
  useEffect(() => {
    setGeradorAberto(!(dataAlvo ? posts.filter((p) => chaveDiaSP(p.data) === dataAlvo) : posts).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAlvo]);
  const gerador = { aberto: geradorAberto, alternar: () => setGeradorAberto((a) => !a) };
  const redesTexto = temFacebook ? "no Instagram e Facebook" : "no Instagram";
  const [isPending, startTransition] = useTransition();
  const [tema, setTema] = useState("");
  const [nSlides, setNSlides] = useState(7);
  const [hora, setHora] = useState(horaPadrao); // hora do post (BRT) — vários no mesmo dia
  const [estiloCapa, setEstiloCapa] = useState("aleatorio");
  const [corCapa, setCorCapa] = useState("");
  // Modo do gerador: "tema" = carrossel por IA; "aniver" = montar Aniversariantes da semana.
  const [modoGerador, setModoGerador] = useState<"tema" | "aniver">("tema");
  const [trocaEstilo, setTrocaEstilo] = useState("aleatorio"); // troca SÓ a capa (na tela de edição)
  const [trocaCor, setTrocaCor] = useState("");
  const [trocandoCapa, setTrocandoCapa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [legendaAberta, setLegendaAberta] = useState(true);
  const [editandoLegenda, setEditandoLegenda] = useState(false);
  const [legendaEdit, setLegendaEdit] = useState("");
  const [hashtagsEdit, setHashtagsEdit] = useState("");
  const [salvandoLegenda, setSalvandoLegenda] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [slideProcessando, setSlideProcessando] = useState<number | null>(null);
  const [postando, setPostando] = useState(false);
  const [postandoId, setPostandoId] = useState<string | null>(null); // card publicando agora (caixinha)
  const [erroPost, setErroPost] = useState<string | null>(null);
  const [temasIA, setTemasIA] = useState<string[]>([]);
  const [sugerindo, setSugerindo] = useState(false);
  const [postarAlvo, setPostarAlvo] = useState<Post | null>(null);
  const [regerarPostado, setRegerarPostado] = useState<Post | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<Post | null>(null);
  const [pagina, setPagina] = useState(1);
  const [legendaCardId, setLegendaCardId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const selecionado = posts.find((p) => p.id === selId) ?? null;

  // Grade de cards: filtra por dia clicado (se houver) e pagina o resto — mesma cara
  // das Publicações, pra ambas as abas serem iguais.
  const filtrados = dataAlvo ? posts.filter((p) => chaveDiaSP(p.data) === dataAlvo) : posts;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagAtual = Math.min(pagina, totalPaginas);
  const visiveis = dataAlvo ? filtrados : filtrados.slice((pagAtual - 1) * POR_PAGINA, pagAtual * POR_PAGINA);

  // Data comemorativa do dia escolhido (ex: 24/jun = São João). Mostra um aviso e
  // deixa o dono ATIVAR o tema da data (não sobrescreve mais sozinho o que ele digita).
  const comemorativa = dataAlvo ? dataComemorativaDe(dataAlvo) : undefined;
  // Ativar a data: além do tema, já deixa a capa no estilo Colorida (festivo) — dá
  // mais "cara de comemoração" à arte. O dono pode trocar o estilo/cor depois.
  function usarTemaData() {
    if (!comemorativa?.sugestao) return;
    setTema(comemorativa.sugestao);
    setEstiloCapa("festiva");
  }

  function handleGerar() {
    setErro(null);
    if (!dataAlvo) {
      setErro("Clique num dia livre no calendário pra escolher a data do post.");
      return;
    }
    startTransition(async () => {
      const r = await gerarCarrossel({ marcaId, tema, data: dataAlvo, nSlides, estiloCapa, corFundo: corCapa || undefined, hora });
      if (r.ok) {
        setTema("");
        onSelId(r.id);
        onGerado(dataAlvo ?? undefined); // filtra a lista no dia gerado (não abre todos)
        router.refresh();
      } else setErro(r.erro);
    });
  }
  function regerarCarr(id: string, comoNova: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = comoNova ? await regerarCarrosselComoNova(id) : await regerarCarrossel(id);
      if (!r.ok) setErro(r.erro);
      // O novo carrossel vai pra outra data — já seleciona ele pra aparecer na hora.
      else if (comoNova && r.id) onSelId(r.id);
      router.refresh();
    });
  }
  function handleRegerar(p: Post) {
    // Carrossel já no Instagram: não sobrescreve. Avisa e cria um novo ao lado.
    if (p.status === "postado") {
      setRegerarPostado(p);
      return;
    }
    regerarCarr(p.id, false);
  }
  // Muda a HORA de um carrossel já programado (mantém o dia) — pelo próprio card.
  function handleReagendar(id: string, hora: number) {
    setErro(null);
    startTransition(async () => {
      const r = await reagendarCarrossel(id, hora);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });
  }
  // Muda o DIA de um carrossel já programado (mantém a hora).
  function handleRemarcar(id: string, dataYMD: string) {
    if (!dataYMD) return;
    setErro(null);
    startTransition(async () => {
      const r = await remarcarCarrossel(id, dataYMD);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });
  }
  function handleSugerirTemas() {
    setErro(null);
    setSugerindo(true);
    startTransition(async () => {
      const r = await sugerirTemas(marcaId);
      if (r.ok) setTemasIA(r.temas);
      else setErro(r.erro);
      setSugerindo(false);
    });
  }
  function handlePostar(p: Post) {
    setPostarAlvo(p);
  }
  async function confirmarPostar(p: Post) {
    setErroPost(null);
    setPostando(true);
    setPostandoId(p.id);
    try {
      const r = await postarInstagram(p.id);
      if (!r.ok) setErroPost(r.erro);
      router.refresh();
    } finally {
      setPostando(false);
      setPostandoId(null);
    }
  }
  function handleAprovar(p: Post) {
    startTransition(async () => {
      await alternarAprovacaoCarrossel(p.id);
      router.refresh();
    });
  }
  function confirmarExcluir(p: Post) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", p.id);
      await excluirConteudo(fd);
      if (selId === p.id) onSelId(null);
      router.refresh();
    });
  }
  function copiarCard(p: Post) {
    navigator.clipboard.writeText(`${p.legenda}\n\n${p.hashtags}`);
    setCopiadoId(p.id);
    setTimeout(() => setCopiadoId((c) => (c === p.id ? null : c)), 1500);
  }
  function handleTrocarCapa(id: string) {
    setErro(null);
    setTrocandoCapa(true);
    startTransition(async () => {
      const r = await trocarCapaCarrossel({ id, estiloCapa: trocaEstilo, corFundo: trocaCor || undefined });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setTrocandoCapa(false);
    });
  }
  const [seletorSlide, setSeletorSlide] = useState<{ id: string; indice: number; texto: string; atual: string | null } | null>(null);
  function handleEscolherSlide(id: string, indice: number, url: string) {
    setErro(null);
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await definirImagemSlide({ id, indice, url });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleGerarImagem(id: string, indice: number) {
    setErro(null);
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await gerarImagemSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleBancoSlide(id: string, indice: number) {
    setErro(null);
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await sortearImagemBancoAction(marcaId);
      if (!r.ok) {
        setErro(r.erro);
        setSlideProcessando(null);
        return;
      }
      const d = await definirImagemSlide({ id, indice, url: r.url });
      if (!d.ok) setErro(d.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  async function handleUploadImagem(id: string, indice: number, file: File | undefined) {
    if (!file) return;
    setSlideProcessando(indice);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Falha no upload.");
        return;
      }
      const r = await definirImagemSlide({ id, indice, url: data.url });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
    } finally {
      setSlideProcessando(null);
    }
  }
  function handleRemoverImagem(id: string, indice: number) {
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await removerImagemSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleRegerarSlide(id: string, indice: number) {
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await regerarSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  function handleAlternarTexto(id: string, indice: number) {
    setSlideProcessando(indice);
    startTransition(async () => {
      const r = await alternarTextoSlide({ id, indice });
      if (!r.ok) setErro(r.erro);
      else router.refresh();
      setSlideProcessando(null);
    });
  }
  async function baixarTodas(p: Post) {
    setBaixando(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await Promise.all(
        p.slides.map(async (src, i) => {
          const resp = await fetch(src);
          zip.file(`slide-${i + 1}.png`, await resp.blob());
        })
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `carrossel-${p.slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não consegui baixar agora.");
    } finally {
      setBaixando(false);
    }
  }
  function copiar(p: Post) {
    navigator.clipboard.writeText(`${p.legenda}\n\n${p.hashtags}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div>
      {imgExpandida && (
        <div onClick={() => setImgExpandida(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgExpandida} alt="Slide" className="h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-lg border border-linha" />
          <button onClick={() => setImgExpandida(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      {/* Gerar carrossel */}
      <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        {!gerador.aberto ? (
          <button type="button" onClick={gerador.alternar} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500/15 py-2.5 text-sm font-bold text-orange-100 transition hover:bg-orange-500/25">
            <span className="text-lg">✨</span> Criar novo carrossel
          </button>
        ) : (
          <button type="button" onClick={gerador.alternar} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="text-sm font-semibold text-white">Gerar carrossel <span className="font-normal text-muted">— por tema (IA) ou Aniversariantes</span></span>
            <span className="shrink-0 rounded-md border border-linha px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">▾ recolher</span>
          </button>
        )}
        {gerador.aberto && (<>
        {/* Modo: gerar por tema (IA) ou montar os Aniversariantes da semana (manual) */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setModoGerador("tema")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${modoGerador === "tema" ? "border-orange-500 bg-orange-500/15 text-white" : "border-linha text-muted hover:text-white"}`}>📚 Por tema (IA)</button>
          <button type="button" onClick={() => setModoGerador("aniver")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${modoGerador === "aniver" ? "border-orange-500 bg-orange-500/15 text-white" : "border-linha text-muted hover:text-white"}`}>🎂 Aniversariantes da semana</button>
        </div>
        {modoGerador === "tema" ? (<>
        <div className="mb-3 mt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Temas prontos (clique pra preencher)</p>
          <div className="flex flex-wrap gap-2">
            {MODELOS_CARROSSEL.map((m) => (
              <button
                key={m.rotulo}
                type="button"
                onClick={() => setTema(m.tema)}
                className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white"
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </div>
        {/* Aviso de data comemorativa no dia escolhido — o dono ativa o tema da data. */}
        {comemorativa && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <span className="text-xs font-semibold text-amber-200">
              {comemorativa.emoji} Este dia é <span className="text-white">{comemorativa.nome}</span> — que tal um carrossel temático?
            </span>
            {comemorativa.sugestao && (
              <button
                type="button"
                onClick={usarTemaData}
                disabled={tema.trim() === comemorativa.sugestao && estiloCapa === "festiva"}
                title="Preenche o tema da data e deixa a capa no estilo Colorida (festivo)"
                className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
              >
                {tema.trim() === comemorativa.sugestao && estiloCapa === "festiva" ? "✓ Data ativada (tema + capa festiva)" : `🎉 Ativar data: ${comemorativa.sugestao}`}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs text-muted">
            Tema
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: novidades da semana" className="input-base" />
          </label>
          <div className="text-xs text-muted">
            Dia do post
            <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
              {dataAlvo ? <span className="font-semibold text-white">📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)}</span> : <span className="text-muted">Clique num dia livre ↑</span>}
            </div>
          </div>
          <label className="text-xs text-muted">
            Hora <span className="text-muted/70">(BRT)</span>
            <select value={hora} onChange={(e) => setHora(Number(e.target.value))} className="input-base" title="Permite vários posts no mesmo dia em horas diferentes (ex: 13h, 18h)">
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
            </select>
          </label>
          <div className="text-xs text-muted">
            Nº de artes
            <select value={nSlides} onChange={(e) => setNSlides(Number(e.target.value))} className="input-base">
              {[4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} slides</option>)}
            </select>
          </div>
          <button onClick={handleGerar} disabled={isPending || !tema.trim()} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar"}
          </button>
        </div>
        <div className="mt-3">
          <div className="text-xs text-muted">Estilo da capa</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ESTILOS_CAPA.map((e) => (
              <button
                key={e.valor}
                type="button"
                onClick={() => setEstiloCapa(e.valor)}
                title={e.dica}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${estiloCapa === e.valor ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}
              >
                {e.emoji} {e.nome}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted">Cor:</span>
            <button
              type="button"
              onClick={() => setCorCapa("")}
              title="Deixa o Postaí escolher uma cor da marca"
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${corCapa === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}
            >
              🎲 Auto
            </button>
            {CORES_EXTRAS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCorCapa(c)}
                title={c}
                aria-label={`Cor ${c}`}
                className={`h-9 w-9 rounded-lg border-2 transition ${corCapa.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="mt-3">
          <button type="button" onClick={handleSugerirTemas} disabled={sugerindo} className="flex items-center gap-1 text-xs uppercase tracking-wider text-amber-300 transition hover:text-amber-200 disabled:opacity-50">
            {sugerindo ? "💡 Pensando…" : "💡 Sugerir temas com IA"}
          </button>
          {temasIA.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {temasIA.map((t) => (
                <button key={t} type="button" onClick={() => setTema(t)} className="rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1 text-xs text-amber-200 transition hover:border-amber-400 hover:text-white">{t}</button>
              ))}
            </div>
          )}
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
        </>) : (
          slotGerador
        )}
        </>)}
      </div>

      {/* Contagem + paginação (o filtro por dia + "Ver todos" agora ficam no topo,
          acima das abas, pois são globais — ver redes-sociais.tsx). */}
      {posts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{filtrados.length} {filtrados.length === 1 ? "carrossel" : "carrosséis"}{dataAlvo ? " nesse dia" : ""}</span>
          {!dataAlvo && totalPaginas > 1 ? (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagAtual <= 1} className="rounded-md border border-linha px-2.5 py-1 text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">◀</button>
              <span className="text-muted">Página {pagAtual}/{totalPaginas}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagAtual >= totalPaginas} className="rounded-md border border-linha px-2.5 py-1 text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">▶</button>
            </div>
          ) : null}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum carrossel ainda. Escolha um tema acima e clique em Gerar.</p>
      ) : filtrados.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum carrossel nesse dia. <button type="button" onClick={() => onLimparDia?.()} className="font-semibold text-orange-300 underline">Ver todos</button> ou gere um acima.</p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((p) => {
            const postado = p.status === "postado";
            const aberto = selId === p.id;
            const capa = p.slides[0];
            return (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-preto-card p-3 ${aberto ? "border-orange-500 ring-2 ring-orange-500/50" : "border-linha"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{dataBR(p.data)}</span>
                  <span title={postado && p.postadoEm ? `Publicado em ${dataHoraBR(p.postadoEm)}` : undefined} className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "✓ Postado" : "● A postar"}</span>
                </div>
                {!postado ? (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <input type="date" value={ymd(p.data)} onChange={(e) => handleRemarcar(p.id, e.target.value)} disabled={isPending} title="Mudar o dia da postagem" style={{ colorScheme: "dark" }} className="rounded-md border border-linha bg-preto px-2 py-1 text-[11px] text-white transition hover:border-vermelho disabled:opacity-40" />
                    <select value={horaSP(p.data)} onChange={(e) => handleReagendar(p.id, Number(e.target.value))} disabled={isPending} title="Hora da postagem (o piloto posta nesse horário) — permite vários posts no mesmo dia" className="w-fit shrink-0 rounded-md border border-linha bg-preto px-2 py-1 text-[11px] text-white transition hover:border-vermelho disabled:opacity-40">
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>🕐 {rotuloHora(h)}</option>)}
                    </select>
                  </div>
                ) : (
                  p.postadoEm && <p className="mb-2 text-[11px] text-green-400/80">📢 Publicado {dataHoraBR(p.postadoEm)}</p>
                )}
                <div className="relative">
                  <button type="button" onClick={() => onSelId(aberto ? null : p.id)} title={aberto ? "Fechar detalhe" : "Abrir / editar slides"} className="block w-full overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capa} alt={p.titulo} className="aspect-[4/5] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/5] w-full items-center justify-center bg-preto text-xs text-muted">sem capa</div>
                    )}
                  </button>
                  {postandoId === p.id && <CaixaPostando redes={redesTexto} />}
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">🖼️ Carrossel · {p.slides.length} slides</p>
                <p className="line-clamp-2 text-sm text-white">{p.titulo}</p>
                {p.categoria && <div className="mt-1.5"><EtiquetaCategoria categoria={p.categoria} /></div>}
                {postado && <SeloEngajamento p={p} />}

                <div className="mt-2">
                  <button type="button" onClick={() => setLegendaCardId((c) => (c === p.id ? null : p.id))} className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted transition hover:text-white"><span>{legendaCardId === p.id ? "▾" : "▸"}</span> Legenda + hashtags</button>
                  {legendaCardId === p.id && (
                    <pre className="scroll-bonito mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-2.5 text-xs text-white">{p.legenda}{p.hashtags ? `\n\n${p.hashtags}` : ""}</pre>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button onClick={() => handleAprovar(p)} disabled={isPending} title={p.aprovado ? "Você já revisou — clique pra desmarcar" : "Marcar como revisado (interno, não vai pra rede)"} className={`rounded-md px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${p.aprovado ? "bg-green-600 text-white hover:bg-green-500" : "border border-linha text-muted hover:border-green-500 hover:text-white"}`}>{p.aprovado ? "✓ Aprovado" : "Aprovar"}</button>
                  <button onClick={() => onSelId(aberto ? null : p.id)} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{aberto ? "▾ Fechar" : "✏️ Editar slides"}</button>
                  {p.tema && <button onClick={() => handleRegerar(p)} disabled={isPending} title={postado ? "Já postado — cria um novo ao lado" : "Regerar"} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻ Regerar</button>}
                  <button onClick={() => baixarTodas(p)} disabled={baixando} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">⬇ Baixar</button>
                  <button onClick={() => copiarCard(p)} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{copiadoId === p.id ? "✓ Copiado" : "Copiar"}</button>
                  {!postado && <button onClick={() => handlePostar(p)} disabled={postando} className="rounded-md bg-[#C13584] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📷 Postar</button>}
                  <button onClick={() => setExcluirAlvo(p)} title="Excluir carrossel" className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950/40">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalhe do post selecionado — abre num MODAL central (foco na edição). Antes
          renderizava no fim da página e "descia" lá embaixo no Ver todos os dias. */}
      {selecionado && (
        <div onClick={() => onSelId(null)} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6">
          <div onClick={(e) => e.stopPropagation()} className="relative my-auto w-full max-w-2xl rounded-xl border border-linha bg-preto-card p-4 shadow-2xl sm:p-5">
            <button type="button" onClick={() => onSelId(null)} aria-label="Fechar detalhe" className="absolute right-3 top-3 z-10 rounded-full bg-preto px-2.5 py-1 text-lg text-muted transition hover:text-white">✕</button>
            <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{dataBR(selecionado.data)}</p>
              <h3 className="display text-lg text-white sm:text-xl">{selecionado.titulo}</h3>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${selecionado.status === "postado" ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{selecionado.status === "postado" ? "Postado" : "A postar"}</span>
          </div>

          {/* Trocar SÓ a capa (estilo + cor), sem regerar o carrossel inteiro. */}
          {selecionado.status !== "postado" && (
            <div className="mt-4 rounded-lg border border-linha bg-preto p-3">
              <p className="text-xs font-semibold text-white">🎨 Trocar a capa <span className="font-normal text-muted">— muda só o 1º slide, mantém o resto</span></p>
              {(selecionado.tiposSlides?.[0] === "capa-foto" || selecionado.tiposSlides?.[0] === "capa-faixa") && (
                <button type="button" onClick={() => setSeletorSlide({ id: selecionado.id, indice: 0, texto: [selecionado.titulo, selecionado.tema].filter(Boolean).join(" "), atual: selecionado.imagensSlides?.[0] ?? null })} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed]/20 py-2 text-xs font-bold text-[#d6c6ff] transition hover:bg-[#7c3aed]/30">
                  🖼️ Escolher a foto da capa
                </button>
              )}
              <p className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-muted">Ou trocar o estilo da capa:</p>
              <div className="flex flex-wrap gap-1.5">
                {ESTILOS_CAPA.map((e) => (
                  <button key={e.valor} type="button" onClick={() => setTrocaEstilo(e.valor)} title={e.dica} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${trocaEstilo === e.valor ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>
                    {e.emoji} {e.nome}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-muted">Cor:</span>
                <button type="button" onClick={() => setTrocaCor("")} title="Cor automática da marca" className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${trocaCor === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>🎲 Auto</button>
                {CORES_EXTRAS.map((c) => (
                  <button key={c} type="button" onClick={() => setTrocaCor(c)} title={c} aria-label={`Cor ${c}`} className={`h-9 w-9 rounded-lg border-2 transition ${trocaCor.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`} style={{ backgroundColor: c }} />
                ))}
                <button type="button" onClick={() => handleTrocarCapa(selecionado.id)} disabled={trocandoCapa} className="ml-auto rounded-lg bg-vermelho px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
                  {trocandoCapa ? "Trocando…" : "Aplicar à capa"}
                </button>
              </div>
            </div>
          )}

          <div className="scroll-bonito mt-4 flex gap-3 overflow-x-auto pb-3">
            {selecionado.slides.map((src, i) => (
              <div key={src} className="shrink-0">
                <div className="flex items-stretch gap-1.5">
                  <button type="button" onClick={() => setImgExpandida(src)} title="Ampliar" className="block overflow-hidden rounded-md border border-linha transition hover:border-vermelho">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Slide ${i + 1}`} className="h-auto w-[150px] sm:w-[168px]" />
                  </button>
                  {selecionado.status !== "postado" && (
                    // justify-between estica a coluna à altura da imagem: 1º botão no topo,
                    // último (✕) alinhado com a BASE da imagem, sem vazar pra fora.
                    <div className="flex flex-col justify-between gap-1.5">
                      <div className="group relative">
                        <button type="button" onClick={() => handleRegerarSlide(selecionado.id, i)} disabled={slideProcessando !== null} className="flex h-8 w-8 items-center justify-center rounded-md border border-linha bg-preto text-sm transition hover:border-vermelho hover:bg-preto-card disabled:opacity-40">✍️</button>
                        <DicaSlide>Regerar texto do slide</DicaSlide>
                      </div>
                      {/* COM texto / SEM texto: some quando o slide não tem foto (o modo "sem texto"
                          mostra a imagem pura, então só faz sentido com uma foto/arte no slide). */}
                      {selecionado.imagensSlides?.[i] && (
                        <div className="group relative">
                          <button type="button" onClick={() => handleAlternarTexto(selecionado.id, i)} disabled={slideProcessando !== null} className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold transition disabled:opacity-40 ${selecionado.semTextoSlides?.[i] ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-linha bg-preto text-muted hover:border-vermelho hover:bg-preto-card"}`}>Aa</button>
                          <DicaSlide>{selecionado.semTextoSlides?.[i] ? "SEM texto (imagem pura) — tocar pra voltar COM os textos" : "Tirar os textos — usar a imagem PURA (a arte que você subiu)"}</DicaSlide>
                        </div>
                      )}
                      {/* Botões de FOTO: só nos slides que usam foto de fundo. A capa de
                          estilo (mosaico/capa-*) tem visual próprio — foto ali não tem efeito. */}
                      {!ehCapaEstilo(selecionado.tiposSlides?.[i]) && (
                        <>
                          <div className="group relative">
                            <button type="button" onClick={() => setSeletorSlide({ id: selecionado.id, indice: i, texto: [selecionado.titulo, selecionado.tema].filter(Boolean).join(" "), atual: selecionado.imagensSlides?.[i] ?? null })} disabled={slideProcessando !== null} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#7c3aed]/50 bg-[#7c3aed]/15 text-sm transition hover:border-[#7c3aed] disabled:opacity-40">🖼️</button>
                            <DicaSlide>Escolher foto do banco</DicaSlide>
                          </div>
                          <div className="group relative">
                            <button type="button" onClick={() => handleBancoSlide(selecionado.id, i)} disabled={slideProcessando !== null} className="flex h-8 w-8 items-center justify-center rounded-md border border-linha bg-preto text-sm transition hover:border-vermelho hover:bg-preto-card disabled:opacity-40">🎲</button>
                            <DicaSlide>Sortear (rodízio)</DicaSlide>
                          </div>
                          <div className="group relative">
                            <button type="button" onClick={() => handleGerarImagem(selecionado.id, i)} disabled={slideProcessando !== null} className="flex h-8 w-8 items-center justify-center rounded-md border border-linha bg-preto text-sm transition hover:border-vermelho hover:bg-preto-card disabled:opacity-40">🤖</button>
                            <DicaSlide>Fundo com IA</DicaSlide>
                          </div>
                          <label className="group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-linha bg-preto text-sm transition hover:border-vermelho hover:bg-preto-card">📤
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImagem(selecionado.id, i, e.target.files?.[0])} />
                            <DicaSlide>Enviar foto</DicaSlide>
                          </label>
                          {selecionado.imagensSlides?.[i] && (
                            <div className="group relative">
                              <button type="button" onClick={() => handleRemoverImagem(selecionado.id, i)} disabled={slideProcessando !== null} className="flex h-8 w-8 items-center justify-center rounded-md border border-red-900/60 bg-preto text-sm text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">✕</button>
                              <DicaSlide>Remover imagem</DicaSlide>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {slideProcessando === i && <p className="mt-1 text-center text-[10px] text-muted">Processando…</p>}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center gap-3">
              <button type="button" onClick={() => setLegendaAberta((v) => !v)} className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted transition hover:text-white"><span>{legendaAberta ? "▾" : "▸"}</span> Legenda + hashtags</button>
              {legendaAberta && !editandoLegenda && (
                <button type="button" onClick={() => { setLegendaEdit(selecionado.legenda); setHashtagsEdit(selecionado.hashtags); setEditandoLegenda(true); }} className="text-[11px] font-semibold text-[#d6c6ff] transition hover:text-white">✏️ Editar</button>
              )}
            </div>
            {legendaAberta && (editandoLegenda ? (
              <div className="space-y-2">
                <textarea value={legendaEdit} onChange={(e) => setLegendaEdit(e.target.value)} rows={5} placeholder="Texto da legenda" className="scroll-bonito w-full rounded-md border border-linha bg-preto p-3 text-sm text-white" />
                <textarea value={hashtagsEdit} onChange={(e) => setHashtagsEdit(e.target.value)} rows={2} placeholder="#hashtags" className="scroll-bonito w-full rounded-md border border-linha bg-preto p-3 text-xs text-white" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={salvandoLegenda}
                    onClick={async () => {
                      setSalvandoLegenda(true);
                      const r = await editarLegendaCarrossel({ id: selecionado.id, legenda: legendaEdit, hashtags: hashtagsEdit });
                      setSalvandoLegenda(false);
                      if (r.ok) { setEditandoLegenda(false); router.refresh(); } else setErro(r.erro);
                    }}
                    className="rounded-lg bg-vermelho px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50"
                  >{salvandoLegenda ? "Salvando…" : "Salvar"}</button>
                  <button type="button" onClick={() => setEditandoLegenda(false)} className="rounded-lg border border-linha px-4 py-1.5 text-sm font-semibold text-muted transition hover:text-white">Cancelar</button>
                </div>
              </div>
            ) : (
              <pre className="scroll-bonito max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-3 text-sm text-white">{selecionado.legenda}{"\n\n"}{selecionado.hashtags}</pre>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => baixarTodas(selecionado)} disabled={baixando} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{baixando ? "Baixando…" : "⬇ Baixar (.zip)"}</button>
            <button onClick={() => copiar(selecionado)} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho">{copiado ? "✓ Copiado!" : "Copiar texto"}</button>
            {selecionado.tema && (
              <button onClick={() => handleRegerar(selecionado)} disabled={isPending} title={selecionado.status === "postado" ? "Já postado — cria um novo ao lado" : "Regerar"} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">↻ Regerar</button>
            )}
            {selecionado.status !== "postado" && (
              <button onClick={() => handlePostar(selecionado)} disabled={postando} className="rounded-lg bg-[#C13584] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">{postando ? "Postando…" : temFacebook ? "📷 Postar (Instagram + Facebook)" : "📷 Postar no Instagram"}</button>
            )}
            <form action={marcarConteudo}>
              <input type="hidden" name="id" value={selecionado.id} />
              <input type="hidden" name="status" value={selecionado.status === "postado" ? "a_postar" : "postado"} />
              <button className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho">{selecionado.status === "postado" ? "Desmarcar postado" : "✓ Marcar postado"}</button>
            </form>
          </div>
          {erroPost && <p className="mt-3 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{erroPost}</p>}
          </div>
        </div>
      )}

      <ConfirmDialog
        aberto={!!postarAlvo}
        titulo={temFacebook ? "Postar no Instagram e Facebook agora?" : "Postar no Instagram agora?"}
        descricao={postarAlvo ? `"${postarAlvo.titulo}" vai ao ar de verdade ${redesTexto}.` : undefined}
        textoConfirmar="Postar agora"
        onConfirmar={() => {
          if (postarAlvo) confirmarPostar(postarAlvo);
          setPostarAlvo(null);
        }}
        onCancelar={() => setPostarAlvo(null)}
      />

      <ConfirmDialog
        aberto={!!regerarPostado}
        titulo="Esse carrossel já está no Instagram"
        descricao="Regenerar NÃO substitui o que já foi postado (o Postaí não edita posts publicados). Quer criar um NOVO carrossel ao lado, pra postar depois? O original fica intacto."
        textoConfirmar="Criar novo ao lado"
        onConfirmar={() => {
          if (regerarPostado) regerarCarr(regerarPostado.id, true);
          setRegerarPostado(null);
        }}
        onCancelar={() => setRegerarPostado(null)}
      />

      <ConfirmDialog
        aberto={!!excluirAlvo}
        titulo="Excluir este carrossel?"
        descricao={excluirAlvo ? `"${excluirAlvo.titulo}" será apagado daqui. (Não remove do Instagram se já foi postado.)` : undefined}
        textoConfirmar="Excluir"
        onConfirmar={() => {
          if (excluirAlvo) confirmarExcluir(excluirAlvo);
          setExcluirAlvo(null);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />

      {seletorSlide && (
        <SeletorImagemBanco
          marcaId={marcaId}
          texto={seletorSlide.texto}
          atual={seletorSlide.atual}
          onEscolher={(url) => handleEscolherSlide(seletorSlide.id, seletorSlide.indice, url)}
          onFechar={() => setSeletorSlide(null)}
        />
      )}
    </div>
  );
}
