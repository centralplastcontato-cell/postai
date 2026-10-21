// VÍDEO CINEMA: anúncio no estilo "comercial" (foto real com câmera andando, legenda palavra por
// palavra no ritmo da voz, telinhas animadas). Aqui ficam o formato do roteiro, a conferência do que
// a Bia escreveu, o prompt dela e o casamento das palavras escritas com as faladas (Whisper).
// O desenho de cada cena mora no motor (postai-video-engine/cinema/src/Video.tsx).
import { normalizar, contarPalavras, type PalavraFalada } from "@/lib/colagem";

export type TipoCena = "foto" | "notificacao" | "conversa" | "prazo" | "etiquetas" | "checklist" | "oferta" | "depoimento" | "final";
export const TIPOS: TipoCena[] = ["foto", "notificacao", "conversa", "prazo", "etiquetas", "checklist", "oferta", "depoimento", "final"];
export const COM_FOTO = new Set<TipoCena>(["foto", "notificacao", "etiquetas", "final"]);

export type PalavraCena = { t: string; s: number; e: number; d?: boolean }; // texto, início/fim (s), destaque
export type CenaCinema = {
  tipo: TipoCena;
  fala: string;
  destaques: string[];
  foto?: string;
  dados?: Record<string, unknown>;
  inicio?: number;
  fim?: number;
  palavras?: PalavraCena[];
};
// capa: título grande da miniatura/capa do Reels ("*palavra*" = destaque) + a foto de fundo
export type CapaCinema = { titulo: string; foto?: string };
export type RoteiroCinema = { versao: "cinema1"; cenas: CenaCinema[]; capa?: CapaCinema };

// O que o dono conta antes da Bia escrever. Só o TEMA é obrigatório; o resto liga cenas extras.
export type TemaCinema = {
  tema: string; // do que é o vídeo (ex: "últimas datas de dezembro")
  principal: string; // oferta (opcional) — ex: "+10 convidados grátis"
  extras: string[];
  prazo: string; // AAAA-MM-DD (opcional)
  condicoes: boolean;
  depoimento: { nome: string; texto: string; fonte: string }; // depoimento REAL de cliente (opcional)
  depoimentoAuto: boolean; // a plataforma escolhe uma avaliação 5★ REAL do Google (texto sem mudar)
  botao: string; // texto do botão final
  foco: FocoFotos; // que tipo de foto o vídeo usa
};
export const TEMA_VAZIO: TemaCinema = { tema: "", principal: "", extras: [], prazo: "", condicoes: true, depoimento: { nome: "", texto: "", fonte: "" }, botao: "Chame no WhatsApp", foco: "festa", depoimentoAuto: false };

