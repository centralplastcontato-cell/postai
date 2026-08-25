"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPublicacao,
  regerarPublicacao,
  regerarComoNova,
  alternarAprovacao,
  postarPublicacao,
  postarStoryDoFeed,
  excluirPublicacao,
  gerarImagemPublicacao,
  definirImagemPublicacao,
  aplicarArteFeed,
  definirLayoutData,
  definirMascoteCanto,
  definirMascoteTam,
  definirLogoCanto,
  definirLogoTam,
  removerImagemPublicacao,
  sugerirDiferenciais,
  sugerirPromocao,
  sugerirDepoimento,
  editarPublicacao,
  reagendarPublicacao,
  remarcarPublicacao,
  definirEspelhar,
} from "@/app/actions/feed";
import { sortearImagemBancoAction } from "@/app/actions/imagens";
import { SeletorImagemBanco } from "./seletor-imagem-banco";
import { TEMPLATES, TEMPLATE_LABEL, templateUsaFotoFundo, type Template } from "@/lib/feed-templates";
import { CATEGORIAS, CATEGORIA_LABEL } from "@/lib/categorias-imagem";
import { parsePaleta, paletaComExtras, CORES_EXTRAS } from "@/lib/cores-fundo";
import { SeloEngajamento } from "./selo-engajamento";
import { EtiquetaCategoria } from "./etiqueta-categoria";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { ConfirmDialog } from "./confirm-dialog";
import { CaixaPostando } from "./caixa-postando";
import { rotuloHora } from "@/lib/horarios";
import { type SugestaoBia } from "@/lib/inteligencia";
import { tokenArte } from "@/lib/arte-token";

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

// Modelos prontos de Enquete/VS (clique preenche os dois lados + a categoria da foto).
// Enquetes pra ENGAJAR: o público comenta qual lado prefere (ótimo pra a inteligência da Bia).
const MODELOS_ENQUETE: { rotulo: string; assunto: string; ladoA: string; ladoB: string; categoria: string }[] = [
  { rotulo: "🍕 Salgado x Doce", assunto: "batalha salgados vs docinhos", ladoA: "Salgados", ladoB: "Docinhos", categoria: "comida" },
  { rotulo: "🤸 Pula-pula x Piscina", assunto: "qual brinquedo é o melhor", ladoA: "Pula-pula", ladoB: "Piscina de bolinhas", categoria: "brinquedos" },
  { rotulo: "🎀 Princesas x Heróis", assunto: "tema de festa preferido", ladoA: "Princesas", ladoB: "Heróis", categoria: "festa" },
  { rotulo: "🍫 Brigadeiro x Beijinho", assunto: "doce favorito da festa", ladoA: "Brigadeiro", ladoB: "Beijinho", categoria: "comida" },
  { rotulo: "🎂 Bolo x Doces", assunto: "o que você ataca primeiro na festa", ladoA: "Bolo", ladoB: "Doces", categoria: "comida" },
  { rotulo: "🦸 Homem-Aranha x Batman", assunto: "herói favorito da criançada", ladoA: "Homem-Aranha", ladoB: "Batman", categoria: "festa" },
  { rotulo: "👸 Elsa x Moana", assunto: "princesa favorita pra festa", ladoA: "Elsa", ladoB: "Moana", categoria: "festa" },
  { rotulo: "🦄 Unicórnio x Dinossauro", assunto: "tema de festa mais pedido", ladoA: "Unicórnio", ladoB: "Dinossauro", categoria: "festa" },
  { rotulo: "🚗 Carros x Dinossauros", assunto: "tema de menino favorito", ladoA: "Carros", ladoB: "Dinossauros", categoria: "festa" },
  { rotulo: "🍔 Hambúrguer x Cachorro-quente", assunto: "lanche preferido da festa", ladoA: "Hambúrguer", ladoB: "Cachorro-quente", categoria: "comida" },
  { rotulo: "🍿 Pipoca x Algodão-doce", assunto: "guloseima favorita da festa", ladoA: "Pipoca", ladoB: "Algodão-doce", categoria: "comida" },
  { rotulo: "🧃 Suco x Refrigerante", assunto: "o que servir pra criançada", ladoA: "Suco natural", ladoB: "Refrigerante", categoria: "comida" },
  { rotulo: "🍨 Chocolate x Morango", assunto: "sabor de bolo favorito", ladoA: "Bolo de chocolate", ladoB: "Bolo de morango", categoria: "comida" },
  { rotulo: "🎮 Videogame x Pebolim", assunto: "brinquedo favorito da galera", ladoA: "Videogame", ladoB: "Pebolim", categoria: "brinquedos" },
  { rotulo: "🕺 Pista de dança x Karaokê", assunto: "atração que mais anima a festa", ladoA: "Pista de dança", ladoB: "Karaokê", categoria: "brinquedos" },
  { rotulo: "🧸 Área baby x Área kids", assunto: "onde a criançada curte mais", ladoA: "Área baby", ladoB: "Área kids", categoria: "brinquedos" },
  { rotulo: "☀️ Festa de dia x Festa de noite", assunto: "melhor horário pra comemorar", ladoA: "Festa de dia", ladoB: "Festa de noite", categoria: "espaco" },
  { rotulo: "🎈 Festa grande x Festa intimista", assunto: "estilo de festa preferido", ladoA: "Festa grande", ladoB: "Festa intimista", categoria: "festa" },
];

