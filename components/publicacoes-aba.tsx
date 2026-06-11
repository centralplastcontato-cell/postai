"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPublicacao,
  regerarPublicacao,
  regerarComoNova,
  postarPublicacao,
  excluirPublicacao,
  gerarImagemPublicacao,
  definirImagemPublicacao,
  removerImagemPublicacao,
  sugerirDiferenciais,
  sugerirPromocao,
} from "@/app/actions/feed";
import { sortearImagemBancoAction } from "@/app/actions/imagens";
import { TEMPLATES, TEMPLATE_LABEL, type Template } from "@/lib/feed-templates";
import { CATEGORIAS, CATEGORIA_LABEL } from "@/lib/categorias-imagem";
import { parsePaleta, coresDeFundo } from "@/lib/cores-fundo";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { ConfirmDialog } from "./confirm-dialog";

type Confirmacao = { titulo: string; descricao?: string; textoConfirmar: string; acao: () => void };

// Modelos prontos de Divulgação/Institucional (clique preenche Assunto + Diferenciais).
// Tom do Castelo da Diversão (buffet infantil) — o dono ajusta o que quiser.
const MODELOS_DIVULGACAO: { rotulo: string; assunto: string; diferenciais: string[] }[] = [
  { rotulo: "🏰 Experiência completa", assunto: "a festa dos sonhos do seu filho", diferenciais: ["Monitores treinados", "Buffet completo e fresquinho", "Brinquedos pra toda idade", "Ambiente seguro e limpo"] },
  { rotulo: "🛡️ Segurança", assunto: "diversão com segurança pra você relaxar", diferenciais: ["Equipe atenta o tempo todo", "Espaço climatizado", "Brinquedos higienizados", "Área confortável pros pais"] },
  { rotulo: "😌 Tudo incluso", assunto: "você comemora, a gente cuida de tudo", diferenciais: ["Decoração temática inclusa", "Cardápio que as crianças amam", "Som e animação", "Limpeza por nossa conta"] },
  { rotulo: "✨ Memórias", assunto: "momentos que viram lembrança pra vida toda", diferenciais: ["Recreação animada", "Atendimento caloroso", "Festa do tamanho do seu sonho", "Sorriso garantido da criançada"] },
  { rotulo: "⭐ Confiança", assunto: "famílias que confiam e sempre voltam", diferenciais: ["Experiência comprovada", "Famílias que voltam sempre", "Equipe apaixonada pelo que faz", "Cada detalhe pensado com carinho"] },
  { rotulo: "🎨 Personalização", assunto: "cada festa do jeitinho que vocês sonham", diferenciais: ["Temas personalizados", "Pacotes flexíveis", "Do intimista ao grande", "Orçamento sem compromisso"] },
  { rotulo: "🏰 Estrutura completa", assunto: "uma estrutura pensada nos mínimos detalhes", diferenciais: ["Espaço amplo e climatizado", "Brinquedos pra toda idade", "Área exclusiva pros pais", "Estacionamento fácil"] },
  { rotulo: "🍔 Buffet que agrada", assunto: "comida boa que criança e adulto aprovam", diferenciais: ["Cardápio variado", "Salgados fresquinhos", "Opções pros adultos", "Bolo e doces inclusos"] },
  { rotulo: "💸 Custo-benefício", assunto: "festa completa que cabe no seu bolso", diferenciais: ["Pacotes que cabem no bolso", "Tudo incluso, sem surpresa", "Parcelamento facilitado", "Você economiza tempo"] },
  { rotulo: "🤝 Atendimento", assunto: "um atendimento que cuida de cada detalhe", diferenciais: ["Equipe atenciosa", "Resposta rápida", "Acompanhamento do início ao fim", "Você relaxa, a gente resolve"] },
  { rotulo: "🧼 Higiene", assunto: "limpeza e higiene em primeiro lugar", diferenciais: ["Brinquedos higienizados", "Ambiente sempre limpo", "Equipe treinada", "Segurança pra criançada"] },
  { rotulo: "🎉 Diversão sem fim", assunto: "diversão garantida do começo ao fim", diferenciais: ["Recreação animada", "Brinquedos incríveis", "Monitores dedicados", "Sorriso garantido"] },
];