// ---------- FOCO das fotos ----------
// O dono escolhe o estilo do vídeo; a plataforma filtra o acervo pela CATEGORIA da foto e pela
// DESCRIÇÃO que a IA fez dela, e só manda pra Bia as que combinam. Foto POSADA de família fica
// de fora em todos os focos (expõe a família e vende menos que a festa acontecendo).
export type FocoFotos = "festa" | "espaco" | "brinquedos" | "comida" | "equipe" | "misto";
export const FOCOS: { id: FocoFotos; emoji: string; nome: string; desc: string }[] = [
  { id: "festa", emoji: "🎉", nome: "Festa acontecendo", desc: "crianças brincando e decoração (sem foto posada de família)" },
  { id: "espaco", emoji: "🏰", nome: "Só o espaço", desc: "salão, decoração e mesas, sem pessoas" },
  { id: "brinquedos", emoji: "🎢", nome: "Só brinquedos", desc: "brinquedões, tobogã, piscina de bolinhas, games" },
  { id: "comida", emoji: "🍰", nome: "Comida e mesa", desc: "buffet, doces e bolo" },
  { id: "equipe", emoji: "👩‍🏫", nome: "Equipe", desc: "monitores e equipe trabalhando" },
  { id: "misto", emoji: "🔀", nome: "Misto", desc: "um pouco de tudo" },
];
const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const RE_PESSOAS = /pesso|crian|menin|garot|famil|\bpai\b|\bmae\b|\bpais\b|bebe|convidad|grupo|homem|mulher|aniversariant|adult|monitor|funcionari|equipe|gente|sorri|posand|casal|senhor|senhora|rosto/;
const RE_POSADO = /posand|posad|famil|\bpai\b|\bmae\b|\bpais\b|casal|retrato|foto em grupo|grupo de pessoas|olhando para a camera|sorrindo para a camera|abracad/;
const RE_VAZIO = /sem pessoas|vazi|ninguem/;
const RE_ESPACO = /salao|decora|mesa|ambiente|espaco|luz|luzes|balo|bales|painel|cenario|fachada|entrada/;
const RE_BRINQ = /brinquedo|tobog|piscina de bolinha|pula|cama elastica|game|fliperama|kart|escorreg|playground|area kids|arcade|realidade virtual|carrinho/;
const RE_COMIDA = /comida|doce|bolo|buffet|salgad|lanche|pizza|bebida|sobremesa|docinho|cardapio|prato/;
const RE_EQUIPE = /monitor|equipe|funcionari|garcom|garcon|garconete|recreador|uniforme|staff|animador|atendente|cozinheir|copeir/;

export function combinaComFoco(foco: FocoFotos, f: { descricao: string; categoria: string }): boolean {
  const d = sem(f.descricao || "");
  const cat = f.categoria;
  if (RE_POSADO.test(d)) return false; // família posando: nunca
  const temGente = RE_PESSOAS.test(d) && !RE_VAZIO.test(d);
  switch (foco) {
    case "espaco": return !temGente && (cat === "espaco" || RE_ESPACO.test(d));
    case "brinquedos": return !RE_EQUIPE.test(d) && (cat === "brinquedos" || RE_BRINQ.test(d));
    case "comida": return !temGente && (cat === "comida" || RE_COMIDA.test(d));
    case "equipe": return RE_EQUIPE.test(d);
    case "festa": return cat === "festa" || cat === "brinquedos" || /brincando|festa|parab|bolo|decora|crian/.test(d);
    default: return true;
  }
}

export function lerTema(json: string): TemaCinema {
  try {
    const o = JSON.parse(json || "{}");
    const dep = o.depoimento || {};
    return {
      tema: String(o.tema || "").slice(0, 160),
      principal: String(o.principal || "").slice(0, 60),
      extras: Array.isArray(o.extras) ? o.extras.map((x: unknown) => String(x || "").slice(0, 40)).filter(Boolean).slice(0, 3) : [],
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(o.prazo || "") ? o.prazo : "",
      condicoes: o.condicoes !== false,
      depoimento: { nome: String(dep.nome || "").slice(0, 30), texto: String(dep.texto || "").slice(0, 160), fonte: String(dep.fonte || "").slice(0, 30) },
      depoimentoAuto: o.depoimentoAuto === true,
      botao: String(o.botao || "").slice(0, 26) || TEMA_VAZIO.botao,
      foco: FOCOS.some((x) => x.id === o.foco) ? o.foco : "festa",
    };
  } catch {
    return { ...TEMA_VAZIO, depoimento: { ...TEMA_VAZIO.depoimento } };
  }
}
export function lerRoteiroCinema(json: string): RoteiroCinema | null {
  try {
    const r = JSON.parse(json || "{}");
    return r?.versao === "cinema1" && Array.isArray(r.cenas) && r.cenas.length ? (r as RoteiroCinema) : null;
  } catch {
    return null;
  }
}

// Duração (segundos de VOZ). O vídeo fecha ~1s depois.
export const DURACAO_CINEMA = { min: 28, ideal: 38, max: 48 };
export function faixaCinema(palavrasPorSeg: number): { min: number; max: number } {
  const v = Math.max(1.6, Math.min(3.2, palavrasPorSeg || 2.3));
  return { min: Math.round(v * (DURACAO_CINEMA.min + 2)), max: Math.round(v * (DURACAO_CINEMA.max - 4)) };
}

