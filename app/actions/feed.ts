"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { guardaMarca, guardaPublicacao } from "@/lib/acesso";
import { publicarNasRedes, publicarStoryNasRedes, marcaConectada } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { baseUrl, AGENTE } from "@/lib/config";
import { TEMPLATES, type Template } from "@/lib/feed-templates";
import { categoriaDoTemplate } from "@/lib/categorias";
import { planoTemStory, rotuloPlano, ehTrial, MSG_TRIAL_POSTAR } from "@/lib/plano";
import { planoDaMarca, checarLimiteFeed, checarCreditoTrial } from "@/lib/limites";
import { sortearImagemBanco, sortearImagensBanco, escolherImagemPorTexto, escolherImagensPorTema, sortearFotoComDescricao } from "@/app/actions/imagens";
import { paletaDaMarca, escolherFundoFesta } from "@/lib/arte";
import type { Marca } from "@prisma/client";

// Dados que o usuário fixou manualmente (têm prioridade sobre o que a IA gera).
// `inclui`/`regras` são SEMPRE manuais (a IA não inventa o que a festa inclui nem condições).
type Travas = { oferta?: string; validade?: string; inclui?: string[]; regras?: string; diferenciais?: string[]; corFundo?: string; depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string; precoDe?: string; precoPor?: string; labelPor?: string; parcelas?: string; economia?: string; condicoes?: string[]; modoPreco?: string; ladoA?: string; ladoB?: string; fotoAutor?: string; google?: boolean; parcelamento?: string };