// Modelos prontos de Promoção/Oferta (clique preenche oferta/validade/incluso/regras).
// Pontos de partida pra buffet infantil — o dono ajusta números e condições.
const MODELOS_PROMOCAO: { rotulo: string; assunto: string; oferta: string; validade: string; inclui: string[]; regras: string }[] = [
  { rotulo: "🎉 Crianças grátis", assunto: "oferta de crianças grátis na festa", oferta: "10 CRIANÇAS GRÁTIS", validade: "Para contratos fechados este mês", inclui: ["2h de salão exclusivo", "Monitores de recreação", "Decoração temática"], regras: "Mediante reserva · não cumulativo" },
  { rotulo: "💰 Desconto à vista", assunto: "condição especial para pagamento à vista", oferta: "10% OFF À VISTA", validade: "Pagamento à vista", inclui: ["Pacote completo de festa", "Buffet incluso", "Equipe de apoio"], regras: "Não cumulativo com outras ofertas" },
  { rotulo: "📅 Especial de férias", assunto: "oportunidade especial para festas nas férias", oferta: "CONDIÇÃO ESPECIAL DE FÉRIAS", validade: "Datas de julho", inclui: ["Salão decorado", "Brinquedos liberados", "Monitores inclusos"], regras: "Sujeito à disponibilidade de data" },
  { rotulo: "🏃 Últimas datas", assunto: "urgência: poucas datas disponíveis no mês", oferta: "ÚLTIMAS DATAS DO MÊS", validade: "Enquanto houver vaga", inclui: ["Festa completa", "Decoração temática", "Recreação animada"], regras: "Mediante disponibilidade" },
  { rotulo: "🎁 Brinde especial", assunto: "um brinde especial pra quem fechar a festa", oferta: "GANHE UM BRINDE ESPECIAL", validade: "Contratos deste mês", inclui: ["Bolo cenográfico", "Lembrancinhas", "Decoração temática"], regras: "Mediante reserva confirmada" },
  { rotulo: "👶 Primeira festa", assunto: "pacote especial para a primeira festa do bebê", oferta: "PACOTE PRIMEIRO ANINHO", validade: "Consulte datas", inclui: ["Decoração de smash the cake", "Espaço baby seguro", "Buffet completo"], regras: "Sob consulta de disponibilidade" },
  { rotulo: "🤝 Indique e ganhe", assunto: "indique um amigo e ganhe um benefício", oferta: "INDIQUE E GANHE", validade: "Indicação que fechar festa", inclui: ["Desconto na sua próxima festa", "Brinde especial", "Atendimento VIP"], regras: "Válido após a festa indicada ser realizada" },
];

// Modelos prontos de Dica/Conteúdo (clique preenche o Assunto E a categoria da foto;
// a IA escreve a dica e a foto vem da categoria certa do banco — ex: cardápio → comida).
// Temas úteis pro público de um buffet infantil — o dono ajusta o que quiser.
const MODELOS_DICA: { rotulo: string; assunto: string; categoria: string }[] = [
  { rotulo: "🎠 Brinquedos", assunto: "as atrações e brinquedos que fazem a festa ser inesquecível", categoria: "brinquedos" },
  { rotulo: "👶 Por idade", assunto: "brincadeiras e atrações ideais para cada idade na festa", categoria: "brinquedos" },
  { rotulo: "🍰 Cardápio", assunto: "como montar um cardápio que agrada crianças e adultos", categoria: "comida" },
  { rotulo: "🏰 Conheça o espaço", assunto: "o que torna o nosso espaço perfeito para a festa do seu filho", categoria: "espaco" },
  { rotulo: "🎈 Escolher o tema", assunto: "como escolher o tema da festa do jeito que a criança ama", categoria: "festa" },
  { rotulo: "🎂 Planejar a festa", assunto: "como organizar a festa infantil com antecedência e sem stress", categoria: "festa" },
  { rotulo: "📋 Checklist", assunto: "o que não pode faltar numa festa infantil de sucesso", categoria: "festa" },
  { rotulo: "🎁 Lembrancinhas", assunto: "ideias de lembrancinhas que encantam a criançada", categoria: "festa" },
  { rotulo: "😌 Buffet x casa", assunto: "vantagens de comemorar no buffet em vez de fazer em casa", categoria: "espaco" },
  { rotulo: "📅 Melhor data", assunto: "como escolher o melhor dia e horário para a festa", categoria: "geral" },
];