export const narracaoCinema = (r: RoteiroCinema) => r.cenas.map((c) => c.fala.trim()).join(" ");

function dataBR(prazo: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prazo);
  return m ? `${m[3]}/${m[2]}` : "";
}
export function prazoPorExtenso(prazo: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prazo);
  if (!m) return "";
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]}`; // o dia em número; a Bia fala por extenso
}

// ---------- conferência do roteiro da Bia ----------
type Resposta = { capa?: { titulo?: string }; cenas?: { tipo?: string; fala?: string; destaques?: unknown; foto?: string; dados?: Record<string, unknown> }[] };
const curto = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

export function validarCinema(r: Resposta, tema: TemaCinema, fotos: Set<string>, faixa: { min: number; max: number }): string[] {
  const erros: string[] = [];
  const cenas = Array.isArray(r?.cenas) ? r.cenas : [];
  if (cenas.length < 5 || cenas.length > 8) erros.push(`Use de 6 a 8 cenas (veio ${cenas.length}).`);
  if (!cenas.length) return erros;
  const tipos = cenas.map((c) => c?.tipo as TipoCena);
  tipos.forEach((t, i) => { if (!TIPOS.includes(t)) erros.push(`Cena ${i + 1}: tipo "${t}" não existe.`); });
  if (!["notificacao", "foto"].includes(tipos[0])) erros.push(`A cena 1 tem que ser "notificacao" ou "foto" (gancho com foto real).`);
  if (tipos[tipos.length - 1] !== "final") erros.push(`A última cena tem que ser "final".`);
  if (tipos.filter((t) => t === "final").length > 1) erros.push(`Só uma cena "final".`);
  for (const t of ["conversa", "prazo", "oferta", "depoimento", "checklist", "etiquetas", "notificacao"] as TipoCena[]) {
    if (tipos.filter((x) => x === t).length > 1) erros.push(`A cena "${t}" só pode aparecer uma vez.`);
  }
  if (tema.principal && !tipos.includes("oferta")) erros.push(`Tem oferta ("${tema.principal}"): inclua uma cena "oferta" antes da final.`);
  if (!tema.principal && tipos.includes("oferta")) erros.push(`Não tem oferta cadastrada: não use a cena "oferta".`);
  if (!tema.prazo && tipos.includes("prazo")) erros.push(`Não tem prazo cadastrado: não use a cena "prazo".`);
  if (!tema.depoimento.texto && tipos.includes("depoimento")) erros.push(`Não tem depoimento cadastrado: não use a cena "depoimento" (nunca invente depoimento).`);
  if (tipos.filter((t) => COM_FOTO.has(t)).length < 3) erros.push(`Pelo menos 3 cenas com foto real (foto, notificacao, etiquetas, final).`);
  for (let i = 2; i < tipos.length; i++) if (![tipos[i], tipos[i - 1], tipos[i - 2]].some((t) => COM_FOTO.has(t))) erros.push(`Cenas ${i - 1} a ${i + 1}: três "telinhas" seguidas — intercale com uma cena de foto.`);

  let total = 0;
  const usadas: string[] = [];
  cenas.forEach((c, i) => {
    const n = i + 1;
    const fala = String(c?.fala || "").trim();
    const np = contarPalavras(fala);
    total += np;
    if (np < 3) erros.push(`Cena ${n}: fala curta demais.`);
    if (np > 26) erros.push(`Cena ${n}: fala com ${np} palavras — no máximo 26 por cena.`);
    const ds = Array.isArray(c?.destaques) ? (c!.destaques as unknown[]).map(String) : [];
    if (ds.length < 1 || ds.length > 2) erros.push(`Cena ${n}: escolha 1 ou 2 palavras de destaque.`);
    for (const d of ds) if (!normalizar(fala).split(" ").includes(normalizar(d).split(" ")[0] || "#")) erros.push(`Cena ${n}: o destaque "${d}" não está na fala (tem que ser uma palavra DA fala).`);
    const t = c?.tipo as TipoCena;
    if (COM_FOTO.has(t)) {
      if (!c?.foto || !fotos.has(c.foto)) erros.push(`Cena ${n} (${t}): escolha uma foto da lista (id exato).`);
      else if (t !== "final" && usadas.includes(c.foto)) erros.push(`Cena ${n}: a foto "${c.foto}" já foi usada — use outra.`);
      if (c?.foto && t !== "final") usadas.push(c.foto);
    }
    const d = c?.dados || {};
    if (t === "notificacao" && (!curto(d.remetente, 24) || !curto(d.mensagem, 70))) erros.push(`Cena ${n} (notificacao): dados.remetente (até 24 letras) e dados.mensagem (até 70) são obrigatórios.`);
    if (t === "conversa") {
      const ms = Array.isArray(d.mensagens) ? (d.mensagens as { de?: string; texto?: string }[]) : [];
      if (ms.length < 2 || ms.length > 4) erros.push(`Cena ${n} (conversa): de 2 a 4 mensagens.`);
      if (ms.some((m) => !["cliente", "marca"].includes(String(m?.de)) || !curto(m?.texto, 45))) erros.push(`Cena ${n} (conversa): cada mensagem tem "de" ("cliente" ou "marca") e "texto" de até 45 letras.`);
    }
    if (t === "etiquetas") {
      const it = Array.isArray(d.itens) ? d.itens : [];
      if (it.length < 2 || it.length > 4 || it.some((x) => !curto(x, 18))) erros.push(`Cena ${n} (etiquetas): de 2 a 4 itens de até 18 letras.`);
    }
    if (t === "checklist") {
      const it = Array.isArray(d.itens) ? d.itens : [];
      if (!curto(d.titulo, 30) || it.length < 3 || it.length > 5 || it.some((x) => !curto(x, 26))) erros.push(`Cena ${n} (checklist): dados.titulo (até 30 letras) e de 3 a 5 itens de até 26 letras.`);
    }
  });
  const tituloCapa = String(r?.capa?.titulo || "").trim();
  const nCapa = contarPalavras(tituloCapa.replace(/\*/g, ""));
  if (nCapa < 2 || nCapa > 7 || tituloCapa.replace(/\*/g, "").length > 42) erros.push(`Escreva a capa: "capa":{"titulo":"..."} com 2 a 7 palavras (até 42 letras) e UMA palavra entre asteriscos.`);
  else if (!/\*[^*]+\*/.test(tituloCapa)) erros.push(`No título da capa, marque UMA palavra de destaque entre asteriscos (ex: "Últimas datas de *dezembro*").`);
  if (total < faixa.min || total > faixa.max) erros.push(`A narração inteira tem ${total} palavras — tem que ficar entre ${faixa.min} e ${faixa.max}. CONTE as palavras.`);
  // prazo falado: confere pelo NOME do mês (o dia vem por extenso: "trinta de novembro")
  const mesDoPrazo = normalizar(prazoPorExtenso(tema.prazo)).split(" ").pop() || "";
  if (tema.prazo && !normalizar(cenas.map((c) => c?.fala || "").join(" ")).split(" ").includes(mesDoPrazo)) erros.push(`Fale o prazo na narração ("até ${prazoPorExtenso(tema.prazo)}", com o dia por extenso).`);
  return erros;
}
// Problemas que não seguram o vídeo na última tentativa (só tamanho um pouco fora).
// O tamanho da fala é acertado depois, na voz (a Bia encurta sozinha) — então não segura o roteiro.
export const soDetalhesCinema = (erros: string[]) => erros.every((e) => /palavras|capa|telinhas/.test(e));

// Roteiro final: o sistema completa os dados das cenas que vêm do cadastro (oferta, prazo,
// depoimento, botão) — esses textos nunca passam pela Bia, saem exatamente como o dono escreveu.
export function montarRoteiroCinema(r: Resposta, tema: TemaCinema, hoje: string): RoteiroCinema {
  const cenas: CenaCinema[] = (r.cenas || []).map((c) => {
    const tipo = c.tipo as TipoCena;
    const base: CenaCinema = { tipo, fala: String(c.fala || "").trim(), destaques: (Array.isArray(c.destaques) ? c.destaques.map(String) : []).slice(0, 2), ...(COM_FOTO.has(tipo) ? { foto: c.foto } : {}), dados: c.dados || {} };
    if (tipo === "oferta") base.dados = { principal: tema.principal, extras: tema.extras, prazoTexto: tema.prazo ? `Válido até ${dataBR(tema.prazo)}` : "", condicoes: tema.condicoes, botao: "Quero garantir" };
    if (tipo === "prazo") base.dados = { prazo: tema.prazo, hoje };
    if (tipo === "depoimento") base.dados = { nome: tema.depoimento.nome || "Cliente", texto: tema.depoimento.texto, fonte: tema.depoimento.fonte || "Avaliação de cliente", nota: 5 };
    if (tipo === "final") base.dados = { botao: tema.botao };
    return base;
  });
  const primeiraFoto = cenas.find((c) => c.foto)?.foto;
  const titulo = String(r.capa?.titulo || "").trim().slice(0, 60) || tema.tema.slice(0, 40);
  return { versao: "cinema1", cenas, capa: { titulo, foto: primeiraFoto } };
}

// ---------- tempo de cada palavra ----------
const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const chave = (s: string) => normalizar(s).replace(/\s+/g, "");
const casa = (a: string, b: string) => !!a && !!b && (a === b || (b.length >= 3 && a.startsWith(b)) || (a.length >= 4 && b.startsWith(a)));

// Casa cada palavra ESCRITA com a FALADA (Whisper), na ordem; o que não casar é estimado entre as
// vizinhas. Sem Whisper, espalha pelo áudio proporcional ao tamanho das palavras.
export function alinharCinema(r: RoteiroCinema, falada: PalavraFalada[], segundos: number): RoteiroCinema {
  const fw = falada.map((w) => ({ k: chave(w.word), s: w.start, e: w.end })).filter((w) => w.k);
  const escritas = r.cenas.map((c) => tokens(c.fala));
  const todas = escritas.flat();
  const tempos: ({ s: number; e: number } | null)[] = [];
  if (fw.length) {
    let j = 0;
    for (const w of todas) {
      const k = chave(w);
      let achou: { s: number; e: number } | null = null;
      for (let x = j; x < Math.min(fw.length, j + 6); x++) if (casa(fw[x].k, k) || casa(k, fw[x].k)) { achou = { s: fw[x].s, e: fw[x].e }; j = x + 1; break; }
      tempos.push(achou);
    }
  } else {
    const pesos = todas.map((w) => 0.6 + chave(w).length * 0.12);
    const soma = pesos.reduce((a, b) => a + b, 0) || 1;
    const util = Math.max(1, segundos - 1.4);
    let t = 0.25;
    for (const p of pesos) { const d = (p / soma) * util; tempos.push({ s: t, e: t + d * 0.9 }); t += d; }
  }
  // preenche os buracos interpolando entre as vizinhas conhecidas
  const fimAudio = Math.max(1, segundos - 1.2);
  for (let i = 0; i < tempos.length; i++) {
    if (tempos[i]) continue;
    let a = i - 1; while (a >= 0 && !tempos[a]) a--;
    let b = i + 1; while (b < tempos.length && !tempos[b]) b++;
    const ta = a >= 0 ? tempos[a]!.e : 0.2;
    const tb = b < tempos.length ? tempos[b]!.s : fimAudio;
    const faltam = b - a - 1;
    const w = Math.max(0.05, (tb - ta) / Math.max(1, faltam));
    const s = ta + w * (i - a - 1);
    tempos[i] = { s, e: s + w * 0.9 };
  }
  let idx = 0;
  const cenas = r.cenas.map((c, ci) => {
    const ds = c.destaques.map((d) => chave(tokens(d)[0] || ""));
    const ps: PalavraCena[] = escritas[ci].map((w) => {
      const t = tempos[idx++]!;
      return { t: w, s: Math.round(t.s * 1000) / 1000, e: Math.round(t.e * 1000) / 1000, ...(ds.some((d) => d && casa(chave(w), d)) ? { d: true } : {}) };
    });
    return { ...c, palavras: ps };
  });
  // início de cada cena = um tiquinho antes da 1ª palavra; fim = início da próxima
  return {
    ...r,
    versao: "cinema1",
    cenas: cenas.map((c, i) => {
      const inicio = i === 0 ? 0 : Math.max(0, (c.palavras![0]?.s ?? 0) - 0.15);
      const prox = cenas[i + 1];
      const fim = prox ? Math.max(inicio + 0.8, (prox.palavras![0]?.s ?? inicio + 2) - 0.15) : segundos + 0.8;
      return { ...c, inicio: Math.round(inicio * 1000) / 1000, fim: Math.round(fim * 1000) / 1000 };
    }),
  };
}
export const temTemposCinema = (r: RoteiroCinema | null) => !!r && r.cenas.every((c) => typeof c.inicio === "number" && Array.isArray(c.palavras));

// ---------- PROMPT da Bia ----------
export function promptBiaCinema(marca: { nome: string; descricao: string }, tema: TemaCinema, faixa: { min: number; max: number }): string {
  const cenasExtras = [
    tema.principal ? `- "oferta" (OBRIGATÓRIA, perto do fim, antes da final): cartão com a oferta — o sistema escreve "${tema.principal}"${tema.extras.length ? ` + ${tema.extras.join("; ")}` : ""}; você só escreve a FALA (fale o benefício com os números exatos, por extenso).` : "",
    tema.prazo ? `- "prazo" (opcional, logo depois da oferta): calendário marcando os dias até ${prazoPorExtenso(tema.prazo)}. A fala tem que dizer "até ${prazoPorExtenso(tema.prazo)}".` : "",
    tema.depoimento.texto ? `- "depoimento" (opcional): cartão com o depoimento REAL de ${tema.depoimento.nome || "um cliente"}: "${tema.depoimento.texto}". A fala apresenta (ex: "e quem já fez festa aqui aprova").` : "",
  ].filter(Boolean).join("\n");
  return `Você é a Bia, roteirista de vídeos-anúncio de "${marca.nome}". Escreva um vídeo vertical estilo COMERCIAL DE CINEMA: fotos reais com a câmera andando devagar, uma narração envolvente e a legenda aparecendo palavra por palavra, com "telinhas" animadas (notificação de celular, conversa de WhatsApp, lista com checks) contando a história. Pouca coisa na tela, uma ideia por cena.