// Modelos prontos de Vitrine (clique preenche o assunto + a categoria das 6 fotos).
const MODELOS_VITRINE: { rotulo: string; assunto: string; categoria: string }[] = [
  { rotulo: "🍱 Comidinhas deliciosas", assunto: "as comidinhas deliciosas do buffet", categoria: "comida" },
  { rotulo: "🎠 Nossos brinquedos", assunto: "os brinquedos e atrações que a criançada ama", categoria: "brinquedos" },
  { rotulo: "🏰 Conheça o espaço", assunto: "conheça o nosso espaço completo", categoria: "espaco" },
  { rotulo: "🎉 Festas inesquecíveis", assunto: "festas inesquecíveis que rolaram aqui", categoria: "festa" },
  { rotulo: "🍰 Mesa de doces", assunto: "a nossa mesa de doces", categoria: "comida" },
  { rotulo: "✨ Tudo que oferecemos", assunto: "tudo que a sua festa tem aqui", categoria: "geral" },
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
  formato?: string; // "feed" | "story" | "reels"
  videoUrl?: string | null; // URL do vídeo (quando formato="reels")
  capaReel?: string | null; // foto da festa pra mostrar no card de Reels quando o vídeo foi arquivado
  status: string;
  tema: string | null;
  aprovado: boolean; // revisão interna do dono (não vai pra rede)
  postadoEm?: string | null; // ISO do momento real da publicação (null = não postado)
  extra?: string | null; // JSON dos campos do template (pra pré-preencher a edição)
  categoria?: string | null; // categoria do banco pra foto (template dica)
  categoriaIntencao?: string | null; // categoria de INTENÇÃO (etiqueta + inteligência) — ≠ foto do banco
  espelhar?: boolean | null; // override do espelho no Story (null = usa o padrão da marca)
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

// Hora (0-23) de uma data ISO no fuso de São Paulo — pro seletor de hora do card.
function horaSP(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso));
  return parseInt(h, 10) || 0;
}
// Date ISO → "aaaa-mm-dd" (fuso SP) pro seletor de data (InputDataBR).
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
  horaPadrao,
  onGerado,
  onLimparDia,
  paleta,
  temFacebook,
  espelharStoryPadrao,
  sugestao,
  feedArtes,
  temMascote,
  temLogo,
}: {
  marcaId: string;
  publicacoes: PublicacaoView[];
  destacarId?: string | null;
  dataAlvo?: string | null;
  horaPadrao: number; // hora padrão do feed (BRT) — default do seletor de hora
  onGerado?: (dia?: string) => void;
  onLimparDia?: () => void;
  paleta?: string; // JSON array de hex da marca (pro seletor de cor de fundo)
  temFacebook?: boolean; // posta também no Facebook → reflete na caixinha "Estamos postando"
  espelharStoryPadrao?: boolean; // padrão da marca pra espelhar o feed no Story
  sugestao?: SugestaoBia | null; // sugestão da Bia pro próximo post (banner no gerador)
  feedArtes?: string[]; // biblioteca de artes de fundo (IA) já geradas pra marca, pra reusar
  temMascote?: boolean; // a marca tem um mascote oficial → mostra o controle de mascote no card
  temLogo?: boolean; // a marca tem logo → mostra o controle de posição/tamanho do logo no card
}) {
  const router = useRouter();
  // Gerador colapsável CONTEXTUAL: vem RECOLHIDO quando o dia (ou a lista) já tem publicação —
  // foca no que existe; ABERTO quando está vazio — foca em criar a 1ª. Re-sincroniza ao trocar
  // de dia. O usuário pode abrir/fechar na mão a qualquer momento (botão ▾/▸).
  const temPubsNoContexto = (dataAlvo ? publicacoes.filter((p) => chaveDiaSP(p.data) === dataAlvo) : publicacoes).length > 0;
  const [geradorAberto, setGeradorAberto] = useState(!temPubsNoContexto);
  useEffect(() => {
    setGeradorAberto(!(dataAlvo ? publicacoes.filter((p) => chaveDiaSP(p.data) === dataAlvo) : publicacoes).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAlvo]);
  const gerador = { aberto: geradorAberto, alternar: () => setGeradorAberto((a) => !a) };
  const redesTexto = temFacebook ? "no Instagram e Facebook" : "no Instagram";
  const [isPending, startTransition] = useTransition();
  const [template, setTemplate] = useState<Template>("dica");
  const [hora, setHora] = useState(horaPadrao); // hora do post (BRT) — vários no mesmo dia
  // Dia escolhido À MÃO no formulário (o Victor pediu poder mudar direto aqui, sem depender de
  // clicar no calendário). Vazio = usa o dia do calendário (dataAlvo) ou cai na próxima data livre.
  const [dataManual, setDataManual] = useState("");
  // Hoje em São Paulo (YYYY-MM-DD) — trava o seletor pra não marcar um dia que já passou.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [tema, setTema] = useState("");
  const [oferta, setOferta] = useState("");
  const [validade, setValidade] = useState("");
  const [inclui, setInclui] = useState("");
  const [regras, setRegras] = useState("");
  const [diferenciais, setDiferenciais] = useState("");
  const [parcelamento, setParcelamento] = useState(""); // divulgacao: selo "em até 10x sem juros"
  const [categoriaFoto, setCategoriaFoto] = useState("geral");
  const [corFundo, setCorFundo] = useState(""); // "" = automático (sorteia da paleta)
  const [estiloArte, setEstiloArte] = useState<Record<string, string>>({}); // estilo da arte por post (datas comemorativas)
  const [sugerindo, setSugerindo] = useState(false);
  // Feedback / Depoimento: o texto é REAL (colado pelo dono), nunca inventado pela IA.
  const [depoimento, setDepoimento] = useState("");
  const [autorFb, setAutorFb] = useState("");
  const [estrelasFb, setEstrelasFb] = useState(5);
  const [destaqueFb, setDestaqueFb] = useState(""); // vazio = IA extrai do depoimento
  const [corCard, setCorCard] = useState(""); // "" = card branco
  const [fotoAutor, setFotoAutor] = useState(""); // feedback: foto do cliente (opcional)
  const [googleFb, setGoogleFb] = useState(false); // feedback: selo "Avaliação no Google"
  const [gerandoExemplo, setGerandoExemplo] = useState(false);
  // Preço / Pacote — valores SEMPRE do dono (a IA não inventa preço).
  const [precoDe, setPrecoDe] = useState("");
  const [precoPor, setPrecoPor] = useState("");
  const [labelPor, setLabelPor] = useState("À vista");
  const [parcelas, setParcelas] = useState("");
  const [economiaInput, setEconomiaInput] = useState(""); // vazio = calcula De − Por
  const [condicoesTxt, setCondicoesTxt] = useState(""); // uma condição por linha
  const [modoPreco, setModoPreco] = useState("promo"); // promo (De→Por) | unico | apartir
  // Enquete / VS — os dois lados que disputam (ex: Salgados x Docinhos).
  const [ladoA, setLadoA] = useState("");
  const [ladoB, setLadoB] = useState("");
  // Edição PONTUAL de um post já criado (sem IA). Quando editandoId != null, o formulário
  // entra em modo edição: campos pré-preenchidos + título/texto/legenda editáveis.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tituloEdit, setTituloEdit] = useState("");
  const [textoEdit, setTextoEdit] = useState("");
  const [legendaEdit, setLegendaEdit] = useState("");
  const [hashtagsEdit, setHashtagsEdit] = useState("");
  // Cores da marca que servem de fundo (escuras). Vazio se a marca não tem paleta.
  const coresFundo = paletaComExtras(parsePaleta(paleta));
  // Templates de fundo COLORIDO (onde escolher a cor faz sentido — os com foto não).
  const TEMPLATES_COR = ["promocao", "divulgacao", "data-comemorativa", "mosaico", "moldura", "faixa", "preco", "enquete", "vitrine"];
  const [erro, setErro] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);
  const [postandoId, setPostandoId] = useState<string | null>(null); // card publicando agora (caixinha)
  const [pagina, setPagina] = useState(1);
  // Volta pra página 1 quando muda o filtro de dia ou a lista cresce/encolhe.
  useEffect(() => { setPagina(1); }, [dataAlvo, publicacoes.length]);
  // Clicar num dia do calendário (dataAlvo) manda no seletor: limpa a escolha manual pra o campo
  // mostrar o dia clicado. Depois o dono ainda pode trocar à mão no próprio campo.
  useEffect(() => { setDataManual(""); }, [dataAlvo]);
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

  // Preenche os campos com um EXEMPLO de depoimento (rascunho pra testar/adaptar).
  function handleExemplo() {
    setErro(null);
    setGerandoExemplo(true);
    startTransition(async () => {
      const r = await sugerirDepoimento(marcaId, destaqueFb.trim() || undefined);
      if (r.ok) {
        setDepoimento(r.depoimento);
        if (r.autor) setAutorFb(r.autor);
        if (r.destaque) setDestaqueFb(r.destaque);
        setEstrelasFb(5);
      } else setErro(r.erro);
      setGerandoExemplo(false);
    });
  }

  const formRef = useRef<HTMLDivElement>(null);

  // Muda a HORA de um post já programado (mantém o dia).
  function handleReagendar(id: string, hora: number) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await reagendarPublicacao(id, hora);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Muda o DIA de um post já programado (mantém a hora) — mover de um dia pro outro.
  function handleRemarcar(id: string, dataYMD: string) {
    if (!dataYMD) return;
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await remarcarPublicacao(id, dataYMD);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }

  // Carrega os valores de um post nos campos do formulário e entra em MODO EDIÇÃO.
  function handleEditar(p: PublicacaoView) {
    setErro(null);
    let ex: Record<string, unknown> = {};
    try { ex = JSON.parse(p.extra || "{}"); } catch {}
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]).join("\n") : "");
    setTemplate(p.template as Template);
    setTituloEdit(p.titulo);
    setTextoEdit(p.texto);
    setLegendaEdit(p.legenda);
    setHashtagsEdit(p.hashtags);
    setOferta(s(ex.oferta));
    setValidade(s(ex.validade));
    setInclui(arr(ex.inclui));
    setRegras(s(ex.regras));
    setDiferenciais(arr(ex.diferenciais));
    setParcelamento(s(ex.parcelamento));
    setCorFundo(s(ex.corFundoTravada));
    setCategoriaFoto(s(ex.categoria) || "geral");
    setDepoimento(s(ex.depoimento));
    setAutorFb(s(ex.autor));
    setEstrelasFb(typeof ex.estrelas === "number" ? ex.estrelas : 5);
    setDestaqueFb(s(ex.destaque));
    setCorCard(s(ex.corCard));
    setModoPreco(s(ex.modoPreco) || "promo");
    setPrecoDe(s(ex.precoDe));
    setPrecoPor(s(ex.precoPor));
    setLabelPor(s(ex.labelPor) || "À vista");
    setParcelas(s(ex.parcelas));
    setEconomiaInput(s(ex.economiaTravada));
    setCondicoesTxt(arr(ex.condicoes));
    setLadoA(s(ex.ladoA));
    setLadoB(s(ex.ladoB));
    setFotoAutor(s(ex.fotoAutor));
    setGoogleFb(ex.google === true);
    setEditandoId(p.id);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setTituloEdit(""); setTextoEdit(""); setLegendaEdit(""); setHashtagsEdit("");
    setOferta(""); setValidade(""); setInclui(""); setRegras(""); setDiferenciais(""); setParcelamento("");
    setCorFundo(""); setCategoriaFoto("geral");
    setDepoimento(""); setAutorFb(""); setEstrelasFb(5); setDestaqueFb(""); setCorCard("");
    setPrecoDe(""); setPrecoPor(""); setLabelPor("À vista"); setParcelas(""); setEconomiaInput(""); setCondicoesTxt(""); setModoPreco("promo");
    setLadoA(""); setLadoB("");
    setFotoAutor(""); setGoogleFb(false);
  }

  function handleSalvarEdicao() {
    if (!editandoId) return;
    setErro(null);
    startTransition(async () => {
      const itens = inclui.split("\n").map((s) => s.trim()).filter(Boolean);
      const difs = diferenciais.split("\n").map((s) => s.trim()).filter(Boolean);
      const conds = condicoesTxt.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await editarPublicacao({
        id: editandoId,
        titulo: tituloEdit, texto: textoEdit, legenda: legendaEdit, hashtags: hashtagsEdit,
        oferta, validade, inclui: itens, regras, diferenciais: difs, parcelamento, corFundo,
        depoimento, autor: autorFb, estrelas: estrelasFb, destaque: destaqueFb, corCard,
        precoDe, precoPor, labelPor, parcelas, economia: economiaInput, condicoes: conds, modoPreco, ladoA, ladoB, fotoAutor, google: googleFb,
      });
      if (r.ok) {
        cancelarEdicao();
        router.refresh();
      } else setErro(r.erro);
    });
  }

  function handleGerar() {
    setErro(null);
    startTransition(async () => {
      const itens = inclui.split("\n").map((s) => s.trim()).filter(Boolean);
      const difs = diferenciais.split("\n").map((s) => s.trim()).filter(Boolean);
      const usaFoto = template === "dica" || template === "mosaico" || template === "faixa" || template === "feedback" || template === "enquete" || template === "vitrine";
      const conds = condicoesTxt.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await gerarPublicacao({ marcaId, template, tema, data: (dataManual || dataAlvo) ?? undefined, oferta, validade, inclui: itens, regras, diferenciais: difs, parcelamento, categoria: usaFoto && categoriaFoto ? categoriaFoto : undefined, corFundo: TEMPLATES_COR.includes(template) ? corFundo : undefined, depoimento, autor: autorFb, estrelas: estrelasFb, destaque: destaqueFb, corCard, precoDe, precoPor, labelPor, parcelas, economia: economiaInput, condicoes: conds, modoPreco, ladoA, ladoB, fotoAutor, google: googleFb, hora, imagemUrl: imagemFundo || undefined });
      if (r.ok) {
        setTema("");
        setOferta("");
        setValidade("");
        setInclui("");
        setRegras("");
        setDiferenciais("");
        setParcelamento("");
        setCategoriaFoto("geral");
        setCorFundo("");
        setDepoimento("");
        setAutorFb("");
        setEstrelasFb(5);
        setDestaqueFb("");
        setCorCard("");
        setPrecoDe("");
        setPrecoPor("");
        setLabelPor("À vista");
        setParcelas("");
        setEconomiaInput("");
        setCondicoesTxt("");
        setModoPreco("promo");
        setLadoA("");
        setLadoB("");
        setFotoAutor("");
        setGoogleFb(false);
        setImagemFundo("");
        onGerado?.(r.dia); // filtra a lista no dia da nova publicação (não abre todas)
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
      // A nova versão vai pra OUTRA data (próxima livre). Se a lista estiver filtrada
      // por um dia, limpa o filtro pra a nova aparecer (senão parece que não criou).
      else if (comoNova) onLimparDia?.();
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
  function handleEspelhar(id: string, espelhar: boolean) {
    setProc(id);
    startTransition(async () => {
      const r = await definirEspelhar(id, espelhar);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleAprovar(id: string) {
    setProc(id);
    startTransition(async () => {
      await alternarAprovacao(id);
      router.refresh();
      setProc(null);
    });
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
    const comStory = (p.espelhar ?? !!espelharStoryPadrao);
    setConfirmacao({
      titulo: temFacebook ? "Postar no Instagram e Facebook agora?" : "Postar no Instagram agora?",
      descricao: `"${p.titulo}" vai ao ar de verdade ${redesTexto}${comStory ? " — e também sobe como Story" : ""}.`,
      textoConfirmar: "Postar agora",
      acao: async () => {
        setProc(p.id);
        setPostandoId(p.id);
        try {
          const r = await postarPublicacao(p.id);
          if (!r.ok) setErro(r.erro);
          // O feed foi ao ar, mas o Story (espelho) pode ter falhado — avisa sem alarmar.
          else if (r.story === false) setErro(`O post foi publicado, mas não consegui subir o Story: ${r.erroStory ?? "tente de novo pelo botão 🟣."}`);
          router.refresh();
        } finally {
          setProc(null);
          setPostandoId(null);
        }
      },
    });
  }
  // Sobe SÓ o Story de um post de feed já postado (a mesma arte) — pra quando o feed já foi
  // ao ar sem o Story e o dono quer o Story depois.
  function handlePostarStory(p: PublicacaoView) {
    setConfirmacao({
      titulo: "Postar o Story agora?",
      descricao: `A arte de "${p.titulo}" vai ao ar como Story no Instagram (some em 24h). O post do feed continua como está.`,
      textoConfirmar: "Postar Story",
      acao: async () => {
        setProc(p.id);
        setPostandoId(p.id);
        try {
          const r = await postarStoryDoFeed(p.id);
          if (!r.ok) setErro(r.erro);
          router.refresh();
        } finally {
          setProc(null);
          setPostandoId(null);
        }
      },
    });
  }
  const [seletorImg, setSeletorImg] = useState<PublicacaoView | null>(null);
  const [bancoArteId, setBancoArteId] = useState<string | null>(null); // card com a galeria "artes salvas" aberta
  const artesSalvas = feedArtes ?? [];
  // Foto de fundo escolhida JÁ no formulário (antes de gerar) — pros templates que usam foto.
  const [imagemFundo, setImagemFundo] = useState("");
  const [seletorFundo, setSeletorFundo] = useState(false);
  const [subindoFundo, setSubindoFundo] = useState(false);
  async function handleUploadFundo(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setSubindoFundo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok) setImagemFundo(data.url);
      else setErro(data.erro || "Falha ao subir a foto.");
    } catch {
      setErro("Falha ao subir a foto. Tente de novo.");
    } finally {
      setSubindoFundo(false);
    }
  }
  function handleEscolherImagem(id: string, url: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirImagemPublicacao({ id, url });
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleGerarImagem(id: string, estilo?: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await gerarImagemPublicacao({ id, estilo });
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Reaproveita uma arte de fundo JÁ gerada (da biblioteca da marca) — sem gastar IA de novo.
  function handleAplicarArte(id: string, url: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await aplicarArteFeed({ id, url });
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Troca o FORMATO do layout da data comemorativa (posição do texto sobre a ilustração).
  function handleLayoutData(id: string, formato: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirLayoutData(id, formato);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Mostra/esconde o mascote neste post e escolhe o canto ("" | "dir" | "esq" | "cima-*").
  function handleMascoteCanto(id: string, canto: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirMascoteCanto(id, canto);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Tamanho do mascote neste post ("p" | "m" | "g").
  function handleMascoteTam(id: string, tam: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirMascoteTam(id, tam);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Posição do logo neste post ("" = padrão | canto).
  function handleLogoCanto(id: string, canto: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirLogoCanto(id, canto);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Tamanho do logo neste post ("p" | "m" | "g").
  function handleLogoTam(id: string, tam: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await definirLogoTam(id, tam);
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
  async function handleUploadFotoAutor(file: File | undefined) {
    if (!file) return;
    setProc("fotoAutor");
    setErro(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok) setFotoAutor(data.url);
      else setErro(data.erro || "Falha ao subir a foto do cliente.");
    } catch {
      setErro("Falha ao subir a foto. Tente de novo.");
    } finally {
      setProc(null);
    }
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

      <div ref={formRef} className={`mb-8 scroll-mt-4 rounded-xl border bg-preto-card p-4 sm:p-5 ${editandoId ? "border-sky-500/60 ring-2 ring-sky-500/30" : "border-linha"}`}>
        {editandoId ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2">
            <span className="text-xs font-semibold text-sky-200">✏️ Editando esta arte — muda só o que você alterar, sem IA e sem trocar a foto.</span>
            <button type="button" onClick={cancelarEdicao} className="rounded-md border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">✕ Cancelar</button>
          </div>
        ) : !gerador.aberto ? (
          <button type="button" onClick={gerador.alternar} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500/15 py-2.5 text-sm font-bold text-sky-100 transition hover:bg-sky-500/25">
            <span className="text-lg">✨</span> Criar nova publicação (feed)
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-white">Gerar publicação (feed) com IA</p>
              <p className="text-xs text-muted">Post de imagem única, no tom da marca. Sem escolher dia, cai na próxima data livre da agenda.</p>
            </div>
            <button type="button" onClick={gerador.alternar} className="shrink-0 rounded-md border border-linha px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">▾ recolher</button>
          </div>
        )}

        {(gerador.aberto || editandoId) && (<>
        {!editandoId && sugestao && (
          <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5">
            <span className="text-sm text-purple-100">
              💡 <strong className="font-semibold text-white">A Bia sugere:</strong> {sugestao.emoji} {sugestao.nome} — <span className="text-purple-200/90">{sugestao.motivo}</span>.
            </span>
            <button
              type="button"
              onClick={() => { setTemplate(sugestao.template as Template); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              className="shrink-0 rounded-md border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-100 transition hover:bg-purple-500/25"
            >
              Usar essa ideia →
            </button>
          </div>
        )}
        <div className="mb-3 mt-3 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t} type="button" onClick={() => { if (!editandoId) { setTemplate(t); if (t === "enquete") setCategoriaFoto(""); } }} disabled={!!editandoId && template !== t} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${template === t ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"} ${editandoId && template !== t ? "cursor-not-allowed opacity-30" : ""}`}>
              {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>

        {editandoId && (
          <div className="mb-3 flex flex-col gap-3 rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
            <label className="text-xs text-muted">
              Título da arte
              <input value={tituloEdit} onChange={(e) => setTituloEdit(e.target.value)} placeholder="Texto principal da arte" className="input-base" />
            </label>
            <label className="text-xs text-muted">
              Texto de apoio <span className="text-muted/70">(se o template usa — ex: subtítulo)</span>
              <input value={textoEdit} onChange={(e) => setTextoEdit(e.target.value)} placeholder="Frase de apoio" className="input-base" />
            </label>
          </div>
        )}

        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 text-xs text-muted">
            Dia do post
            <input
              type="date"
              value={dataManual || dataAlvo || ""}
              min={hojeSP}
              onChange={(e) => setDataManual(e.target.value)}
              style={{ colorScheme: "dark" }}
              title="Escolha o dia da postagem (ex: amanhã). Em branco = próxima data livre."
              className="mt-1 w-full rounded-md border border-linha bg-preto px-3 py-2 text-sm font-semibold text-white transition hover:border-vermelho focus:border-vermelho focus:outline-none"
            />
            <p className="mt-1 text-[11px] leading-snug text-muted/70">Toque pra escolher o dia (ou clique num dia livre no calendário ↑). Em branco = cai na próxima data livre.</p>
          </div>
          <label className="text-xs text-muted sm:w-36 sm:shrink-0">
            Hora <span className="text-muted/70">(BRT)</span>
            <select value={hora} onChange={(e) => setHora(Number(e.target.value))} style={{ WebkitAppearance: "none", appearance: "none", minWidth: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b9b9b9' stroke-width='1.5'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.6rem center", paddingRight: "1.6rem" }} className="input-base w-full" title="Permite vários posts no mesmo dia em horas diferentes (ex: 10h, 16h, 20h)">
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
            </select>
          </label>
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
            <label className="mt-3 block text-xs text-muted">
              💳 Parcelamento <span className="text-muted/70">(opcional — vira um selo na arte)</span>
              <input value={parcelamento} onChange={(e) => setParcelamento(e.target.value)} placeholder="Ex: em até 10x sem juros" className="input-base" />
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

        {template === "faixa" && (
          <div className="mb-3">
            <label className="text-xs text-muted">
              Foto do banco <span className="text-muted/70">(de qual categoria puxar a imagem de fundo)</span>
              <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-amber-400/90">📐 Usa 1 foto REAL do seu Banco de Imagens de fundo. Suba fotos na aba <strong>Imagens</strong> se ainda não tiver — sem foto, vira um fundo colorido.</p>
          </div>
        )}

        {template === "enquete" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique preenche os dois lados)</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MODELOS_ENQUETE.map((m) => (
                <button key={m.rotulo} type="button" onClick={() => { setTema(m.assunto); setLadoA(m.ladoA); setLadoB(m.ladoB); setCategoriaFoto(""); }} className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">
                  {m.rotulo}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Lado A <span className="text-muted/70">(ex: Salgados)</span>
                <input value={ladoA} onChange={(e) => setLadoA(e.target.value)} placeholder="Time A" className="input-base" />
              </label>
              <label className="text-xs text-muted">
                Lado B <span className="text-muted/70">(ex: Docinhos)</span>
                <input value={ladoB} onChange={(e) => setLadoB(e.target.value)} placeholder="Time B" className="input-base" />
              </label>
              <label className="text-xs text-muted sm:col-span-2">
                Fundo <span className="text-muted/70">(fundo colorido fica mais limpo pro VS; ou puxe uma foto do banco)</span>
                <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                  <option value="">🎨 Sem foto — fundo colorido (recomendado)</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>📷 {CATEGORIA_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-1 text-[11px] text-amber-400/90">⚔️ Enquete pra ENGAJAR: o público comenta qual lado prefere. Lados vazios = a IA sugere. Por padrão vem com <strong>fundo colorido</strong> (o "VS" aparece bem); se quiser foto, escolha uma categoria acima — mas ela é genérica e pode não combinar com o tema.</p>
          </div>
        )}

        {template === "vitrine" && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Modelos prontos (clique preenche o assunto + a categoria das fotos)</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MODELOS_VITRINE.map((m) => (
                <button key={m.rotulo} type="button" onClick={() => { setTema(m.assunto); setCategoriaFoto(m.categoria); }} className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">
                  {m.rotulo}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted">
              Fotos do banco <span className="text-muted/70">(de qual categoria puxar as 6 fotos)</span>
              <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-amber-400/90">🍱 Mostra 6 fotos REAIS do seu Banco (rodízio) numa grade com o título no meio. Suba fotos na aba <strong>Imagens</strong> se ainda não tiver.</p>
          </div>
        )}

        {template === "preco" && (
          <div className="mb-3 flex flex-col gap-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] text-amber-300/90">💰 Os <strong>valores são seus</strong> (a IA não inventa preço).</p>
            </div>
            {/* Modo de exibição do preço */}
            <div>
              <span className="text-xs text-muted">Como mostrar o preço</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { v: "promo", l: "🏷️ De → Por (promoção)" },
                  { v: "unico", l: "💲 Preço único" },
                  { v: "apartir", l: "↗️ A partir de" },
                ].map((m) => (
                  <button key={m.v} type="button" onClick={() => setModoPreco(m.v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${modoPreco === m.v ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>{m.l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modoPreco === "promo" && (
                <label className="text-xs text-muted">
                  De R$ <span className="text-muted/70">(preço antigo, riscado — opcional)</span>
                  <input value={precoDe} onChange={(e) => setPrecoDe(e.target.value)} placeholder="Ex: 12.000" className="input-base" />
                </label>
              )}
              <label className="text-xs text-muted">
                {modoPreco === "apartir" ? "A partir de R$" : modoPreco === "unico" ? "Preço R$" : "Por R$"} <span className="text-red-400">*</span>
                <input value={precoPor} onChange={(e) => setPrecoPor(e.target.value)} placeholder="Ex: 8.500,00" className="input-base" />
              </label>
              <label className="text-xs text-muted">
                Forma de pagamento <span className="text-muted/70">(opcional)</span>
                <input value={labelPor} onChange={(e) => setLabelPor(e.target.value)} placeholder="Ex: À vista" className="input-base" />
              </label>
              <label className="text-xs text-muted">
                Parcelas <span className="text-muted/70">(opcional)</span>
                <input value={parcelas} onChange={(e) => setParcelas(e.target.value)} placeholder="Ex: 5x de R$ 9.000" className="input-base" />
              </label>
              {modoPreco === "promo" && (
                <label className="text-xs text-muted">
                  Economia R$ <span className="text-muted/70">(vazio = calcula sozinho)</span>
                  <input value={economiaInput} onChange={(e) => setEconomiaInput(e.target.value)} placeholder="Auto: De − Por" className="input-base" />
                </label>
              )}
              <label className="text-xs text-muted">
                Validade <span className="text-muted/70">(opcional — selo "ATÉ")</span>
                <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: 30/06" className="input-base" />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Condições <span className="text-muted/70">(uma por linha — ex: Seg a Sex / 50 a 70 convidados)</span>
              <textarea value={condicoesTxt} onChange={(e) => setCondicoesTxt(e.target.value)} rows={2} placeholder={"Seg a Sex\n50 a 70 convidados"} className="input-base resize-none" />
            </label>
          </div>
        )}

        {template === "feedback" && (
          <div className="mb-3 flex flex-col gap-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] text-amber-300/90">⭐ Cole um depoimento <strong>REAL</strong> de cliente. A IA <strong>não inventa</strong> nada — ela só escreve o agradecimento e destaca a frase principal.</p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Depoimento do cliente <span className="text-red-400">*</span></span>
                <button type="button" onClick={handleExemplo} disabled={gerandoExemplo} className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-1 text-[11px] font-semibold text-amber-200 transition hover:border-amber-400 hover:text-white disabled:opacity-50">
                  {gerandoExemplo ? "💡 Criando…" : "💡 Gerar exemplo"}
                </button>
              </div>
              <textarea value={depoimento} onChange={(e) => setDepoimento(e.target.value)} rows={4} placeholder="Cole aqui exatamente o que o cliente escreveu…" className="input-base mt-1 resize-none" />
              <p className="mt-1 text-[11px] text-muted/80">💡 O "Gerar exemplo" é um <strong>rascunho</strong> pra testar/adaptar. Pra postar de verdade, use o depoimento <strong>real</strong> do cliente.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Nome do cliente <span className="text-muted/70">(opcional)</span>
                <input value={autorFb} onChange={(e) => setAutorFb(e.target.value)} placeholder="Ex: Mariana S." className="input-base" />
              </label>
              <div className="text-xs text-muted">
                Frase de destaque <span className="text-muted/70">(vazio = IA cria)</span>
                <input value={destaqueFb} onChange={(e) => setDestaqueFb(e.target.value)} placeholder="Ex: Excelente atendimento!" className="input-base" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["Excelente atendimento!", "Festa inesquecível!", "Tudo perfeito!", "Equipe nota 10!", "Espaço incrível!", "Recomendo demais!"].map((s) => (
                    <button key={s} type="button" onClick={() => setDestaqueFb(s)} className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${destaqueFb === s ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-linha text-muted hover:border-amber-400/60 hover:text-white"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-muted">Nota</span>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setEstrelasFb(s)} title={`${s} estrela${s > 1 ? "s" : ""}`} className={`text-2xl leading-none transition ${s <= estrelasFb ? "text-amber-400" : "text-muted/40 hover:text-amber-300"}`}>★</button>
                  ))}
                </div>
              </div>
              <label className="text-xs text-muted">
                Foto de fundo <span className="text-muted/70">(do espaço, do seu banco)</span>
                <select value={categoriaFoto} onChange={(e) => setCategoriaFoto(e.target.value)} className="input-base">
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="text-xs text-muted">Cor do balão</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCorCard("")} className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${corCard === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>⬜ Branco</button>
                {CORES_EXTRAS.map((c) => (
                  <button key={c} type="button" onClick={() => setCorCard(c)} title={c} aria-label={`Cor ${c}`} className={`h-9 w-9 rounded-lg border-2 transition ${corCard.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            {/* Selo "Avaliação no Google" + foto do cliente (igual às referências de prova social) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-linha bg-preto px-3 py-2.5 text-xs text-white">
                <input type="checkbox" checked={googleFb} onChange={(e) => setGoogleFb(e.target.checked)} className="h-4 w-4 accent-vermelho" />
                <span>🌟 Mostrar selo <strong>&quot;Avaliação no Google&quot;</strong></span>
              </label>
              <div className="text-xs text-muted">
                Foto do cliente <span className="text-muted/70">(opcional — círculo)</span>
                <div className="mt-1 flex items-center gap-2">
                  {fotoAutor ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoAutor} alt="cliente" className="h-9 w-9 rounded-full object-cover" />
                      <button type="button" onClick={() => setFotoAutor("")} className="rounded-md border border-linha px-2 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white">✕ remover</button>
                    </>
                  ) : (
                    <label className="cursor-pointer rounded-md border border-linha px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">
                      {proc === "fotoAutor" ? "Subindo…" : "📷 Subir foto"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadFotoAutor(e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-amber-400/90">⭐ Usa 1 foto REAL do seu Banco (rodízio) — você troca depois se não ficar boa. Sem foto, fica um fundo colorido.</p>
          </div>
        )}

        {/* Foto de fundo (opcional) — pros templates que usam foto de fundo única */}
        {templateUsaFotoFundo(template) && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">🖼️ Foto de fundo <span className="normal-case text-muted/70">(opcional — sem foto, fica só a cor)</span></p>
            {imagemFundo ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagemFundo} alt="" className="h-16 w-16 rounded-lg border border-linha object-cover" />
                <button type="button" onClick={() => setSeletorFundo(true)} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-[#7c3aed] hover:text-white">🖼️ Trocar</button>
                <label className="cursor-pointer rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-[#7c3aed] hover:text-white">
                  {subindoFundo ? "Enviando…" : "📤 Enviar"}
                  <input type="file" accept="image/*" className="hidden" disabled={subindoFundo} onChange={(e) => handleUploadFundo(e.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => setImagemFundo("")} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white">✕ Remover</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setSeletorFundo(true)} className="rounded-md border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed]">🖼️ Escolher do banco</button>
                <label className="cursor-pointer rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-[#7c3aed] hover:text-white">
                  {subindoFundo ? "Enviando…" : "📤 Enviar foto"}
                  <input type="file" accept="image/*" className="hidden" disabled={subindoFundo} onChange={(e) => handleUploadFundo(e.target.files?.[0])} />
                </label>
                <span className="text-[11px] text-muted/70">entra atrás do texto, com um véu da cor pra ler bem</span>
              </div>
            )}
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

        {editandoId ? (
          <div className="flex flex-col gap-3">
            <label className="text-xs text-muted">
              Legenda do post <span className="text-muted/70">(o que vai escrito embaixo no Instagram)</span>
              <textarea value={legendaEdit} onChange={(e) => setLegendaEdit(e.target.value)} rows={4} className="input-base resize-none" />
            </label>
            <label className="text-xs text-muted">
              Hashtags
              <input value={hashtagsEdit} onChange={(e) => setHashtagsEdit(e.target.value)} placeholder="#festa #buffet …" className="input-base" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleSalvarEdicao} disabled={isPending} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50">
                {isPending ? "Salvando…" : "💾 Salvar alterações"}
              </button>
              <button onClick={cancelarEdicao} disabled={isPending} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-muted transition hover:border-vermelho hover:text-white disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1 text-xs text-muted">
              Assunto (opcional — se vazio, a IA escolhe)
              <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: novidade da semana" className="input-base" />
            </label>
            <button onClick={handleGerar} disabled={isPending || (template === "feedback" && !depoimento.trim()) || (template === "preco" && !precoPor.trim())} title={template === "feedback" && !depoimento.trim() ? "Cole o depoimento do cliente primeiro" : template === "preco" && !precoPor.trim() ? "Informe o preço da oferta (Por R$)" : undefined} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
              {isPending ? "Gerando…" : "Gerar"}
            </button>
          </div>
        )}
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
        </>)}
      </div>

      {/* Contagem + paginação (o filtro por dia + "Ver todos" agora ficam no topo,
          acima das abas, pois são globais — ver redes-sociais.tsx). */}
      {publicacoes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{filtradas.length} {filtradas.length === 1 ? "publicação" : "publicações"}{dataAlvo ? " nesse dia" : ""}</span>
          {!dataAlvo && totalPaginas > 1 ? (
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
            const v = tokenArte(p);
            const arte = `/api/feed/${p.id}?v=${v}`;
            const postado = p.status === "postado";
            const ocupado = proc === p.id;
            // Formato atual do layout da data comemorativa (pro seletor de formato).
            let fmtData = "painel";
            let mascoteCanto = "";
            let mascoteTam = "m";
            let logoCanto = "";
            let logoTam = "m";
            try { const ex = JSON.parse(p.extra || "{}"); if (typeof ex.layoutData === "string") fmtData = ex.layoutData; if (typeof ex.mascoteCanto === "string") mascoteCanto = ex.mascoteCanto; if (typeof ex.mascoteTam === "string") mascoteTam = ex.mascoteTam; if (typeof ex.logoCanto === "string") logoCanto = ex.logoCanto; if (typeof ex.logoTam === "string") logoTam = ex.logoTam; } catch {}
            return (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-preto-card p-3 ${destacarId === p.id ? "border-sky-500 ring-2 ring-sky-500/50" : "border-linha"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{dataBR(p.data)}</span>
                  <span title={postado && p.postadoEm ? `Publicado em ${dataHoraBR(p.postadoEm)}` : undefined} className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "✓ Postado" : "● A postar"}</span>
                </div>
                {!postado ? (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <input type="date" value={ymd(p.data)} onChange={(e) => handleRemarcar(p.id, e.target.value)} disabled={ocupado} title="Mudar o dia da postagem" style={{ colorScheme: "dark" }} className="rounded-md border border-linha bg-preto px-2 py-1 text-[11px] text-white transition hover:border-vermelho disabled:opacity-40" />
                    <select value={horaSP(p.data)} onChange={(e) => handleReagendar(p.id, Number(e.target.value))} disabled={ocupado} title="Hora da postagem (muda quando o piloto posta)" className="w-fit shrink-0 rounded-md border border-linha bg-preto px-2 py-1 text-[11px] text-white transition hover:border-vermelho disabled:opacity-40">
                      {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>🕐 {rotuloHora(h)}</option>)}
                    </select>
                  </div>
                ) : (
                  p.postadoEm && <p className="mb-2 text-[11px] text-green-400/80">📢 Publicado {dataHoraBR(p.postadoEm)}</p>
                )}
                <div className="relative">
                  <button type="button" onClick={() => setImgExpandida(arte)} title="Ampliar" className="block overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={arte} alt={p.titulo} className="aspect-[4/5] w-full object-cover" />
                  </button>
                  {postandoId === p.id && <CaixaPostando redes={redesTexto} />}
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">{TEMPLATE_LABEL[p.template as Template] ?? p.template}</p>
                <p className="line-clamp-2 text-sm text-white">{p.titulo}</p>
                {p.categoriaIntencao && <div className="mt-1.5"><EtiquetaCategoria categoria={p.categoriaIntencao} /></div>}
                {postado && <SeloEngajamento p={p} />}

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
                  {!postado && <button onClick={() => handleEditar(p)} disabled={ocupado} title="Editar os textos e valores desta arte (sem IA, mantém a foto)" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-sky-500 hover:text-white disabled:opacity-40">✏️ Editar</button>}
                  <button onClick={() => handleRegerar(p)} disabled={ocupado} title={postado ? "Já postado — cria uma nova versão ao lado" : "Regerar texto (com IA)"} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻ Regerar</button>
                  <a href={arte} download={`feed-${p.slug}.png`} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">⬇ Baixar</a>
                  <button onClick={() => copiar(p)} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{copiadoId === p.id ? "✓ Copiado" : "Copiar texto"}</button>
                  {/* Edição de imagem some em posts já postados (não muda o que está no
                      Instagram). Pra uma versão nova, use Regerar → "criar nova ao lado". */}
                  {/* Botões de FOTO DE FUNDO só nos templates que usam imagem. Em design fechado
                      (Promoção, Preço, Divulgação…) eles não teriam efeito — escondidos pra não confundir. */}
                  {!postado && templateUsaFotoFundo(p.template) && (
                    <>
                      <button onClick={() => setSeletorImg(p)} disabled={ocupado} title="Ver o banco e ESCOLHER a foto (as que mais combinam com o post aparecem primeiro)" className="rounded-md border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-2 py-1 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed] disabled:opacity-40">🖼️ Escolher</button>
                      <button onClick={() => setConfirmacao({ titulo: "🎲 Sortear uma foto ALEATÓRIA?", descricao: "Isso pega uma foto QUALQUER do seu banco — pode NÃO combinar com o tema. Pra escolher a foto certa (as que mais combinam aparecem primeiro), feche isto e use o botão “🖼️ Escolher”.", textoConfirmar: "Sortear assim mesmo", acao: () => handleBanco(p.id, p.categoria ?? undefined) })} disabled={ocupado} title="Sortear uma foto aleatória do banco (pode não combinar — prefira 🖼️ Escolher)" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs text-amber-300/90 transition hover:border-amber-500 hover:text-amber-200 disabled:opacity-40">🎲 Sortear (aleatória)</button>
                      {p.template === "data-comemorativa" && (
                        <select value={estiloArte[p.id] ?? ""} onChange={(e) => setEstiloArte((s) => ({ ...s, [p.id]: e.target.value }))} disabled={ocupado} title="Escolha o estilo da arte e clique em 🤖 Fundo IA" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                          <option value="">🎨 Cartoon alegre</option>
                          <option value="adesivos">🎉 Divertido (adesivos)</option>
                          <option value="aquarela">🖌️ Aquarela</option>
                          <option value="moderno">✨ Moderno</option>
                          <option value="3d">🧸 3D fofo</option>
                        </select>
                      )}
                      <button onClick={() => handleGerarImagem(p.id, estiloArte[p.id])} disabled={ocupado} title={p.template === "data-comemorativa" ? "Gera a arte com IA no ESTILO escolhido ao lado" : "Gera um FUNDO artístico com IA, no clima do post (fundo abstrato — não é foto do seu espaço)"} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🤖 Fundo IA</button>
                      {p.template === "data-comemorativa" && p.imagemUrl && (
                        <select value={fmtData} onChange={(e) => handleLayoutData(p.id, e.target.value)} disabled={ocupado} title="Formato do texto sobre a imagem — muda na hora, sem gerar de novo" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                          <option value="painel">🖼️ Texto no centro</option>
                          <option value="rodape">⬇️ Texto embaixo (imagem em destaque)</option>
                          <option value="topo">⬆️ Texto em cima</option>
                          <option value="limpo">✨ Sem moldura (imagem inteira)</option>
                        </select>
                      )}
                      {artesSalvas.length > 0 && (
                        <button onClick={() => setBancoArteId((c) => (c === p.id ? null : p.id))} disabled={ocupado} title="Reaproveitar uma arte de IA que você já gerou antes (sem gastar geração)" className={`rounded-md border px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${bancoArteId === p.id ? "border-[#7c3aed] bg-[#7c3aed]/15 text-[#d6c6ff]" : "border-linha text-muted hover:border-vermelho hover:text-white"}`}>🖼️ Artes salvas ({artesSalvas.length})</button>
                      )}
                      <label className="cursor-pointer rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">
                        📤 Foto
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(p.id, e.target.files?.[0])} />
                      </label>
                      {p.imagemUrl && (
                        <button onClick={() => handleRemoverImagem(p.id)} disabled={ocupado} title="Remover foto de fundo" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">✕ Foto</button>
                      )}
                    </>
                  )}
                </div>

                {/* Biblioteca de artes de IA já geradas — reusar sem gastar geração nova. */}
                {!postado && templateUsaFotoFundo(p.template) && bancoArteId === p.id && artesSalvas.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-2">
                    <p className="mb-1.5 text-[11px] font-semibold text-[#d6c6ff]">🖼️ Suas artes de IA salvas — toque pra usar nesta publicação</p>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                      {artesSalvas.map((url) => {
                        const escolhida = p.imagemUrl === url;
                        return (
                          <button key={url} type="button" onClick={() => handleAplicarArte(p.id, url)} disabled={ocupado} title="Usar esta arte como fundo" className={`overflow-hidden rounded-md border transition disabled:opacity-40 ${escolhida ? "border-vermelho ring-2 ring-vermelho/50" : "border-linha hover:border-vermelho"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Arte salva" className="aspect-[4/5] w-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mascote da marca neste post (liga/desliga + canto). Só aparece se a marca tem mascote. */}
                {!postado && temMascote && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <select value={mascoteCanto} onChange={(e) => handleMascoteCanto(p.id, e.target.value)} disabled={ocupado} title="Mostrar o mascote da marca neste post e escolher o canto" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                      <option value="">🦸 Mascote: não</option>
                      <option value="dir">🦸 Mascote: embaixo à direita ↘</option>
                      <option value="esq">🦸 Mascote: embaixo à esquerda ↙</option>
                      <option value="cima-dir">🦸 Mascote: em cima à direita ↗</option>
                      <option value="cima-esq">🦸 Mascote: em cima à esquerda ↖</option>
                    </select>
                    {mascoteCanto && (
                      <select value={mascoteTam} onChange={(e) => handleMascoteTam(p.id, e.target.value)} disabled={ocupado} title="Tamanho do mascote" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                        <option value="p">🔎 Pequeno</option>
                        <option value="m">📏 Médio</option>
                        <option value="g">🔍 Grande</option>
                      </select>
                    )}
                  </div>
                )}

                {/* Logo da marca neste post: posição (padrão do modelo ou um canto) + tamanho. */}
                {!postado && temLogo && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <select value={logoCanto} onChange={(e) => handleLogoCanto(p.id, e.target.value)} disabled={ocupado} title="Posição do logotipo neste post" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                      <option value="">🏷️ Logo: padrão do modelo</option>
                      <option value="cima-dir">🏷️ Logo: em cima à direita ↗</option>
                      <option value="cima-esq">🏷️ Logo: em cima à esquerda ↖</option>
                      <option value="dir">🏷️ Logo: embaixo à direita ↘</option>
                      <option value="esq">🏷️ Logo: embaixo à esquerda ↙</option>
                    </select>
                    {logoCanto && (
                      <select value={logoTam} onChange={(e) => handleLogoTam(p.id, e.target.value)} disabled={ocupado} title="Tamanho do logotipo" className="rounded-md border border-linha bg-preto px-2 py-1 text-xs text-muted focus:border-vermelho focus:outline-none disabled:opacity-40">
                        <option value="p">🔎 Pequeno</option>
                        <option value="m">📏 Médio</option>
                        <option value="g">🔍 Grande</option>
                      </select>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => handleAprovar(p.id)} disabled={ocupado} title={p.aprovado ? "Você já revisou — clique pra desmarcar" : "Marcar como revisado (interno, não vai pra rede)"} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${p.aprovado ? "bg-green-600 text-white hover:bg-green-500" : "border border-linha text-muted hover:border-green-500 hover:text-white"}`}>{p.aprovado ? "✓ Aprovado" : "Aprovar"}</button>
                  {!postado && (
                    <button onClick={() => handlePostar(p)} disabled={ocupado} className="rounded-md bg-[#C13584] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📷 Postar</button>
                  )}
                  {!postado && (
                    <button onClick={() => handleEspelhar(p.id, !(p.espelhar ?? !!espelharStoryPadrao))} disabled={ocupado} title="Quando este post for ao ar, também sobe como Story no Instagram" className={`rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${(p.espelhar ?? !!espelharStoryPadrao) ? "bg-[#7c3aed] text-white hover:opacity-90" : "border border-linha text-muted hover:border-[#7c3aed] hover:text-white"}`}>{(p.espelhar ?? !!espelharStoryPadrao) ? "🟣 Story: sim" : "🟣 Story: não"}</button>
                  )}
                  {/* Post de feed JÁ postado: sobe SÓ o Story (mesma arte) sob demanda, pra quando
                      o feed foi ao ar sem o Story e o dono quer o Story depois. */}
                  {postado && p.formato !== "story" && (
                    <button onClick={() => handlePostarStory(p)} disabled={ocupado} title="Subir a mesma arte como Story agora (some em 24h) — não altera o post do feed" className="rounded-md bg-[#7c3aed] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">🟣 Postar Story</button>
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

      {seletorImg && (
        <SeletorImagemBanco
          marcaId={marcaId}
          texto={[seletorImg.titulo, seletorImg.texto, seletorImg.tema].filter(Boolean).join(" ")}
          atual={seletorImg.imagemUrl}
          onEscolher={(url) => handleEscolherImagem(seletorImg.id, url)}
          onFechar={() => setSeletorImg(null)}
        />
      )}
      {/* Seletor do banco pra a foto de fundo escolhida NO FORMULÁRIO (antes de gerar) */}
      {seletorFundo && (
        <SeletorImagemBanco
          marcaId={marcaId}
          texto={[tema, oferta, precoPor].filter(Boolean).join(" ")}
          atual={imagemFundo || null}
          onEscolher={(url) => setImagemFundo(url)}
          onFechar={() => setSeletorFundo(false)}
        />
      )}
    </div>
  );
}