// Modelos prontos de Mosaico (capa "mostre seu espaço" com fotos reais).
// Clique preenche o título (tema), o selo opcional e de qual categoria puxar as fotos.
const MODELOS_MOSAICO: { rotulo: string; assunto: string; oferta: string; validade: string; categoria: string }[] = [
  { rotulo: "🏰 Conheça o espaço", assunto: "Conheça nosso espaço", oferta: "", validade: "", categoria: "geral" },
  { rotulo: "📅 Especial de férias", assunto: "Especial de Férias", oferta: "CONDIÇÃO ESPECIAL", validade: "Datas de julho", categoria: "geral" },
  { rotulo: "🎠 Nossos brinquedos", assunto: "Diversão garantida", oferta: "", validade: "", categoria: "brinquedos" },
  { rotulo: "🎉 Festas inesquecíveis", assunto: "Festas inesquecíveis", oferta: "", validade: "", categoria: "festa" },
  { rotulo: "🍰 Nosso buffet", assunto: "Buffet que agrada", oferta: "", validade: "", categoria: "comida" },
  { rotulo: "✨ Agende uma visita", assunto: "Venha nos visitar", oferta: "AGENDE SUA VISITA", validade: "", categoria: "espaco" },
];

export type PublicacaoView = {
  id: string;
  slug: string;
  data: string;
  template: string;
  titulo: string;
  texto: string;
  legenda: string;
  hashtags: string;
  imagemUrl: string | null;
  status: string;
  tema: string | null;
  categoria?: string | null; // categoria do banco pra foto (template dica)
};

function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// Chave do dia (YYYY-MM-DD) no fuso de SP — pra casar com o dia clicado no calendário.
function chaveDiaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const POR_PAGINA = 6;