SOBRE A MARCA (use SÓ isto — nunca invente diferencial, preço ou número): ${marca.descricao || "(sem descrição — fale de forma geral)"}

TEMA DO VÍDEO: ${tema.tema}
FOCO DAS FOTOS: ${FOCOS.find((x) => x.id === tema.foco)?.nome} — ${FOCOS.find((x) => x.id === tema.foco)?.desc}. A narração combina com isso (ex: foco no espaço fala do salão; em brinquedos, da diversão).

HISTÓRIA (nesta ordem): GANCHO que para o scroll (uma situação real do cliente) → DOR/situação → VIRADA (a marca resolve) → PROVA (o que tem, como é) → ${tema.principal ? "OFERTA → " : ""}${tema.prazo ? "URGÊNCIA → " : ""}CHAMADA final.

TIPOS DE CENA (use de 6 a 8 cenas no total):
- "notificacao" (ótima pro gancho): foto real ao fundo + notificação de celular chegando. dados: {"app":"whatsapp" ou "instagram","remetente":"Mãe do Theo","mensagem":"Oi! Ainda tem data em dezembro? 🎈","hora":"21:47"} — remetente fictício e genérico (ex: "Mãe da Alice"), mensagem curta e realista.
- "foto": foto real em tela cheia com a câmera andando. Sem dados.
- "conversa": tela de conversa no WhatsApp com a marca. dados: {"mensagens":[{"de":"cliente","texto":"..."},{"de":"marca","texto":"..."}]} — 2 a 4 mensagens curtas, começando pelo cliente; a marca responde resolvendo.
- "etiquetas": foto real + 2 a 4 etiquetas coloridas pulando (serviços/diferenciais REAIS da marca, até 18 letras cada). dados: {"itens":["Decoração","Buffet completo"]}
- "checklist": cartão com título e 3 a 5 itens sendo marcados ✓ (o que está incluso). dados: {"titulo":"Tudo incluso","itens":["...","..."]}
${cenasExtras}
- "final" (OBRIGATÓRIA, a última): a foto mais bonita se abre num círculo, logo da marca e o botão "${tema.botao}". A fala chama pra ação (ex: "chama a gente no WhatsApp e garanta a sua data").