// Parse/format de valores em R$ no formato brasileiro ("12.000" / "8.500,00").
// Usado pra calcular a economia (De − Por) automaticamente no template de preço.
function valorBR(s?: string): number {
  const n = parseFloat((s || "").replace(/[^\d,]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function formatarBR(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// REDE DE SEGURANÇA do template de PREÇO. A IA NUNCA pode citar na legenda um valor em
// R$ que o dono não digitou (erro gravíssimo: preço errado no post). Coleta os valores
// permitidos (Por / De / parcelas / economia digitada / economia calculada De−Por) e
// troca qualquer "R$ <outro número>" pelo preço principal — assim nunca sai preço errado.
function blindarPrecoLegenda(texto: string, travas?: Travas): string {
  const por = valorBR(travas?.precoPor);
  if (!por || !texto) return texto;
  const de = valorBR(travas?.precoDe);
  const permitidos = new Set<number>();
  for (const v of [travas?.precoPor, travas?.precoDe, travas?.parcelas, travas?.economia]) {
    for (const m of (v || "").matchAll(/\d[\d.]*(?:,\d{1,2})?/g)) {
      const n = valorBR(m[0]);
      if (n > 0) permitidos.add(n);
    }
  }
  // Economia calculada automaticamente (De − Por), que a IA pode citar legitimamente.
  if ((travas?.modoPreco || "promo") === "promo" && de > por) permitidos.add(de - por);
  const principal = `R$ ${formatarBR(por)}`;
  return texto.replace(/R\$\s*\d[\d.]*(?:,\d{1,2})?/g, (m) => (permitidos.has(valorBR(m)) ? m : principal));
}

// Monta o JSON do campo `extra` conforme o template (dados específicos da arte).
// `travas` são valores digitados pelo usuário — usados exatos e preservados no regerar.
function montarExtra(marca: Marca, template: Template, g: Gerado, seed: number, travas?: Travas, categoria?: string): string | null {
  if (template === "promocao") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const oferta = travas?.oferta || g.oferta?.trim() || "";
    const validade = travas?.validade || g.validade?.trim() || "";
    const inclui = (travas?.inclui || []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return JSON.stringify({
      oferta,
      validade,
      inclui,
      regras: travas?.regras || "",
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      // Guarda o que foi digitado pra manter fixo quando o usuário regerar o texto.
      ofertaTravada: travas?.oferta || undefined,
      validadeTravada: travas?.validade || undefined,
    });
  }
  if (template === "data-comemorativa") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    return JSON.stringify({
      selo: g.selo?.trim() || "",
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
    });
  }
  if (template === "divulgacao") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const manuais = (travas?.diferenciais || []).map((s) => s.trim()).filter(Boolean);
    const diferenciais = (manuais.length ? manuais : g.diferenciais || []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
    return JSON.stringify({
      diferenciais,
      parcelamento: travas?.parcelamento || "", // ex: "em até 10x sem juros"
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      // Mantém fixos os diferenciais e o parcelamento digitados ao regerar o texto.
      diferenciaisTravados: manuais.length ? manuais : undefined,
      parcelamentoTravado: travas?.parcelamento || undefined,
    });
  }
  if (template === "dica") {
    // Guarda a categoria do banco (pro botão "🎲 Banco") e a cor de fundo escolhida —
    // usada quando a dica vira Story Colorida (sem foto).
    const cat = categoria && categoria !== "geral" ? categoria : "";
    const obj: Record<string, unknown> = {};
    if (cat) obj.categoria = cat;
    if (travas?.corFundo) { obj.corFundo = travas.corFundo; obj.corFundoTravada = travas.corFundo; }
    return Object.keys(obj).length ? JSON.stringify(obj) : null;
  }
  if (template === "preco") {
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const modoPreco = travas?.modoPreco || "promo";
    const de = valorBR(travas?.precoDe);
    const por = valorBR(travas?.precoPor);
    // Economia (só no modo promoção): usa a digitada ou calcula De − Por automaticamente.
    const economia = modoPreco === "promo" ? (travas?.economia?.trim() || (de > por && por > 0 ? formatarBR(de - por) : "")) : "";
    const conds = (travas?.condicoes || []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return JSON.stringify({
      modoPreco,
      precoDe: travas?.precoDe || "",
      precoPor: travas?.precoPor || "",
      labelPor: travas?.labelPor || "",
      parcelas: travas?.parcelas || "",
      economia,
      condicoes: conds,
      validade: travas?.validade || "",
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      // Travados — preservados ao regerar (só título/legenda da IA mudam).
      modoPrecoTravado: modoPreco,
      precoDeTravado: travas?.precoDe || undefined,
      precoPorTravado: travas?.precoPor || undefined,
      labelPorTravado: travas?.labelPor || undefined,
      parcelasTravado: travas?.parcelas || undefined,
      economiaTravada: travas?.economia || undefined,
      condicoesTravadas: conds.length ? conds : undefined,
      validadeTravada: travas?.validade || undefined,
    });
  }
  if (template === "feedback") {
    // O DEPOIMENTO é real (do cliente) — sempre travado, nunca inventado pela IA.
    // O "destaque" usa o digitado pelo dono ou, se vazio, a frase curta que a IA extraiu.
    const cat = categoria && categoria !== "geral" ? categoria : "";
    return JSON.stringify({
      depoimento: travas?.depoimento || "",
      autor: travas?.autor || "",
      estrelas: typeof travas?.estrelas === "number" ? travas.estrelas : 5,
      destaque: travas?.destaque || g.destaque || "",
      corCard: travas?.corCard || "",
      categoria: cat || undefined,
      // Foto do cliente (opcional) + selo "Avaliação no Google".
      fotoAutor: travas?.fotoAutor || "",
      google: travas?.google || false,
      // Travados — preservados ao regerar (só a legenda/destaque-IA mudam).
      depoimentoTravado: travas?.depoimento || undefined,
      autorTravado: travas?.autor || undefined,
      estrelasTravada: typeof travas?.estrelas === "number" ? travas.estrelas : undefined,
      destaqueTravado: travas?.destaque || undefined,
      corCardTravada: travas?.corCard || undefined,
      fotoAutorTravada: travas?.fotoAutor || undefined,
      googleTravado: travas?.google || undefined,
    });
  }
  if (template === "moldura" || template === "faixa") {
    // Visuais "capa": só a cor de fundo (moldura) / cor da faixa (faixa). A faixa
    // também usa foto real do banco (tratada via USA_FOTO), por isso guarda a categoria.
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const cat = categoria && categoria !== "geral" ? categoria : "";
    return JSON.stringify({
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      categoria: cat || undefined,
    });
  }
  if (template === "mosaico") {
    // As 4 fotos reais NÃO entram aqui (são sorteadas e mescladas depois, em
    // aplicarFotosMosaico). Aqui só o selo opcional, a categoria e a cor de fundo.
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const oferta = travas?.oferta || g.oferta?.trim() || "";
    const validade = travas?.validade || g.validade?.trim() || "";
    const cat = categoria && categoria !== "geral" ? categoria : "";
    return JSON.stringify({
      oferta,
      validade,
      categoria: cat || undefined,
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      ofertaTravada: travas?.oferta || undefined,
      validadeTravada: travas?.validade || undefined,
    });
  }
  if (template === "vitrine") {
    // As 6 fotos são sorteadas e mescladas depois (aplicarFotosMosaico). Aqui só categoria + cor.
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const cat = categoria && categoria !== "geral" ? categoria : "";
    return JSON.stringify({
      categoria: cat || undefined,
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
    });
  }
  if (template === "enquete") {
    // VS/Enquete: os dois lados + cor das faixas + categoria da foto de fundo.
    const paleta = paletaDaMarca(marca.paleta, marca.corPrimaria);
    const cat = categoria && categoria !== "geral" ? categoria : "";
    const ladoA = travas?.ladoA || g.ladoA?.trim() || "";
    const ladoB = travas?.ladoB || g.ladoB?.trim() || "";
    return JSON.stringify({
      ladoA,
      ladoB,
      categoria: cat || undefined,
      corFundo: travas?.corFundo || escolherFundoFesta(paleta, seed),
      corFundoTravada: travas?.corFundo || undefined,
      ladoATravado: travas?.ladoA || undefined,
      ladoBTravado: travas?.ladoB || undefined,
    });
  }
  return null;
}

// Escolhe as fotos reais do Mosaico/Vitrine e MESCLA no extra da publicação — sem apagar
// o selo/cor já gravados por montarExtra. FOTO-PRIMEIRO: `fotosProntas` (plano da Bia) tem
// prioridade; senão, com `tema`, escolhe as fotos que ILUSTRAM o tema pelas descrições
// (fim do "Um olhar na cozinha" com foto de fliperama); só cai no rodízio cego quando o
// banco não tem descrições. Se faltar foto, completa com o rodízio (sem repetir).
async function aplicarFotosMosaico(pubId: string, marcaId: string, categoria?: string, n = 4, tema?: string, fotosProntas?: string[]) {
  const prontas = (fotosProntas ?? []).filter(Boolean);
  let fotos: string[];
  if (prontas.length >= n) {
    fotos = prontas.slice(0, n);
  } else {
    const porTema = tema?.trim() ? (await escolherImagensPorTema(marcaId, categoria, tema, n)).map((f) => f.url) : [];
    fotos = porTema.length ? porTema : await sortearImagensBanco(marcaId, n, categoria);
    if (fotos.length < n) {
      const extras = (await sortearImagensBanco(marcaId, n - fotos.length + 2, categoria)).filter((u) => !fotos.includes(u));
      fotos = [...fotos, ...extras].slice(0, n);
    }
  }
  const p = await prisma.publicacao.findUnique({ where: { id: pubId }, select: { extra: true } });
  let ex: Record<string, unknown> = {};
  try {
    ex = JSON.parse(p?.extra || "{}");
  } catch {}
  ex.fotos = fotos;
  await prisma.publicacao.update({ where: { id: pubId }, data: { extra: JSON.stringify(ex) } });
}

const GUIA: Record<Template, string> = {
  promocao:
    'Crie uma PROMOÇÃO/OFERTA irresistível pro público da marca. O "titulo" é a chamada principal (curta e forte); preencha "oferta" com o benefício em destaque e "validade" com a condição, quando fizer sentido.',
  "data-comemorativa":
    'Crie uma SAUDAÇÃO calorosa para a data comemorativa indicada (ex: Natal, Dia das Crianças, Páscoa). O "titulo" é a saudação principal, curta e festiva (ex: "Feliz Natal!"); preencha "selo" com o nome/data da comemoração e "texto" com uma mensagem afetuosa que conecte a data com a marca. NÃO ofereça promoção aqui — é puro carinho/celebração.',
  divulgacao:
    'Crie uma DIVULGAÇÃO INSTITUCIONAL ("por que escolher a gente"). O "titulo" é uma chamada de valor, curta e convidativa (ex: "A festa dos sonhos começa aqui"); preencha "diferenciais" com 3 ou 4 pontos fortes BEM curtos (2 a 4 palavras cada, ex: "Monitores treinados", "Buffet completo"). Foco em confiança e qualidade — NÃO ofereça desconto/promoção aqui.',
  dica: 'Faça uma DICA prática e útil pro público da marca. O "titulo" é a dica em si, direta.',
  mosaico:
    'Crie uma CAPA do tipo "mostre seu espaço" — um post que exibe FOTOS REAIS do lugar/produtos. O "titulo" é uma chamada curta e atraente (2 a 5 palavras, ex: "Especial de Férias", "Conheça nosso espaço"). Se fizer sentido um chamariz leve, preencha "oferta" com um selo CURTÍSSIMO (ex: CONDIÇÃO ESPECIAL) e "validade" com o período; senão deixe vazios. NÃO invente preço/desconto.',
  moldura:
    'Crie um POST de DESTAQUE com o título numa moldura lúdica. O "titulo" é uma chamada curta e forte (2 a 5 palavras) que vai GRANDE dentro da moldura; "texto" é uma frase de apoio curta. Tom festivo e convidativo. NÃO invente promoção/preço.',
  faixa:
    'Crie um POST com FOTO de fundo e o título numa faixa diagonal. O "titulo" é uma chamada curta e impactante (2 a 5 palavras) que vai na faixa; "texto" é uma frase de apoio curta. Tom convidativo. NÃO invente promoção/preço.',
  feedback:
    'Você está criando um post de DEPOIMENTO de um cliente REAL. O texto do depoimento JÁ EXISTE (é fornecido) e NÃO pode ser alterado nem inventado. Sua tarefa: (1) "destaque" = uma frase BEM curta (2 a 4 palavras) que capture o elogio principal do depoimento (ex: "Excelente atendimento!", "Festa inesquecível!"); (2) "legenda" = um agradecimento caloroso e humano ao cliente, sem exagerar além do que ele escreveu. Baseie TUDO no depoimento fornecido. Nunca invente elogios.',
  preco:
    'Crie um post de OFERTA/PACOTE com PREÇO em destaque. Os VALORES (preços, parcelas, economia) são fornecidos e NÃO podem ser alterados nem inventados. O "titulo" é a chamada da promoção, curta e irresistível (ex: "Promoção Especial da Copa", "Pacote Imperdível"). Escreva a "legenda" destacando a oportunidade e convidando a fechar — sem inventar valores ou condições além dos fornecidos.',
  enquete:
    'Crie uma ENQUETE / VS divertida pra ENGAJAR (gerar comentário): duas opções que disputam ("Time X VS Equipe Y"). O "titulo" é a PERGUNTA curta e provocativa (ex: "Que lado você fica?", "Qual time vence?"). Preencha "ladoA" e "ladoB" com os dois lados CURTÍSSIMOS (1 a 2 palavras cada, ex: Salgados / Docinhos, Pula-pula / Piscina de bolinhas). A "legenda" CONVIDA a comentar a escolha (ex: "Comenta aqui o seu time! 👇"). Tom leve e brincalhão. NÃO invente preço/promoção.',
  vitrine:
    'Crie uma VITRINE que mostra a VARIEDADE do buffet em fotos reais (ex: comidinhas, brinquedos, festas). O "titulo" é uma chamada CURTA e gostosa (2 a 4 palavras, ex: "Comidinhas deliciosas!", "Diversão garantida"). O "texto" é um subtítulo curto e convidativo (ex: "Muitas opções que todo mundo ama!"). NÃO invente preço/promoção. As fotos vêm do banco automaticamente.',
};

// ÂNGULOS de DICA (conteúdo) — lista AMPLA de assuntos pra uma festa infantil. Sem isso, o
// gpt-4o-mini travava sempre em "decoração/festa temática" (era o assunto mais óbvio) e o dono
// regenerava sem sair disso. A cada dica SEM tema definido, sorteamos um destes pra variar de
// verdade — comida, horário, convidados, segurança, orçamento, brincadeiras, etc. A marca é o
// LOCAL da festa: nenhum ângulo manda "procurar/escolher local" (o sistema já proíbe isso).
const ANGULOS_DICA = [
  "quanto tempo antes começar a organizar a festa",
  "como definir quantas crianças convidar",
  "o melhor horário pra festa conforme a idade das crianças",
  "quando e como enviar os convites",
  "montar um cardápio que agrada crianças E adultos",
  "quanto de comida calcular por criança",
  "opções pra crianças com alergia ou restrição alimentar",
  "manter as crianças hidratadas e com lanchinho ao longo da festa",
  "a duração ideal de uma festa infantil sem cansar",
  "brincadeiras e atividades pra diferentes idades ao mesmo tempo",
  "o que muda na festa de 1 aninho (bebê) x criança maior",
  "lembrancinhas simples que as crianças amam",
  "como organizar a hora do parabéns sem correria",
  "dicas pra registrar as melhores fotos e vídeos da festa",
  "como envolver e acolher os pais convidados",
  "cuidados de segurança com as crianças durante a festa",
  "como fechar a festa quando o sono/cansaço bate",
  "como economizar na festa sem perder a graça",
  "um checklist do que não pode faltar no dia da festa",
  "delegar tarefas pra os pais também curtirem a festa",
  "festa no calor: conforto e hidratação das crianças",
  "como escolher a melhor data (fugir de feriado e véspera de aula)",
  "diversão de verdade: menos telas, mais brincadeira",
  "como incluir crianças tímidas ou com necessidades diferentes",
  "combinar comidinhas doces e salgadas sem desperdício",
  "o que fazer pra o aniversariante aproveitar a própria festa",
];

function anguloDicaAleatorio(): string {
  return ANGULOS_DICA[Math.floor(Math.random() * ANGULOS_DICA.length)];
}

// Formato de JSON esperado por template (a Promoção pede oferta/validade).
const FORMATO_JSON: Record<Template, string> = {
  promocao: `{
  "titulo": "chamada principal forte e curta (3 a 6 palavras) — vai GRANDE na arte",
  "oferta": "o benefício em destaque, CURTÍSSIMO e em CAIXA ALTA (ex: 10 CRIANÇAS GRÁTIS, 30% OFF) — ou vazio",
  "texto": "1 frase de apoio curta (até ~16 palavras)",
  "validade": "condição/validade curta (ex: Válido para os 10 primeiros contratos) — ou vazio",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  "data-comemorativa": `{
  "titulo": "saudação principal curta e festiva (2 a 5 palavras) — vai GRANDE na arte (ex: Feliz Natal!)",
  "selo": "nome/data curta da comemoração (ex: 25 de Dezembro, Dia das Crianças) — ou vazio",
  "texto": "mensagem afetuosa curta (até ~16 palavras) ligando a data à marca",
  "legenda": "legenda do post (3-5 linhas com \\n), tom caloroso, termina com um convite leve",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  divulgacao: `{
  "titulo": "chamada de valor curta e convidativa (3 a 6 palavras) — vai GRANDE na arte",
  "diferenciais": ["3 a 4 pontos fortes, cada um com 2 a 4 palavras (ex: Monitores treinados)"],
  "texto": "1 frase de apoio curta (até ~16 palavras) — usada só se não houver diferenciais",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  dica: `{
  "titulo": "frase principal forte e curta (até ~9 palavras) — texto GRANDE da arte",
  "texto": "texto de apoio curto, 1 frase (até ~18 palavras)",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com convite à ação",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  mosaico: `{
  "titulo": "chamada curta e forte (2 a 5 palavras) — vai GRANDE na arte (ex: Especial de Férias)",
  "oferta": "selo curtíssimo em destaque (ex: CONDIÇÃO ESPECIAL) — ou vazio",
  "validade": "condição/período curto (ex: Datas de julho) — ou vazio",
  "texto": "1 frase de apoio curta — opcional",
  "legenda": "legenda do post (3-5 linhas com \\n), convida a conhecer o espaço e chamar no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  moldura: `{
  "titulo": "chamada curta e forte (2 a 5 palavras) — vai GRANDE dentro da moldura",
  "texto": "1 frase de apoio curta (até ~14 palavras)",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com um convite leve",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  faixa: `{
  "titulo": "chamada curta e impactante (2 a 5 palavras) — vai na faixa diagonal",
  "texto": "1 frase de apoio curta (até ~14 palavras)",
  "legenda": "legenda do post (3-5 linhas com \\n), termina com um convite leve",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  feedback: `{
  "destaque": "frase BEM curta (2 a 4 palavras) que resume o elogio do depoimento (ex: Excelente atendimento!) — vai GRANDE na arte",
  "legenda": "legenda do post (3-5 linhas com \\n) agradecendo o cliente de forma calorosa e humana, convidando outras famílias a viverem a experiência. NÃO invente nada além do que o cliente escreveu",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  preco: `{
  "titulo": "chamada da promoção curta e irresistível (2 a 5 palavras) — vai GRANDE na arte (ex: Promoção Especial da Copa)",
  "legenda": "legenda do post (3-5 linhas com \\n) destacando a oportunidade e convidando a fechar no WhatsApp. NÃO invente valores nem condições",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  enquete: `{
  "titulo": "a PERGUNTA da enquete, curta (2 a 6 palavras) — ex: Que lado você fica?",
  "ladoA": "primeiro lado, 1-2 palavras (ex: Salgados)",
  "ladoB": "segundo lado, 1-2 palavras (ex: Docinhos)",
  "texto": "frase de apoio curta — opcional",
  "legenda": "legenda do post (3-5 linhas com \\n) que CONVIDA a comentar a escolha, termina chamando a interação (ex: comenta aqui!)",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
  vitrine: `{
  "titulo": "chamada curta e gostosa (2 a 4 palavras) — vai GRANDE na faixa central (ex: Comidinhas deliciosas!)",
  "texto": "subtítulo curto e convidativo (até ~12 palavras, ex: Muitas opções que todo mundo ama!)",
  "legenda": "legenda do post (3-5 linhas com \\n), convida a conhecer e chamar no WhatsApp",
  "hashtags": "8 a 12 hashtags relevantes separadas por espaço, começando com #"
}`,
};

function sistema(marca: Marca, template: Template): string {
  const tel = marca.telefone ? ` Telefone/WhatsApp: ${marca.telefone}.` : "";
  return `Você cria POSTS DE FEED (imagem única) para o Instagram da marca "${marca.nome}". ${
    marca.descricao || "Negócio local."
  }${tel}

Tom: profissional, próximo e confiável. Sem jargão de guru, sem "prezado cliente", no máximo 1 emoji no texto.

REGRA CRÍTICA (nunca quebrar): a marca É o próprio local/espaço da festa. NUNCA escreva nada que mande o cliente "escolher o local", "reservar um espaço", "encontrar/procurar/comparar local, salão ou buffet", nem dicas genéricas que sugiram buscar outro lugar — isso manda o cliente pra longe e é um erro grave. Todo conteúdo posiciona a marca como O lugar onde a festa acontece; o convite é sempre comemorar/fechar a festa COM a marca, não procurar local por aí.

Devolva SEMPRE um JSON válido:
${FORMATO_JSON[template]}
Português do Brasil.`;
}

type Gerado = { titulo: string; texto?: string; oferta?: string; validade?: string; selo?: string; diferenciais?: string[]; destaque?: string; ladoA?: string; ladoB?: string; legenda: string; hashtags: string };

// Templates que usam foto de IA de fundo (os de fundo colorido não geram foto).
// O Mosaico também usa fotos reais, mas precisa de VÁRIAS (tratadas à parte em
// aplicarFotosMosaico), por isso fica fora do fluxo de foto única do USA_FOTO.
const USA_FOTO: Record<Template, boolean> = { promocao: false, "data-comemorativa": true, divulgacao: false, dica: true, mosaico: false, moldura: false, faixa: true, feedback: true, preco: false, enquete: true, vitrine: false };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Próxima data de feed (dias da agenda da marca) ainda livre.
async function proximaDataFeed(marca: Marca): Promise<Date> {
  const dias = marca.diasFeed.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  const usadas = new Set(
    (await prisma.publicacao.findMany({ where: { marcaId: marca.id }, select: { data: true } })).map(
      (p) => p.data.toISOString().slice(0, 10)
    )
  );
  const hoje = new Date();
  for (let i = 0; i < 40; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (!dias.includes(d.getDay())) continue;
    const iso = d.toISOString().slice(0, 10);
    if (usadas.has(iso)) continue;
    return new Date(`${iso}T${String(marca.horaPost).padStart(2, "0")}:00:00-03:00`);
  }
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  return new Date(`${amanha.toISOString().slice(0, 10)}T10:00:00-03:00`);
}

// Erro da OpenAI com mensagem JÁ pronta pro usuário (a UI mostra direto, em vez do
// genérico "confira a chave" — que enganava quando a chave estava certa).
class ErroOpenAI extends Error {}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chama o chat da OpenAI com RETRY automático: erros transitórios (limite de uso 429,
// instabilidade 5xx, queda de conexão) são tentados de novo com uma pausinha — é o que
// resolve o "deu erro mas a chave está certa". Erros definitivos (chave inválida, sem
// crédito) NÃO insistem e devolvem uma mensagem clara do que aconteceu.
async function chatOpenAI(key: string, body: object, tentativas = 3): Promise<string> {
  let motivo: "limite" | "instavel" | "rede" | "vazia" = "instavel";
  for (let i = 0; i < tentativas; i++) {
    let resp: Response;
    try {
      resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      motivo = "rede";
      await esperar(400 * (i + 1));
      continue;
    }
    if (resp.ok) {
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return content as string;
      motivo = "vazia";
      await esperar(400 * (i + 1));
      continue;
    }
    const corpo = (await resp.text().catch(() => "")).slice(0, 300);
    if (resp.status === 401) throw new ErroOpenAI("A chave da OpenAI parece inválida ou expirou. Confira a OPENAI_API_KEY nas variáveis de ambiente.");
    if (resp.status === 429) {
      // 429 pode ser limite de ritmo (vale tentar de novo) OU falta de crédito (não adianta).
      if (/insufficient_quota|exceeded your current quota|billing/i.test(corpo)) {
        throw new ErroOpenAI("Os créditos da OpenAI acabaram (ou o limite de cobrança foi atingido). Recarregue créditos na conta da OpenAI.");
      }
      motivo = "limite";
      await esperar(900 * (i + 1));
      continue;
    }
    if (resp.status >= 500) {
      motivo = "instavel";
      await esperar(700 * (i + 1));
      continue;
    }
    throw new ErroOpenAI(`A OpenAI recusou o pedido (erro ${resp.status}). Tente de novo em instantes.`);
  }
  if (motivo === "limite") throw new ErroOpenAI("A OpenAI está limitando as gerações (muitas seguidas em pouco tempo). Espere alguns segundos e tente de novo.");
  if (motivo === "rede") throw new ErroOpenAI("Não consegui falar com a OpenAI agora (conexão). Tente de novo em instantes.");
  if (motivo === "vazia") throw new ErroOpenAI("A OpenAI devolveu uma resposta vazia. Tente gerar de novo.");
  throw new ErroOpenAI("A OpenAI está instável agora. Tente de novo em instantes.");
}

async function gerarTexto(marca: Marca, template: Template, tema?: string, travas?: Travas, fotoDesc?: string): Promise<Gerado> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ErroOpenAI("A chave da OpenAI não está configurada (OPENAI_API_KEY).");
  let pedido: string;
  if (template === "dica" && fotoDesc?.trim()) {
    // FOTO-PRIMEIRO: a dica NASCE da foto que a acompanha — assim a imagem SEMPRE conversa com o
    // texto. Uma dica útil INSPIRADA no que a foto mostra (mesa de doces → quantos docinhos; brinquedo
    // → brincadeira por idade; espaço → conforto), nunca "olha que decoração linda".
    pedido = `${GUIA.dica} A foto que acompanha o post mostra: "${fotoDesc.trim()}". Escreva uma DICA prática, ESPECÍFICA e ACIONÁVEL, ligada ao que a foto mostra, útil pra uma família que vai fazer a festa (ex: mesa de doces → quantos docinhos por criança; brinquedo → brincadeira por faixa etária; bolo → como escolher o tamanho/servir; salão cheio → como organizar a hora do parabéns). Traga um número, um horário, uma quantidade ou um passo concreto sempre que der. EVITE conselho genérico tipo "escolha um tema que as crianças amam". NÃO descreva a foto nem elogie a decoração, e NÃO invente nada que não esteja na descrição.`;
  } else if (tema?.trim()) {
    pedido = `${GUIA[template]} Tema/assunto sugerido: "${tema.trim()}".`;
  } else if (template === "dica") {
    // Sem foto nem tema (fundo colorido): sorteia um assunto da lista ampla pra variar de verdade.
    const ang = anguloDicaAleatorio();
    pedido = `${GUIA.dica} O ASSUNTO desta dica é: "${ang}". Fique NESSE assunto e dê uma dica concreta e específica. NÃO fale de decoração nem de festa temática, a menos que o próprio assunto peça.`;
  } else {
    pedido = `${GUIA[template]} Escolha um ângulo novo e útil.`;
  }
  // A oferta/validade digitadas pelo usuário são FIXAS — a IA não pode inventar outras.
  const fixos: string[] = [];
  if (travas?.oferta) fixos.push(`a oferta/desconto é EXATAMENTE "${travas.oferta}"`);
  if (travas?.validade) fixos.push(`a validade/condição é EXATAMENTE "${travas.validade}"`);
  const itensInclui = (travas?.inclui || []).map((s) => s.trim()).filter(Boolean);
  if (itensInclui.length) fixos.push(`a oferta inclui: ${itensInclui.join(", ")}`);
  if (travas?.regras) fixos.push(`as regras/condições são: "${travas.regras}"`);
  const difs = (travas?.diferenciais || []).map((s) => s.trim()).filter(Boolean);
  if (difs.length) fixos.push(`os diferenciais a destacar são EXATAMENTE: ${difs.join(", ")}`);
  if (travas?.ladoA) fixos.push(`o LADO A da enquete é EXATAMENTE "${travas.ladoA}"`);
  if (travas?.ladoB) fixos.push(`o LADO B da enquete é EXATAMENTE "${travas.ladoB}"`);
  if (fixos.length) {
    pedido += ` IMPORTANTE: ${fixos.join("; ")}. Use esses dados sem alterar e escreva o título e a legenda de forma coerente com eles. NÃO invente outros valores, descontos, itens ou condições.`;
  }
  // Feedback: o depoimento REAL do cliente é a base de tudo — a IA só resume/agradece.
  if (template === "feedback" && travas?.depoimento?.trim()) {
    const quem = travas?.autor?.trim() ? ` O cliente se chama "${travas.autor.trim()}".` : "";
    pedido += ` DEPOIMENTO REAL DO CLIENTE (não altere, não invente além disso): """${travas.depoimento.trim()}""".${quem} Gere o "destaque" e a "legenda" baseados SOMENTE nesse depoimento.`;
  }
  // PREÇO: os valores são do dono e a IA JAMAIS pode citar outro número na legenda.
  // Sem isso a IA inventava um preço (ex: usuário põe R$ 5.990, legenda saía R$ 1.200).
  if (template === "preco" && travas?.precoPor?.trim()) {
    const modo = travas.modoPreco || "promo";
    const partes: string[] = [];
    if (modo === "promo" && travas.precoDe?.trim()) partes.push(`preço ANTES (de): R$ ${travas.precoDe.trim()}`);
    partes.push(`${modo === "apartir" ? "preço A PARTIR DE" : "preço"}: R$ ${travas.precoPor.trim()}`);
    if (travas.parcelas?.trim()) partes.push(`parcelamento: ${travas.parcelas.trim()}`);
    if (modo === "promo") {
      const eco = travas.economia?.trim() || (valorBR(travas.precoDe) > valorBR(travas.precoPor) ? formatarBR(valorBR(travas.precoDe) - valorBR(travas.precoPor)) : "");
      if (eco) partes.push(`economia: R$ ${eco}`);
    }
    if ((travas.condicoes || []).filter((s) => s.trim()).length) partes.push(`condições: ${travas.condicoes!.filter((s) => s.trim()).join(", ")}`);
    if (travas.validade?.trim()) partes.push(`validade: ${travas.validade.trim()}`);
    pedido += ` VALORES OFICIAIS (use EXATAMENTE estes na legenda — é PROIBIDO citar qualquer outro número de preço, desconto ou parcela): ${partes.join("; ")}.`;
  }
  const content = await chatOpenAI(key, {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.85,
    messages: [
      { role: "system", content: sistema(marca, template) },
      { role: "user", content: pedido },
    ],
  });
  const g = JSON.parse(content) as Gerado;
  // Blindagem final: garante que nenhum preço inventado escape pra legenda/título.
  if (template === "preco") {
    g.legenda = blindarPrecoLegenda(g.legenda, travas);
    if (g.titulo) g.titulo = blindarPrecoLegenda(g.titulo, travas);
  }
  return g;
}

// Campos manuais que o usuário fornece por template (mesmos no gerar e no editar).
type CamposTemplate = {
  oferta?: string; validade?: string; inclui?: string[]; regras?: string; diferenciais?: string[]; corFundo?: string;
  depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string;
  precoDe?: string; precoPor?: string; labelPor?: string; parcelas?: string; economia?: string; condicoes?: string[]; modoPreco?: string;
  ladoA?: string; ladoB?: string; fotoAutor?: string; google?: boolean; parcelamento?: string;
};

// Monta as "travas" (valores fixos do dono) conforme o template. Cada template usa só
// os campos que fazem sentido pra ele. Reaproveitado por gerarPublicacao e editarPublicacao.
function montarTravas(template: Template, c: CamposTemplate): Travas {
  let travas: Travas = {};
  if (template === "promocao") {
    travas = { oferta: c.oferta?.trim() || undefined, validade: c.validade?.trim() || undefined, inclui: (c.inclui || []).map((s) => s.trim()).filter(Boolean), regras: c.regras?.trim() || undefined };
  } else if (template === "divulgacao") {
    travas = { diferenciais: (c.diferenciais || []).map((s) => s.trim()).filter(Boolean), parcelamento: c.parcelamento?.trim() || undefined };
  } else if (template === "mosaico") {
    travas = { oferta: c.oferta?.trim() || undefined, validade: c.validade?.trim() || undefined };
  } else if (template === "feedback") {
    travas = { depoimento: c.depoimento?.trim() || undefined, autor: c.autor?.trim() || undefined, estrelas: typeof c.estrelas === "number" ? Math.max(1, Math.min(5, c.estrelas)) : 5, destaque: c.destaque?.trim() || undefined, corCard: c.corCard?.trim() || undefined, fotoAutor: c.fotoAutor?.trim() || undefined, google: c.google || undefined };
  } else if (template === "preco") {
    travas = { modoPreco: c.modoPreco || "promo", precoDe: c.precoDe?.trim() || undefined, precoPor: c.precoPor?.trim() || undefined, labelPor: c.labelPor?.trim() || undefined, parcelas: c.parcelas?.trim() || undefined, economia: c.economia?.trim() || undefined, condicoes: (c.condicoes || []).map((s) => s.trim()).filter(Boolean), validade: c.validade?.trim() || undefined };
  } else if (template === "enquete") {
    travas = { ladoA: c.ladoA?.trim() || undefined, ladoB: c.ladoB?.trim() || undefined };
  }
  travas.corFundo = c.corFundo?.trim() || undefined;
  return travas;
}

export async function gerarPublicacao(input: {
  marcaId: string;
  template: Template;
  tema?: string;
  data?: string;
  oferta?: string;
  validade?: string;
  inclui?: string[];
  regras?: string;
  diferenciais?: string[];
  parcelamento?: string; // divulgacao: selo de parcelamento (ex: "em até 10x sem juros")
  categoria?: string; // categoria do banco pra puxar a foto (templates com foto)
  corFundo?: string; // cor de fundo escolhida (vazio = automático/sorteio)
  depoimento?: string; // feedback: o depoimento REAL do cliente (obrigatório)
  autor?: string; // feedback: nome do cliente
  estrelas?: number; // feedback: nota 1-5
  destaque?: string; // feedback: frase de destaque (vazio = IA extrai do depoimento)
  corCard?: string; // feedback: cor do balão (vazio = branco)
  fotoAutor?: string; // feedback: foto do cliente (círculo) — opcional
  google?: boolean; // feedback: mostra o selo "Avaliação no Google"
  precoDe?: string; // preco: valor antigo (riscado) — opcional
  precoPor?: string; // preco: valor da oferta (obrigatório)
  labelPor?: string; // preco: forma (ex: "À vista")
  parcelas?: string; // preco: ex "5x de R$ 9.000"
  economia?: string; // preco: vazio = calcula De − Por automaticamente
  condicoes?: string[]; // preco: condições (ex: "Seg a Sex", "50 a 70 convidados")
  modoPreco?: string; // preco: "promo" (De→Por) | "unico" | "apartir"
  hora?: number; // hora do post (BRT) — permite vários posts no mesmo dia em horas diferentes
  formato?: string; // "feed" (padrão, 4:5) | "story" (9:16, vai pro Story)
  comFoto?: boolean; // força (true) ou impede (false) foto de fundo; undefined = padrão do template
  estiloStory?: string; // colorida | foto | faixa — guardado no extra pro render do Story
  ladoA?: string; // enquete: lado A (ex: Salgados)
  ladoB?: string; // enquete: lado B (ex: Docinhos)
  imagemUrl?: string; // foto de fundo ESCOLHIDA no formulário (banco/upload) — prioridade sobre a automática
  fotos?: string[]; // mosaico/vitrine: fotos JÁ escolhidas (plano da Bia, foto-primeiro) — o tema nasceu delas
  fotoDesc?: string; // dica: descrição da foto escolhida (o piloto passa a do plano) — o texto nasce dela
}) {
  const g = await guardaMarca(input.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const cred = await checarCreditoTrial(g.sessao); // teste grátis: barra quando os créditos acabam
  if (!cred.ok) return { ok: false as const, erro: cred.erro };
  const marca = await prisma.marca.findUnique({ where: { id: input.marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const template = (TEMPLATES as readonly string[]).includes(input.template) ? input.template : "dica";

  // Validações de campos obrigatórios por template.
  if (template === "feedback" && !input.depoimento?.trim()) return { ok: false as const, erro: "Cole o depoimento do cliente pra gerar o feedback." };
  if (template === "preco" && !input.precoPor?.trim()) return { ok: false as const, erro: "Informe ao menos o preço da oferta (Por R$)." };
  const travas = montarTravas(template, input);

  // Dia/hora do post (computado ANTES da IA pra já validar os limites do pacote sem gastar
  // geração à toa).
  const horaFeed = typeof input.hora === "number" ? input.hora : marca.horaPost;
  const data = input.data
    ? new Date(`${input.data}T${String(horaFeed).padStart(2, "0")}:00:00-03:00`)
    : await proximaDataFeed(marca);

  // Limites do PACOTE do dono (só marca de cliente com plano; admin não tem limite):
  // Story a partir do Profissional; feed limitado por dia.
  const ehStory = input.formato === "story";
  const plano = await planoDaMarca(marca.id);
  if (plano && ehStory && !planoTemStory(plano)) {
    return { ok: false as const, erro: "O Story está disponível a partir do pacote Profissional. Faça upgrade pra liberar." };
  }
  if (plano && !ehStory) {
    const lim = await checarLimiteFeed(marca.id, data, plano);
    if (lim.bloqueia) return { ok: false as const, erro: `O pacote ${rotuloPlano(plano)} permite ${lim.limite} post${lim.limite > 1 ? "s" : ""} de feed por dia — esse dia já tem ${lim.jaTem}. Escolha outro dia.` };
  }

  // Templates com foto (dica etc.): prioriza FOTO REAL do banco. `querFoto` decidido aqui em cima
  // porque a DICA é FOTO-PRIMEIRO — escolhe a foto ANTES do texto pra o texto nascer dela.
  const querFoto = input.comFoto === undefined ? USA_FOTO[template] : input.comFoto;
  let fotoDica: { url: string; descricao: string } | null = null;
  if (template === "dica" && querFoto) {
    // Foto escolhida pelo dono (imagemUrl) ou mandada pelo piloto (imagemUrl+fotoDesc) tem prioridade;
    // senão sorteia uma do banco em rodízio. Sem foto COM descrição → null → cai no fundo colorido.
    if (input.imagemUrl) fotoDica = { url: input.imagemUrl, descricao: input.fotoDesc?.trim() || "" };
    else fotoDica = await sortearFotoComDescricao(marca.id, input.categoria);
  }

  let gerado: Gerado;
  try {
    // A dica nasce da DESCRIÇÃO da foto (foto-primeiro) — a imagem sempre conversa com o texto.
    gerado = await gerarTexto(marca, template, input.tema, travas, fotoDica?.descricao);
  } catch (e) {
    console.error("Erro ao gerar publicação:", e);
    const msg = e instanceof ErroOpenAI ? e.message : "Não consegui gerar agora. Tente de novo em instantes.";
    return { ok: false as const, erro: msg };
  }
  const slug = `${marca.slug}-${template}-${slugify(gerado.titulo || template)}-${Date.now().toString(36).slice(-4)}`;
  const criado = await prisma.publicacao.create({
    data: {
      marcaId: marca.id,
      slug,
      data,
      template,
      titulo: gerado.titulo || marca.nome,
      texto: gerado.texto || "",
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      extra: montarExtra(marca, template, gerado, Date.now(), travas, input.categoria),
      tema: input.tema?.trim() || null,
      // Categoria de intenção (pra inteligência) — vem do template, sem IA. NÃO confundir
      // com `input.categoria`, que é a categoria de FOTO do banco (espaco|comida|…).
      categoria: categoriaDoTemplate(template),
      status: "a_postar",
      formato: input.formato === "story" ? "story" : "feed",
    },
  });
  // Templates com foto: prioriza FOTO REAL do banco da marca (da categoria pedida,
  // ex: dica de cardápio → foto de comida); só se o banco estiver vazio é que a IA
  // gera um fundo decorativo abstrato. (Promoção/Divulgação usam fundo colorido.)
  let avisoFoto = false; // usuário PEDIU foto (Story Foto/Faixa) mas o banco estava vazio
  if (template === "mosaico") {
    // 4 fotos reais no extra: as do plano da Bia (foto-primeiro) ou escolhidas pelo TEMA.
    await aplicarFotosMosaico(criado.id, marca.id, input.categoria, 4, input.tema, input.fotos).catch(() => {});
  } else if (template === "vitrine") {
    // Vitrine: 6 fotos reais no extra (plano da Bia ou escolhidas pelo tema).
    await aplicarFotosMosaico(criado.id, marca.id, input.categoria, 6, input.tema, input.fotos).catch(() => {});
  } else if (template === "dica") {
    // FOTO-PRIMEIRO: anexa a foto que já foi escolhida lá em cima (o texto nasceu da descrição dela).
    // Sem foto com descrição no banco → fica sem imagem = fundo colorido da marca (nunca briga).
    if (fotoDica?.url) await definirImagemPublicacao({ id: criado.id, url: fotoDica.url }).catch(() => {});
  } else if (input.imagemUrl) {
    // Foto ESCOLHIDA pelo dono no formulário (banco/upload) — tem prioridade sobre a automática.
    await definirImagemPublicacao({ id: criado.id, url: input.imagemUrl }).catch(() => {});
  } else if (querFoto) {
    // Escolhe a foto que MAIS combina com o texto do post (pelas descrições da IA);
    // cai no rodízio normal se não houver descrições/texto.
    const textoFoto = [input.tema, gerado.titulo, gerado.ladoA, gerado.ladoB].filter(Boolean).join(" ");
    const real = await escolherImagemPorTexto(marca.id, input.categoria, textoFoto);
    if (real) await definirImagemPublicacao({ id: criado.id, url: real }).catch(() => {});
    else {
      // Banco vazio: gera um fundo decorativo de IA pra o post NUNCA sair em branco —
      // vale tanto pros templates de foto quanto quando o Story FORÇA "Foto/Faixa".
      await gerarImagemPublicacao({ id: criado.id }).catch(() => {});
      // Quando o usuário PEDIU foto (Story) e o banco estava vazio, avisa que caiu no
      // fundo de IA — pra ele saber que, pra usar o espaço real, precisa cadastrar fotos.
      if (input.comFoto === true) avisoFoto = true;
    }
  }
  // Guarda o estilo do Story no extra (o render usa pra escolher a variante, ex: faixa).
  if (input.formato === "story" && input.estiloStory) {
    const cur = await prisma.publicacao.findUnique({ where: { id: criado.id }, select: { extra: true } });
    let ex: Record<string, unknown> = {};
    try { ex = JSON.parse(cur?.extra || "{}"); } catch {}
    await prisma.publicacao.update({ where: { id: criado.id }, data: { extra: JSON.stringify({ ...ex, estiloStory: input.estiloStory }) } });
  }
  revalidatePath(`/painel/marcas/${marca.id}`);
  // Devolve o DIA (chave SP) da publicação criada — a UI usa pra filtrar a lista só
  // nesse dia (em vez de abrir tudo). Ver mais é só clicar em "Ver todas".
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
  const aviso = avisoFoto
    ? "Essa marca ainda não tem fotos no banco — gerei um fundo artístico de IA. Pra usar fotos reais do seu espaço no Story, adicione fotos em 📸 Imagens."
    : undefined;
  return { ok: true as const, id: criado.id, dia, aviso };
}

// Posta um STORY (9:16) no Instagram da marca AGORA. Renderiza /api/story/[id] (vertical),
// materializa e sobe como Story (media_type=STORIES). Marca como postado.
export async function postarStory(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (ehTrial(g.sessao)) return { ok: false as const, erro: MSG_TRIAL_POSTAR };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Story não encontrado." };
  if (!marcaConectada(p.marca)) return { ok: false as const, erro: "Conecte o Instagram da marca primeiro." };
  const r = await publicarStoryNasRedes(p.marca, `${baseUrl()}/api/story/${p.id}`);
  if (!r.ig.ok) return { ok: false as const, erro: r.ig.erro };
  await prisma.publicacao.update({ where: { id }, data: { status: "postado", postadoEm: new Date(), mediaId: r.ig.mediaId } });
  await registrarAtividade(AGENTE, `Postei o Story "${p.titulo}" no Instagram de ${p.marca.nome}.`, p.marcaId);
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Define se ESTE post de feed também vira Story ao ser publicado (override do padrão
// da marca). O piloto usa `espelhar ?? marca.espelharStory`.
export async function definirEspelhar(id: string, espelhar: boolean) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.update({ where: { id }, data: { espelhar }, select: { marcaId: true } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Edição PONTUAL: muda só os campos informados (título, textos, valores…) SEM chamar a
// IA e SEM trocar a foto. Reaproveita montarTravas/montarExtra; preserva o que não é
// editável (fotos do mosaico, categoria, selo). É o "ajuste fino" da arte.
export async function editarPublicacao(input: {
  id: string;
  titulo?: string;
  texto?: string;
  legenda?: string;
  hashtags?: string;
} & CamposTemplate) {
  const g = await guardaPublicacao(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const template: Template = (TEMPLATES as readonly string[]).includes(p.template) ? (p.template as Template) : "dica";
  if (template === "feedback" && !input.depoimento?.trim()) return { ok: false as const, erro: "O depoimento não pode ficar vazio." };
  if (template === "preco" && !input.precoPor?.trim()) return { ok: false as const, erro: "Informe o preço da oferta (Por R$)." };

  let exAntigo: Record<string, unknown> = {};
  try { exAntigo = JSON.parse(p.extra || "{}"); } catch {}
  const categoria = typeof exAntigo.categoria === "string" ? exAntigo.categoria : undefined;

  const travas = montarTravas(template, input);
  const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const geradoFake: Gerado = {
    titulo: input.titulo ?? p.titulo,
    texto: input.texto ?? p.texto,
    legenda: input.legenda ?? p.legenda,
    hashtags: input.hashtags ?? p.hashtags,
    selo: typeof exAntigo.selo === "string" ? exAntigo.selo : undefined,
  };
  // Monta o novo extra com os valores editados; preserva o que não é editável (fotos do mosaico).
  let exNovo: Record<string, unknown> = {};
  try { exNovo = JSON.parse(montarExtra(p.marca, template, geradoFake, seed, travas, categoria) || "{}"); } catch {}
  if (Array.isArray(exAntigo.fotos)) exNovo.fotos = exAntigo.fotos;
  // Preserva o estilo do Story (foto/faixa/colorida) — montarExtra não o conhece, então
  // sem isso editar o texto faria um Story "faixa" voltar a renderizar como "colorida".
  if (typeof exAntigo.estiloStory === "string") exNovo.estiloStory = exAntigo.estiloStory;

  await prisma.publicacao.update({
    where: { id: input.id },
    data: {
      titulo: input.titulo?.trim() || p.titulo,
      texto: input.texto ?? p.texto,
      legenda: input.legenda ?? p.legenda,
      hashtags: input.hashtags ?? p.hashtags,
      extra: JSON.stringify(exNovo),
    },
  });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Reagenda a HORA de um post já criado (mantém o dia, troca só a hora). Permite
// ajustar o horário de postagens já programadas sem refazer nada.
export async function reagendarPublicacao(id: string, hora: number) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id }, select: { data: true, marcaId: true, status: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  if (p.status === "postado") return { ok: false as const, erro: "Esse post já foi publicado." };
  const h = Math.max(0, Math.min(23, Math.floor(hora)));
  const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(p.data);
  const novaData = new Date(`${diaSP}T${String(h).padStart(2, "0")}:00:00-03:00`);
  await prisma.publicacao.update({ where: { id }, data: { data: novaData } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Remarca o DIA de um post (mantém a hora atual) — pra MOVER de um dia pro outro na agenda.
export async function remarcarPublicacao(id: string, dataYMD: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id }, select: { data: true, marcaId: true, status: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  if (p.status === "postado") return { ok: false as const, erro: "Esse post já foi publicado." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataYMD)) return { ok: false as const, erro: "Data inválida." };
  // mantém a HORA atual (em BRT) e troca só o dia
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(p.data)) % 24;
  const novaData = new Date(`${dataYMD}T${String(h).padStart(2, "0")}:00:00-03:00`);
  if (isNaN(novaData.getTime())) return { ok: false as const, erro: "Data inválida." };
  await prisma.publicacao.update({ where: { id }, data: { data: novaData } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function regerarPublicacao(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const template: Template = (TEMPLATES as readonly string[]).includes(p.template) ? (p.template as Template) : "dica";

  // Recupera o que o usuário havia fixado pra manter a oferta/validade no regerar.
  let travas: Travas = {};
  let categoria: string | undefined;
  let estiloStory: string | undefined; // foto/faixa/colorida — preservado no regerar
  try {
    const ex = JSON.parse(p.extra || "{}");
    estiloStory = typeof ex.estiloStory === "string" ? ex.estiloStory : undefined;
    travas = {
      oferta: ex.ofertaTravada || undefined,
      validade: ex.validadeTravada || undefined,
      inclui: Array.isArray(ex.inclui) ? ex.inclui : [],
      regras: ex.regras || undefined,
      diferenciais: Array.isArray(ex.diferenciaisTravados) ? ex.diferenciaisTravados : [],
      parcelamento: typeof ex.parcelamentoTravado === "string" ? ex.parcelamentoTravado : undefined,
      corFundo: typeof ex.corFundoTravada === "string" ? ex.corFundoTravada : undefined,
      // Feedback: o depoimento, autor, nota e cor do card são preservados ao regerar.
      depoimento: typeof ex.depoimentoTravado === "string" ? ex.depoimentoTravado : undefined,
      autor: typeof ex.autorTravado === "string" ? ex.autorTravado : undefined,
      estrelas: typeof ex.estrelasTravada === "number" ? ex.estrelasTravada : undefined,
      destaque: typeof ex.destaqueTravado === "string" ? ex.destaqueTravado : undefined,
      corCard: typeof ex.corCardTravada === "string" ? ex.corCardTravada : undefined,
      fotoAutor: typeof ex.fotoAutorTravada === "string" ? ex.fotoAutorTravada : undefined,
      google: typeof ex.googleTravado === "boolean" ? ex.googleTravado : undefined,
      // Preço: os valores são preservados ao regerar (só título/legenda da IA mudam).
      modoPreco: typeof ex.modoPrecoTravado === "string" ? ex.modoPrecoTravado : undefined,
      precoDe: typeof ex.precoDeTravado === "string" ? ex.precoDeTravado : undefined,
      precoPor: typeof ex.precoPorTravado === "string" ? ex.precoPorTravado : undefined,
      labelPor: typeof ex.labelPorTravado === "string" ? ex.labelPorTravado : undefined,
      parcelas: typeof ex.parcelasTravado === "string" ? ex.parcelasTravado : undefined,
      economia: typeof ex.economiaTravada === "string" ? ex.economiaTravada : undefined,
      condicoes: Array.isArray(ex.condicoesTravadas) ? ex.condicoesTravadas : undefined,
      ladoA: typeof ex.ladoATravado === "string" ? ex.ladoATravado : undefined,
      ladoB: typeof ex.ladoBTravado === "string" ? ex.ladoBTravado : undefined,
    };
    categoria = typeof ex.categoria === "string" ? ex.categoria : undefined;
  } catch {}

  // "dica" é FOTO-PRIMEIRO também no regerar: TROCA de foto (exclui a atual, p.imagemUrl) e o texto
  // nasce da nova — assim cada clique traz outra foto E outra dica, sempre casando imagem e texto.
  const fotoDicaRe = template === "dica" && USA_FOTO.dica
    ? await sortearFotoComDescricao(p.marcaId, categoria, p.imagemUrl || undefined)
    : null;

  let gerado: Gerado;
  try {
    // "dica": NÃO reusa o tema salvo — senão regerar fica preso no mesmo assunto (ex: decoração).
    // O texto nasce da foto nova (fotoDicaRe.descricao); sem foto no banco, cai num assunto
    // sorteado (fundo colorido). Os outros templates preservam o tema (promoção/preço/depoimento).
    const temaRegerar = template === "dica" ? undefined : (p.tema ?? undefined);
    gerado = await gerarTexto(p.marca, template, temaRegerar, travas, fotoDicaRe?.descricao);
  } catch (e) {
    console.error("Erro ao regerar publicação:", e);
    return { ok: false as const, erro: "Não consegui regerar agora." };
  }
  const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  // Remonta o extra e reinjeta o estiloStory (montarExtra não o conhece) — senão regerar
  // o texto faria um Story "foto"/"faixa" voltar a renderizar como "colorida".
  let extraNovo = montarExtra(p.marca, template, gerado, seed, travas, categoria);
  if (estiloStory) {
    try { const o = JSON.parse(extraNovo || "{}"); o.estiloStory = estiloStory; extraNovo = JSON.stringify(o); } catch {}
  }
  await prisma.publicacao.update({
    where: { id },
    data: {
      titulo: gerado.titulo || p.titulo,
      texto: gerado.texto || "",
      legenda: gerado.legenda || "",
      hashtags: gerado.hashtags || "",
      extra: extraNovo,
      status: "a_postar",
    },
  });
  // Mosaico/Vitrine: fotos novas a cada regerar — escolhidas pelo TEMA (rodízio nas candidatas).
  if (template === "mosaico") {
    await aplicarFotosMosaico(id, p.marcaId, categoria, 4, p.tema ?? undefined).catch(() => {});
  } else if (template === "vitrine") {
    await aplicarFotosMosaico(id, p.marcaId, categoria, 6, p.tema ?? undefined).catch(() => {});
  } else if (template === "dica") {
    // Troca pela foto nova (o texto nasceu dela). Sem foto no banco → tira a imagem = fundo colorido.
    if (fotoDicaRe?.url) await definirImagemPublicacao({ id, url: fotoDicaRe.url }).catch(() => {});
    else await removerImagemPublicacao(id).catch(() => {});
  }
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Quando a publicação JÁ foi postada no Instagram, "regerar" não deve sobrescrever
// (o post no Insta não muda e perderíamos o registro do que foi publicado). Em vez
// disso, cria uma NOVA publicação AO LADO — mesmo template/tema, com as travas/cor
// que o usuário havia fixado — preservando a postada intacta. Vai pra próxima data
// livre da agenda (reusa gerarPublicacao, que cuida de texto + foto).
export async function regerarComoNova(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const template: Template = (TEMPLATES as readonly string[]).includes(p.template) ? (p.template as Template) : "dica";
  let ex: Record<string, unknown> = {};
  try {
    ex = JSON.parse(p.extra || "{}");
  } catch {}
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  // A nova versão cai em HOJE (data BRT), do lado do original — mesmo que o dia já
  // tenha outro post (decisão do dono: ver a nova na hora, sem ir pra data distante).
  const hojeBRT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return gerarPublicacao({
    marcaId: p.marcaId,
    template,
    // "dica": sorteia um assunto novo em vez de repetir o tema salvo (variedade ao "regerar").
    tema: template === "dica" ? undefined : (p.tema ?? undefined),
    data: hojeBRT,
    oferta: str(ex.ofertaTravada),
    validade: str(ex.validadeTravada),
    inclui: arr(ex.inclui),
    regras: str(ex.regras),
    diferenciais: arr(ex.diferenciaisTravados),
    parcelamento: str(ex.parcelamentoTravado),
    categoria: str(ex.categoria),
    corFundo: str(ex.corFundoTravada),
    depoimento: str(ex.depoimentoTravado),
    autor: str(ex.autorTravado),
    estrelas: num(ex.estrelasTravada),
    destaque: str(ex.destaqueTravado),
    corCard: str(ex.corCardTravada),
    fotoAutor: str(ex.fotoAutorTravada),
    google: ex.googleTravado === true,
    modoPreco: str(ex.modoPrecoTravado),
    precoDe: str(ex.precoDeTravado),
    precoPor: str(ex.precoPorTravado),
    labelPor: str(ex.labelPorTravado),
    parcelas: str(ex.parcelasTravado),
    economia: str(ex.economiaTravada),
    condicoes: arr(ex.condicoesTravadas),
    ladoA: str(ex.ladoATravado),
    ladoB: str(ex.ladoBTravado),
  });
}

// Sugere 3-4 diferenciais ("por que escolher") via IA, a partir do assunto/modelo
// escolhido — pra preencher/variar o campo ANTES de gerar a publicação (template
// Divulgação). Cada clique traz uma versão nova (temperatura alta).
export async function sugerirDiferenciais(marcaId: string, tema?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const angulo = tema?.trim() ? `Foco/assunto: "${tema.trim()}".` : "Escolha um ângulo de valor novo e relevante.";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.95,
        messages: [
          { role: "system", content: sistema(marca, "divulgacao") },
          { role: "user", content: `Liste de 3 a 4 DIFERENCIAIS ("por que escolher a gente") BEM curtos (2 a 4 palavras cada, ex: "Monitores treinados"). ${angulo} Traga uma combinação fresca, evite o lugar-comum. Responda só com JSON: {"diferenciais": ["...", "..."]}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { diferenciais?: string[] };
    const lista = (j.diferenciais ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (lista.length === 0) throw new Error("Resposta vazia.");
    return { ok: true as const, diferenciais: lista };
  } catch (e) {
    console.error("Erro ao sugerir diferenciais:", e);
    return { ok: false as const, erro: "Não consegui sugerir agora. Confira a chave da OpenAI." };
  }
}

// Sugere uma OFERTA/PROMOÇÃO completa via IA (oferta + validade + itens inclusos +
// regras), a partir da ocasião/assunto — pra servir de INSPIRAÇÃO ao criar promoções.
// O dono revisa tudo antes de postar (são só ideias, ele ajusta os números/condições).
export async function sugerirPromocao(marcaId: string, tema?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const angulo = tema?.trim() ? `Ocasião/foco: "${tema.trim()}".` : "Crie uma oportunidade atraente e realista pro negócio.";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.95,
        messages: [
          { role: "system", content: sistema(marca, "promocao") },
          { role: "user", content: `Crie uma IDEIA de oferta/promoção realista e atraente pro negócio. ${angulo} Nada exagerado nem irreal. Responda só com JSON: {"oferta":"benefício curtíssimo em CAIXA ALTA (ex: 10 CRIANÇAS GRÁTIS, 15% OFF)","validade":"condição/validade curta (ex: Para contratos deste mês)","inclui":["3 a 4 itens curtos do que está incluso"],"regras":"condições em letras miúdas curtas (ex: Mediante reserva, não cumulativo)"}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { oferta?: string; validade?: string; inclui?: string[]; regras?: string };
    const inclui = (j.inclui ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return {
      ok: true as const,
      oferta: (j.oferta ?? "").trim(),
      validade: (j.validade ?? "").trim(),
      inclui,
      regras: (j.regras ?? "").trim(),
    };
  } catch (e) {
    console.error("Erro ao sugerir promoção:", e);
    return { ok: false as const, erro: "Não consegui sugerir agora. Confira a chave da OpenAI." };
  }
}

// Gera um EXEMPLO de depoimento (rascunho) pra o dono testar o template / ter um ponto
// de partida. NÃO substitui um depoimento real — a ideia é o dono colar o feedback
// verdadeiro do cliente na hora de postar. Cada clique traz uma variação (temp alta).
export async function sugerirDepoimento(marcaId: string, destaque?: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const marca = await prisma.marca.findUnique({ where: { id: marcaId } });
  if (!marca) return { ok: false as const, erro: "Marca não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  // Se o dono já escolheu uma frase de destaque, o depoimento é gerado COERENTE com ela
  // (e o destaque escolhido é mantido). Senão, a IA cria também o destaque.
  const dest = (destaque || "").trim();
  // A IA tende a repetir sempre o mesmo nome (ex: "Juliana M.") nos exemplos. Pra cada
  // exemplo vir com um nome DIFERENTE, sorteamos um nome brasileiro + inicial e FORÇAMOS
  // no resultado (ignorando o que a IA inventaria). O dono troca pelo nome real ao postar.
  const NOMES = ["Mariana", "Juliana", "Patrícia", "Fernanda", "Camila", "Aline", "Renata", "Carla", "Bruna", "Tatiane", "Vanessa", "Priscila", "Daniela", "Letícia", "Bianca", "Amanda", "Jéssica", "Rafael", "Bruno", "Thiago", "Felipe", "Rodrigo", "Marcelo", "André", "Diego", "Leandro", "Gustavo", "Paula", "Simone", "Adriana", "Cristiane", "Débora", "Sabrina", "Michele"];
  const INICIAIS = "ABCDFGLMNOPRSTV".split("");
  const nomeExemplo = `${NOMES[Math.floor(Math.random() * NOMES.length)]} ${INICIAIS[Math.floor(Math.random() * INICIAIS.length)]}.`;
  const userMsg = dest
    ? `Escreva um EXEMPLO realista de depoimento de um cliente satisfeito (pai ou mãe que fez a festa do filho) sobre "${marca.nome}", que combine e justifique este elogio em destaque: "${dest}". ${marca.descricao || ""} Tom natural, espontâneo e específico, sem exagero. 3 a 5 frases. Responda só com JSON: {"depoimento":"o texto","autor":"primeiro nome + inicial do sobrenome (ex: Mariana S.)"}`
    : `Escreva um EXEMPLO realista de depoimento de um cliente satisfeito (um pai ou mãe que fez a festa do filho) sobre "${marca.nome}". ${marca.descricao || ""} Tom natural, espontâneo e específico (cite atendimento, espaço, equipe ou a alegria das crianças) — sem soar publicitário nem exagerado. 3 a 5 frases. Responda só com JSON: {"depoimento":"o texto do depoimento","autor":"primeiro nome + inicial do sobrenome (ex: Mariana S.)","destaque":"frase BEM curta de 2 a 4 palavras que resume o elogio (ex: Festa inesquecível!)"}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 1,
        messages: [
          { role: "system", content: sistema(marca, "feedback") },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { depoimento?: string; autor?: string; destaque?: string };
    const depoimento = (j.depoimento ?? "").trim();
    if (!depoimento) throw new Error("Resposta vazia.");
    // Força o nome sorteado (não repete) — o do exemplo serve só de rascunho.
    return { ok: true as const, depoimento, autor: nomeExemplo, destaque: dest || (j.destaque ?? "").trim() };
  } catch (e) {
    console.error("Erro ao sugerir depoimento:", e);
    return { ok: false as const, erro: "Não consegui criar o exemplo agora. Confira a chave da OpenAI." };
  }
}

export async function excluirPublicacao(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.delete({ where: { id } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function gerarImagemPublicacao(input: { id: string; descricao?: string }) {
  const g = await guardaPublicacao(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id: input.id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  // Fundo DECORATIVO ABSTRATO conectado ao TEMA do post — nunca um ambiente/cena realista
  // (pra não fingir ser o espaço real do negócio; o espaço de verdade vem do banco de fotos).
  // O tema (título/tema do post) guia o CLIMA e as CORES, e harmoniza com a cor da marca —
  // assim o fundo "conversa" com o conteúdo, mas segue abstrato.
  const tema = (input.descricao || p.tema || p.titulo || "").toString().trim().slice(0, 200);
  // DATA COMEMORATIVA: gera uma CENA temática (com pessoas) que representa a data — como as artes
  // profissionais (ex: pai e filho no Dia dos Pais). Não é o espaço real do buffet (é uma cena
  // genérica/ilustrativa da data), então não "finge" ser o lugar. Demais posts: fundo abstrato.
  const ehData = p.template === "data-comemorativa";
  const cor = p.marca.corPrimaria || "#7C3AED";
  const prompt = ehData
    ? `Foto cinematográfica e calorosa para um post de DATA COMEMORATIVA de um buffet infantil, representando a data: "${tema}". Mostre uma cena emocional e alegre coerente com a data (ex.: Dia dos Pais = um pai feliz brincando com o filho; Dia das Mães = mãe e filho; Natal = clima natalino em família; Páscoa = criança feliz com ovos de páscoa). Pessoas reais, expressões felizes, luz bonita e aconchegante, cores harmonizando com ${cor}. Composição vertical com o assunto na METADE DE CIMA e a metade de BAIXO mais limpa/escura (sobra espaço pra escrever um título depois). Alta qualidade, realista. SEM texto, letras, números, logotipos ou marcas.`
    : `Fundo decorativo abstrato para um post de rede social do buffet infantil "${p.marca.nome}".${tema ? ` O post é sobre: "${tema}". Deixe o CLIMA e as CORES do fundo combinarem com esse tema.` : ""} Harmonize a paleta com a cor ${cor}, de forma alegre e festiva. Estilo: textura/padrão abstrato — bokeh, confete, balões, formas geométricas suaves, gradiente. É APENAS um fundo artístico abstrato: NÃO é fotografia de ambiente, lugar, espaço, comida, objetos ou pessoas reais. Formato vertical. SEM texto, letras, números, logotipos, pessoas, rostos ou cenários reconhecíveis.`;
  let b64: string | undefined;
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1536" }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Resposta sem imagem.");
  } catch (e) {
    console.error("Erro ao gerar imagem da publicação:", e);
    return { ok: false as const, erro: "Não consegui gerar a imagem agora." };
  }
  let url: string;
  try {
    const blob = await put(`${p.marcaId}/feed-${input.id}-${Date.now()}.png`, Buffer.from(b64, "base64"), {
      access: "public",
      contentType: "image/png",
    });
    url = blob.url;
  } catch (e) {
    console.error("Erro ao salvar imagem (Blob):", e);
    return { ok: false as const, erro: "Imagem gerada, mas não consegui salvar (Vercel Blob)." };
  }
  await prisma.publicacao.update({ where: { id: input.id }, data: { imagemUrl: url } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const, url };
}

export async function definirImagemPublicacao(input: { id: string; url: string }) {
  const g = await guardaPublicacao(input.id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id: input.id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.update({ where: { id: input.id }, data: { imagemUrl: input.url } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

export async function removerImagemPublicacao(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id } });
  if (!p) return { ok: false as const, erro: "Não encontrada." };
  await prisma.publicacao.update({ where: { id }, data: { imagemUrl: null } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const };
}

// Marca/desmarca "✓ Aprovado" — revisão INTERNA do dono (não vai pra rede social).
export async function alternarAprovacao(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const p = await prisma.publicacao.findUnique({ where: { id }, select: { aprovado: true, marcaId: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  await prisma.publicacao.update({ where: { id }, data: { aprovado: !p.aprovado } });
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const, aprovado: !p.aprovado };
}

export async function postarPublicacao(id: string) {
  const g = await guardaPublicacao(id);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (ehTrial(g.sessao)) return { ok: false as const, erro: MSG_TRIAL_POSTAR };
  const p = await prisma.publicacao.findUnique({ where: { id }, include: { marca: true } });
  if (!p) return { ok: false as const, erro: "Publicação não encontrada." };
  if (p.status === "postado") return { ok: false as const, erro: "Essa publicação já foi postada." };
  if (!marcaConectada(p.marca)) {
    return { ok: false as const, erro: `Conecte o Instagram da marca "${p.marca.nome}" primeiro.` };
  }
  const legenda = `${p.legenda}\n\n${p.hashtags}`.trim().slice(0, 2200);
  const r = await publicarNasRedes(p.marca, [`${baseUrl()}/api/feed/${id}`], legenda);
  if (!r.ig.ok) return { ok: false as const, erro: r.ig.erro };
  await prisma.publicacao.update({ where: { id }, data: { status: "postado", postadoEm: new Date(), mediaId: r.ig.mediaId } });
  const onde = r.fb?.ok ? "Instagram + Facebook" : "Instagram";
  await registrarAtividade(AGENTE, `Postei "${p.titulo}" no ${onde} de ${p.marca.nome}.`, p.marcaId);
  revalidatePath(`/painel/marcas/${p.marcaId}`);
  return { ok: true as const, permalink: r.ig.permalink, facebook: r.fb?.ok ?? null, erroFacebook: r.fb && !r.fb.ok ? r.fb.erro : undefined };
}