export function PublicacoesAba({
  marcaId,
  publicacoes,
  destacarId,
  dataAlvo,
  onGerado,
  onLimparDia,
  paleta,
}: {
  marcaId: string;
  publicacoes: PublicacaoView[];
  destacarId?: string | null;
  dataAlvo?: string | null;
  onGerado?: () => void;
  onLimparDia?: () => void;
  paleta?: string; // JSON array de hex da marca (pro seletor de cor de fundo)
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [template, setTemplate] = useState<Template>("dica");
  const [tema, setTema] = useState("");
  const [oferta, setOferta] = useState("");
  const [validade, setValidade] = useState("");
  const [inclui, setInclui] = useState("");
  const [regras, setRegras] = useState("");
  const [diferenciais, setDiferenciais] = useState("");
  const [categoriaFoto, setCategoriaFoto] = useState("geral");
  const [corFundo, setCorFundo] = useState(""); // "" = automático (sorteia da paleta)
  const [sugerindo, setSugerindo] = useState(false);
  // Cores da marca que servem de fundo (escuras). Vazio se a marca não tem paleta.
  const coresFundo = coresDeFundo(parsePaleta(paleta));
  // Templates de fundo COLORIDO (onde escolher a cor faz sentido — os com foto não).
  const TEMPLATES_COR = ["promocao", "divulgacao", "data-comemorativa", "mosaico"];
  const [erro, setErro] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  // Volta pra página 1 quando muda o filtro de dia ou a lista cresce/encolhe.
  useEffect(() => { setPagina(1); }, [dataAlvo, publicacoes.length]);
  // Filtro por dia (clicar num dia do calendário) + paginação, pra não virar
  // rolagem infinita no mobile. Sem dia = mostra tudo, de POR_PAGINA em POR_PAGINA.
  const filtradas = dataAlvo ? publicacoes.filter((p) => chaveDiaSP(p.data) === dataAlvo) : publicacoes;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagAtual = Math.min(pagina, totalPaginas);
  const visiveis = dataAlvo ? filtradas : filtradas.slice((pagAtual - 1) * POR_PAGINA, pagAtual * POR_PAGINA);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [legendaAbertaId, setLegendaAbertaId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const comemorativa = dataAlvo ? dataComemorativaDe(dataAlvo) : null;

  function usarTemplateData() {
    if (!comemorativa) return;
    setTemplate("data-comemorativa");
    if (comemorativa.sugestao) setTema(comemorativa.sugestao);
  }

  function handleGerar() {
    setErro(null);
    startTransition(async () => {
      const itens = inclui.split("\n").map((s) => s.trim()).filter(Boolean);
      const difs = diferenciais.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await gerarPublicacao({ marcaId, template, tema, data: dataAlvo ?? undefined, oferta, validade, inclui: itens, regras, diferenciais: difs, categoria: template === "dica" || template === "mosaico" ? categoriaFoto : undefined, corFundo: TEMPLATES_COR.includes(template) ? corFundo : undefined });
      if (r.ok) {
        setTema("");
        setOferta("");
        setValidade("");
        setInclui("");
        setRegras("");
        setDiferenciais("");
        setCategoriaFoto("geral");
        setCorFundo("");
        onGerado?.();
        router.refresh();
      } else setErro(r.erro);
    });
  }
  async function handleVariarDiferenciais() {
    setErro(null);
    setSugerindo(true);
    try {
      const r = await sugerirDiferenciais(marcaId, tema);
      if (r.ok) setDiferenciais(r.diferenciais.join("\n"));
      else setErro(r.erro);
    } finally {
      setSugerindo(false);
    }
  }
  async function handleVariarPromocao() {
    setErro(null);
    setSugerindo(true);
    try {
      const r = await sugerirPromocao(marcaId, tema);
      if (r.ok) {
        setOferta(r.oferta);
        setValidade(r.validade);
        setInclui(r.inclui.join("\n"));
        setRegras(r.regras);
      } else setErro(r.erro);
    } finally {
      setSugerindo(false);
    }
  }
  function regerar(id: string, comoNova: boolean) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = comoNova ? await regerarComoNova(id) : await regerarPublicacao(id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleRegerar(p: PublicacaoView) {
    // Post já no Instagram: não sobrescreve (não muda lá). Avisa e cria uma NOVA ao lado.
    if (p.status === "postado") {
      setConfirmacao({
        titulo: "Essa publicação já está no Instagram",
        descricao: "Regenerar NÃO substitui a que já foi postada (o Postaí não edita posts publicados). Quer criar uma NOVA versão ao lado, pra postar depois? A original fica intacta.",
        textoConfirmar: "Criar nova versão",
        acao: () => regerar(p.id, true),
      });
      return;
    }
    regerar(p.id, false);
  }
  function handleExcluir(id: string) {
    setConfirmacao({
      titulo: "Excluir esta publicação?",
      descricao: "A ação não pode ser desfeita.",
      textoConfirmar: "Excluir",
      acao: () =>
        startTransition(async () => {
          const r = await excluirPublicacao(id);
          if (!r.ok) setErro(r.erro);
          router.refresh();
        }),
    });
  }
  function handlePostar(p: PublicacaoView) {
    setConfirmacao({
      titulo: "Postar no Instagram agora?",
      descricao: `"${p.titulo}" vai ao ar de verdade no perfil da marca.`,
      textoConfirmar: "Postar agora",
      acao: async () => {
        setProc(p.id);
        try {
          const r = await postarPublicacao(p.id);
          if (!r.ok) setErro(r.erro);
          router.refresh();
        } finally {
          setProc(null);
        }
      },
    });
  }
  function handleGerarImagem(id: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await gerarImagemPublicacao({ id });
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleBanco(id: string, categoria?: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await sortearImagemBancoAction(marcaId, categoria);
      if (!r.ok) {
        setErro(r.erro);
        setProc(null);
        return;
      }
      const d = await definirImagemPublicacao({ id, url: r.url });
      if (!d.ok) setErro(d.erro);
      router.refresh();
      setProc(null);
    });
  }
  async function handleUpload(id: string, file: File | undefined) {
    if (!file) return;
    setProc(id);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Falha no upload.");
        return;
      }
      const r = await definirImagemPublicacao({ id, url: data.url });
      if (!r.ok) setErro(r.erro);
      router.refresh();
    } finally {
      setProc(null);
    }
  }
  function handleRemoverImagem(id: string) {
    setProc(id);
    startTransition(async () => {
      const r = await removerImagemPublicacao(id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function copiar(p: PublicacaoView) {
    navigator.clipboard.writeText(`${p.legenda}\n\n${p.hashtags}`);
    setCopiadoId(p.id);
    setTimeout(() => setCopiadoId(null), 2000);
  }

  return (
    <div>
      {imgExpandida && (
        <div onClick={() => setImgExpandida(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgExpandida} alt="Arte" className="h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-lg border border-linha" />
          <button onClick={() => setImgExpandida(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="mb-1 text-sm font-semibold text-white">Gerar publicação (feed) com IA</p>
        <p className="mb-3 text-xs text-muted">Post de imagem única, no tom da marca. Sem escolher dia, cai na próxima data livre da agenda.</p>

        <div className="mb-3 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t} type="button" onClick={() => setTemplate(t)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${template === t ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`}>
              {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="mb-3 text-xs text-muted">
          Dia do post
          <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
            {dataAlvo ? (
              <span className="font-semibold text-white">📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)}</span>
            ) : (
              <span className="text-muted">Clique num dia livre no calendário ↑ (senão, vai pra próxima data livre da agenda)</span>
            )}
          </div>
        </div>

        {comemorativa && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-yellow-400/40 bg-yellow-400/5 px-3 py-2.5">
            <span className="text-sm text-yellow-100">
              {comemorativa.emoji} Esse dia é <strong className="font-semibold text-yellow-200">{comemorativa.nome}</strong>. Quer fazer um post da data?
            </span>
            {template === "data-comemorativa" ? (
              <span className="text-xs font-semibold text-green-300">✓ usando o template de data comemorativa</span>
            ) : (
              <button type="button" onClick={usarTemplateData} className="rounded-md border border-yellow-400/60 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-100 transition hover:bg-yellow-400/20">
                🥳 Usar template Data Comemorativa
              </button>
            )}
          </div>
        )}

        {template === "promocao" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique pra preencher)</p>
            <div className="flex flex-wrap gap-2">
              {MODELOS_PROMOCAO.map((m) => (
                <button
                  key={m.rotulo}
                  type="button"
                  onClick={() => { setTema(m.assunto); setOferta(m.oferta); setValidade(m.validade); setInclui(m.inclui.join("\n")); setRegras(m.regras); }}
                  className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white"
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          </div>
        )}

        {template === "promocao" && (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              Oferta / destaque
              <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex: 20% OFF, 10 crianças grátis" className="input-base" />
            </label>
            <label className="text-xs text-muted">
              Validade / condição
              <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: Válido até 30/06" className="input-base" />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              <span className="flex items-center justify-between gap-2">
                <span>O que está incluso <span className="text-muted/70">(um item por linha — aparece como lista na arte)</span></span>
                <button
                  type="button"
                  onClick={handleVariarPromocao}
                  disabled={sugerindo}
                  title="Deixa a IA criar uma ideia de oferta completa a partir do assunto/ocasião — você revisa antes de postar"
                  className="shrink-0 rounded-md border border-linha px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40"
                >
                  {sugerindo ? "Gerando…" : "🔄 Variar com IA"}
                </button>
              </span>
              <textarea value={inclui} onChange={(e) => setInclui(e.target.value)} rows={4} placeholder={"Ex:\n2h de salão\nMonitor incluso\nDecoração temática"} className="input-base resize-y" />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              Regras / condições <span className="text-muted/70">(letras miúdas no rodapé)</span>
              <input value={regras} onChange={(e) => setRegras(e.target.value)} placeholder="Ex: Válido seg a qui, mediante reserva, não cumulativo" className="input-base" />
            </label>
            <p className="text-[11px] text-amber-400/90 sm:col-span-2">⚠ Oferta vazia: a IA sugere — confira antes de postar. Itens inclusos e regras são só seus (a IA não inventa).</p>
          </div>
        )}

        {template === "divulgacao" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique pra preencher)</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MODELOS_DIVULGACAO.map((m) => (
                <button
                  key={m.rotulo}
                  type="button"
                  onClick={() => { setTema(m.assunto); setDiferenciais(m.diferenciais.join("\n")); }}
                  className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white"
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted">
              <span className="flex items-center justify-between gap-2">
                <span>Diferenciais <span className="text-muted/70">(um por linha — viram a lista de “por que escolher”, máx. 4)</span></span>
                <button
                  type="button"
                  onClick={handleVariarDiferenciais}
                  disabled={sugerindo}
                  title="Deixa a IA escrever/variar os diferenciais a partir do assunto escolhido"
                  className="shrink-0 rounded-md border border-linha px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40"
                >
                  {sugerindo ? "Gerando…" : "🔄 Variar com IA"}
                </button>
              </span>
              <textarea value={diferenciais} onChange={(e) => setDiferenciais(e.target.value)} rows={4} placeholder={"Ex:\nMonitores treinados\nBuffet completo\nDecoração temática"} className="input-base resize-y" />
            </label>
            <p className="mt-1 text-[11px] text-amber-400/90">⚠ Se deixar vazio, a IA sugere os diferenciais — confira antes de postar. Use “🔄 Variar com IA” pra gerar versões novas do assunto escolhido.</p>
          </div>
        )}

        {template === "dica" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique preenche o assunto + a foto certa)</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MODELOS_DICA.map((m) => (
                <button
                  key={m.rotulo}
                  type="button"
                  onClick={() => { setTema(m.assunto); setCategoriaFoto(m.categoria); }}
                  className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white"
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted">
              Foto do banco <span className="text-muted/70">(de qual categoria puxar a imagem real)</span>
              <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
              </select>
            </label>
          </div>
        )}

        {template === "mosaico" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique preenche título, selo e a categoria das fotos)</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MODELOS_MOSAICO.map((m) => (
                <button
                  key={m.rotulo}
                  type="button"
                  onClick={() => { setTema(m.assunto); setOferta(m.oferta); setValidade(m.validade); setCategoriaFoto(m.categoria); }}
                  className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white"
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Selo / destaque <span className="text-muted/70">(opcional — carimbo na arte)</span>
                <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex: CONDIÇÃO ESPECIAL" className="input-base" />
              </label>
              <label className="text-xs text-muted">
                Período / condição <span className="text-muted/70">(opcional)</span>
                <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: Datas de julho" className="input-base" />
              </label>
              <label className="text-xs text-muted sm:col-span-2">
                Fotos do banco <span className="text-muted/70">(de qual categoria puxar as 4 fotos reais)</span>
                <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-1 text-[11px] text-amber-400/90">🖼️ Usa 4 fotos REAIS do seu Banco de Imagens (em rodízio). Suba fotos na aba <strong>Imagens</strong> se ainda não tiver. Selo/período vazios = sem carimbo.</p>
          </div>
        )}

        {/* Seletor de cor de fundo — só pros templates de fundo colorido e se a marca tem paleta */}
        {TEMPLATES_COR.includes(template) && coresFundo.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">🎨 Cor de fundo</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCorFundo("")}
                title="A cor é sorteada da paleta da marca a cada post"
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${corFundo === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}
              >
                🎲 Automático
              </button>
              {coresFundo.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCorFundo(c)}
                  title={c}
                  aria-label={`Cor ${c}`}
                  className={`h-9 w-9 rounded-lg border-2 transition ${corFundo.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs text-muted">
            Assunto (opcional — se vazio, a IA escolhe)
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: novidade da semana" className="input-base" />
          </label>
          <button onClick={handleGerar} disabled={isPending} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar"}
          </button>
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      </div>

      {/* Filtro por dia + paginação (clique num dia do calendário pra ver só ele) */}
      {publicacoes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {dataAlvo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
              📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)} · só esse dia
            </span>
          ) : (
            <span className="text-xs text-muted">{filtradas.length} {filtradas.length === 1 ? "publicação" : "publicações"}</span>
          )}
          {dataAlvo ? (
            <button type="button" onClick={() => onLimparDia?.()} className="rounded-md border border-linha px-3 py-1 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">📋 Ver todas</button>
          ) : totalPaginas > 1 ? (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagAtual <= 1} className="rounded-md border border-linha px-2.5 py-1 text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">◀</button>
              <span className="text-muted">Página {pagAtual}/{totalPaginas}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagAtual >= totalPaginas} className="rounded-md border border-linha px-2.5 py-1 text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">▶</button>
            </div>
          ) : null}
        </div>
      )}

      {publicacoes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhuma publicação ainda. Escolha um template acima e clique em Gerar.</p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhuma publicação nesse dia. <button type="button" onClick={() => onLimparDia?.()} className="font-semibold text-sky-300 underline">Ver todas</button> ou gere uma acima.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((p) => {
            const v = hashCurto(`${p.titulo}|${p.texto}|${p.imagemUrl ?? ""}`);
            const arte = `/api/feed/${p.id}?v=${v}`;
            const postado = p.status === "postado";
            const ocupado = proc === p.id;
            return (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-preto-card p-3 ${destacarId === p.id ? "border-sky-500 ring-2 ring-sky-500/50" : "border-linha"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{dataBR(p.data)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "Postado" : "A postar"}</span>
                </div>
                <button type="button" onClick={() => setImgExpandida(arte)} title="Ampliar" className="overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={arte} alt={p.titulo} className="aspect-[4/5] w-full object-cover" />
                </button>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">{TEMPLATE_LABEL[p.template as Template] ?? p.template}</p>
                <p className="line-clamp-2 text-sm text-white">{p.titulo}</p>

                <div className="mt-2">
                  <button type="button" onClick={() => setLegendaAbertaId((c) => (c === p.id ? null : p.id))} className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted transition hover:text-white">
                    <span>{legendaAbertaId === p.id ? "▾" : "▸"}</span> Legenda + hashtags
                  </button>
                  {legendaAbertaId === p.id && (
                    <pre className="scroll-bonito mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-2.5 text-xs text-white">{p.legenda}{p.hashtags ? `\n\n${p.hashtags}` : ""}</pre>
                  )}
                </div>

                {ocupado && <p className="mt-1 text-[11px] text-muted">Processando…</p>}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button onClick={() => handleRegerar(p)} disabled={ocupado} title={postado ? "Já postado — cria uma nova versão ao lado" : "Regerar texto"} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻ Regerar</button>
                  <a href={arte} download={`feed-${p.slug}.png`} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">⬇ Baixar</a>
                  <button onClick={() => copiar(p)} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{copiadoId === p.id ? "✓ Copiado" : "Copiar texto"}</button>
                  <button onClick={() => handleBanco(p.id, p.categoria ?? undefined)} disabled={ocupado} title="Sortear foto real do seu banco de imagens" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🎲 Banco</button>
                  <button onClick={() => handleGerarImagem(p.id)} disabled={ocupado} title="Fundo decorativo abstrato com IA (não mostra ambiente real)" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🖼️ IA</button>
                  <label className="cursor-pointer rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">
                    📤 Foto
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(p.id, e.target.files?.[0])} />
                  </label>
                  {p.imagemUrl && (
                    <button onClick={() => handleRemoverImagem(p.id)} disabled={ocupado} title="Remover foto de fundo" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">✕ Foto</button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!postado && (
                    <button onClick={() => handlePostar(p)} disabled={ocupado} className="rounded-md bg-[#C13584] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📷 Postar</button>
                  )}
                  <button onClick={() => handleExcluir(p.id)} disabled={ocupado} className="rounded-md border border-red-900 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação no rodapé (só quando mostrando todas e há mais de uma página) */}
      {!dataAlvo && totalPaginas > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagAtual <= 1} className="rounded-md border border-linha px-3 py-1.5 font-semibold text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">◀ Anterior</button>
          <span className="text-muted">Página {pagAtual} de {totalPaginas}</span>
          <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagAtual >= totalPaginas} className="rounded-md border border-linha px-3 py-1.5 font-semibold text-muted transition hover:border-vermelho hover:text-white disabled:opacity-30">Próxima ▶</button>
        </div>
      )}

      <ConfirmDialog
        aberto={!!confirmacao}
        titulo={confirmacao?.titulo ?? ""}
        descricao={confirmacao?.descricao}
        textoConfirmar={confirmacao?.textoConfirmar ?? "Confirmar"}
        onConfirmar={() => {
          confirmacao?.acao();
          setConfirmacao(null);
        }}
        onCancelar={() => setConfirmacao(null)}
      />
    </div>
  );
}