REGRAS:
- Cena 1 = "notificacao" ou "foto" (sempre com foto real). Nunca 3 "telinhas" seguidas (conversa/checklist/oferta/prazo/depoimento): intercale com cenas de foto. Pelo menos 3 cenas com foto. Cada tipo uma vez só (foto pode repetir).
- Fotos: use o id EXATO da lista; não repita foto (a final pode repetir a melhor). Prefira fotos com crianças, festa acontecendo, salão decorado. Nunca abra com fachada ou foto vazia.
- Fala: narração informal, frases curtas, "você" (nunca "cê"), números e datas POR EXTENSO. Cada fala com 6 a ${Math.max(10, Math.floor(faixa.max / 7))} palavras. A narração INTEIRA soma entre ${faixa.min} e ${faixa.max} palavras (mire em ${Math.round((faixa.min + faixa.max) / 2)}) — CONTE antes de responder; se passar, corte palavras.
- Destaques: em cada cena, 1 ou 2 palavras DA PRÓPRIA FALA que levam a emoção (ex: "tudo", "hoje", "data"). Elas aparecem em itálico, na cor da marca.
- A tela complementa a fala: a fala conta, a telinha mostra.

CAPA (a miniatura do Reels no perfil): um título curto e forte, de 2 a 7 palavras, com UMA palavra de destaque entre asteriscos — ex: "Últimas datas de *dezembro*", "Festa completa sem *estresse*".

Responda SÓ com JSON: {"capa":{"titulo":"..."},"cenas":[{"tipo":"notificacao","fala":"...","destaques":["data"],"foto":"ID","dados":{...}}, ...]}`;
}

// Endereço da capa (miniatura do card e capa do Reels). O ?v muda quando o título/foto/logo mudam,
// pra a CDN não servir a capa velha.
export function caminhoCapaCinema(id: string, roteiroJson: string, logoUrl = ""): string | null {
  const r = lerRoteiroCinema(roteiroJson);
  if (!r?.capa?.titulo) return null;
  const s = ["c2", r.capa.titulo, r.capa.foto || "", logoUrl].join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `/api/capa-cinema/${id}/capa.jpg?v=${h.toString(36)}`;
}

// Trecho de uma avaliação que cabe no cartão (até 160 letras): frases inteiras do começo; se a 1ª
// frase já passar, corta na palavra e põe "…". Nunca reescreve — só recorta o que o cliente escreveu.
export function trechoDaAvaliacao(texto: string, max = 160): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const frases = t.match(/[^.!?]+[.!?]+/g) || [];
  let out = "";
  for (const f of frases) { if ((out + f).trim().length > max) break; out += f; }
  if (out.trim().length >= 30) return out.trim();
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}
