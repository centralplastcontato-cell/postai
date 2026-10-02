// MOLDES DE CENA do vídeo-anúncio (colagem) — ver MOLDES.md (documento do Victor).
// A IA NÃO define posição, tamanho, rotação nem camada: ela só escolhe as fotos, escreve os
// textos/a narração e a pose do mascote. Cada molde já traz o layout (centro x,y em px num quadro
// 1080×1920, largura w, rotação, camada z) — aqui ele vira a lista de elementos que o motor desenha
// exatamente onde o molde manda. Módulo puro (sem banco/IA).
import type { Elemento, Cena, Roteiro, Oferta, FotoInfo } from "./colagem";
import { normalizar, porExtenso, prazoCurto, contarPalavras, type Faixa } from "./colagem";

export type Ato = "gancho" | "dor" | "virada" | "prova" | "oferta";
export const ATOS_MOLDE: Ato[] = ["gancho", "dor", "virada", "prova", "oferta"];

type VagaBase = { id: string; x: number; y: number; w: number; rot?: number; anim?: string; t?: number; gatilho?: string };
export type Vaga =
  | (VagaBase & { tipo: "foto"; etiqueta?: { x: number; y: number; estilo: string; w?: number } })
  | (VagaBase & { tipo: "figurinha"; categoria: string })
  | (VagaBase & { tipo: "etiqueta"; estilo: string; texto?: string })
  | (VagaBase & { tipo: "balao"; texto?: string })
  | (VagaBase & { tipo: "mascote"; poses: string[]; opcional?: boolean })
  | (VagaBase & { tipo: "logo_grande" })
  | (VagaBase & { tipo: "selo" })
  | (VagaBase & { tipo: "carinhas_arco"; qtd: number; arco: { cx: number; cy: number; raio: number; de: number; ate: number } })
  | (VagaBase & { tipo: "botao_whatsapp" })
  | (VagaBase & { tipo: "rodape" })
  | (VagaBase & { tipo: "pilha_recibos"; qtd: number; deslocamento: number });
export type Molde = { id: string; ato: Ato; nome: string; vagas: Vaga[] };

// ---------- os moldes (etapa 1: G1, D1, V1, P1, O1) ----------
export const MOLDES: Molde[] = [
  {
    id: "G1", ato: "gancho", nome: "Foto herói",
    vagas: [
      { id: "F1", tipo: "foto", x: 540, y: 820, w: 860, rot: -3, anim: "pop_bounce", t: 0 },
      { id: "A1", tipo: "figurinha", categoria: "festa", x: 170, y: 420, w: 200, anim: "carimbo", t: 0.15 },
      { id: "A2", tipo: "figurinha", categoria: "festa", x: 910, y: 1240, w: 200, anim: "carimbo", t: 0.35 },
      { id: "T1", tipo: "etiqueta", estilo: "amarela", x: 540, y: 1430, w: 760, rot: -2, anim: "slide_giro", gatilho: "auto" },
      { id: "M", tipo: "mascote", poses: ["acenando", "pulando"], x: 240, y: 1650, w: 300, anim: "pop_bounce", t: 0.5, opcional: true },
    ],
  },
  {
    id: "D1", ato: "dor", nome: "Pilha de contas",
    vagas: [
      { id: "R", tipo: "pilha_recibos", qtd: 4, x: 540, y: 860, w: 440, deslocamento: 45, anim: "empilhar", t: 0 },
      { id: "E1", tipo: "etiqueta", estilo: "branca", x: 230, y: 560, w: 320, rot: -4, anim: "slide_giro", gatilho: "item_1" },
      { id: "E2", tipo: "etiqueta", estilo: "branca", x: 850, y: 720, w: 320, rot: 3, anim: "slide_giro", gatilho: "item_2" },
      { id: "E3", tipo: "etiqueta", estilo: "branca", x: 230, y: 1060, w: 320, rot: 2, anim: "slide_giro", gatilho: "item_3" },
      { id: "E4", tipo: "etiqueta", estilo: "branca", x: 850, y: 1220, w: 320, rot: -3, anim: "slide_giro", gatilho: "item_4" },
      { id: "M", tipo: "mascote", poses: ["assustado", "suando"], x: 540, y: 1610, w: 320, anim: "pop_bounce", t: 0.6, opcional: true },
    ],
  },
  {
    id: "V1", ato: "virada", nome: "Logo carimbada",
    vagas: [
      { id: "F1", tipo: "foto", x: 540, y: 1180, w: 700, rot: 3, anim: "pop_bounce", t: 0 },
      { id: "L", tipo: "logo_grande", x: 540, y: 700, w: 760, anim: "carimbo", t: 0.15 },
      { id: "T1", tipo: "etiqueta", estilo: "verde", texto: "Tudo incluso!", x: 540, y: 1620, w: 560, anim: "slide_giro", gatilho: "incluso" },
      { id: "A1", tipo: "figurinha", categoria: "comemoracao", x: 170, y: 400, w: 200, anim: "pop_bounce", t: 0.3 },
      { id: "A2", tipo: "figurinha", categoria: "comemoracao", x: 910, y: 400, w: 200, anim: "pop_bounce", t: 0.35 },
    ],
  },
  {
    id: "P1", ato: "prova", nome: "Mural 2×2",
    vagas: [
      { id: "F1", tipo: "foto", x: 300, y: 600, w: 470, rot: -4, anim: "pop_bounce", gatilho: "diferencial_1", t: 0, etiqueta: { x: 300, y: 880, estilo: "amarela" } },
      { id: "F2", tipo: "foto", x: 790, y: 680, w: 470, rot: 3, anim: "pop_bounce", gatilho: "diferencial_2", t: 0.25, etiqueta: { x: 790, y: 960, estilo: "rosa" } },
      { id: "F3", tipo: "foto", x: 300, y: 1170, w: 470, rot: 2, anim: "pop_bounce", gatilho: "diferencial_3", t: 0.5, etiqueta: { x: 300, y: 1450, estilo: "azul" } },
      { id: "F4", tipo: "foto", x: 790, y: 1250, w: 470, rot: -3, anim: "pop_bounce", gatilho: "diferencial_4", t: 0.75, etiqueta: { x: 790, y: 1530, estilo: "verde" } },
      { id: "M", tipo: "mascote", poses: ["apontando_esq", "apontando_dir", "joinha"], x: 540, y: 1690, w: 240, anim: "pop_bounce", t: 0.1, opcional: true },
    ],
  },
  {
    id: "O1", ato: "oferta", nome: "Selo central",
    vagas: [
      { id: "S", tipo: "selo", x: 540, y: 860, w: 600, anim: "selo_giro", t: 0 },
      { id: "K", tipo: "carinhas_arco", qtd: 10, arco: { cx: 540, cy: 860, raio: 380, de: 200, ate: 340 }, x: 540, y: 860, w: 110, anim: "pop_bounce", gatilho: "principal" },
      { id: "T1", tipo: "etiqueta", estilo: "amarela", x: 540, y: 330, w: 760, anim: "slide_giro", gatilho: "beneficio_2" },
      { id: "M", tipo: "mascote", poses: ["segurando_placa", "apontando_dir", "comemorando"], x: 200, y: 1180, w: 260, anim: "pop_bounce", t: 0.2 },
      { id: "T2", tipo: "etiqueta", estilo: "vermelha", x: 540, y: 1380, w: 700, anim: "carimbo", gatilho: "prazo" },
      { id: "B", tipo: "botao_whatsapp", x: 540, y: 1580, w: 760, anim: "pop_bounce", gatilho: "whatsapp" },
      { id: "R", tipo: "rodape", x: 540, y: 1700, w: 400, gatilho: "whatsapp" },
    ],
  },
];
export const moldePorId = (id: string) => MOLDES.find((m) => m.id === id);

// Sorteia um molde por ato, evitando repetir a combinação do último vídeo do buffet.
export function sortearMoldes(ultima?: Record<string, string>): Record<Ato, string> {
  for (let tent = 0; tent < 12; tent++) {
    const esc = Object.fromEntries(ATOS_MOLDE.map((a) => {
      const op = MOLDES.filter((m) => m.ato === a);
      return [a, op[Math.floor(Math.random() * op.length)].id];
    })) as Record<Ato, string>;
    if (!ultima || ATOS_MOLDE.some((a) => ultima[a] !== esc[a])) return esc;
    if (MOLDES.length === ATOS_MOLDE.length) return esc; // etapa 1: só 1 molde por ato
  }
  return Object.fromEntries(ATOS_MOLDE.map((a) => [a, MOLDES.find((m) => m.ato === a)!.id])) as Record<Ato, string>;
}

// Em quais atos o mascote aparece: SEMPRE na oferta + no máximo mais 2 (dos moldes que deixam).
export function sortearMascote(escolha: Record<Ato, string>): Set<Ato> {
  const opc = ATOS_MOLDE.filter((a) => a !== "oferta" && moldePorId(escolha[a])?.vagas.some((v) => v.tipo === "mascote"));
  const embaralhado = [...opc].sort(() => Math.random() - 0.5).slice(0, 2);
  return new Set<Ato>(["oferta", ...embaralhado]);
}

// ---------- figurinhas por categoria (sorteadas, sem repetir no vídeo) ----------
// Etapa 1: categorias apontam pra biblioteca atual do motor; a biblioteca nova (50 figurinhas)
// entra na etapa 2 sem mudar os moldes.
export const FIGURINHAS_CATEGORIA: Record<string, string[]> = {
  festa: ["baloes", "confete", "estrela_amarela", "uau"],
  brilho: ["estrela_amarela", "coracao"],
  comemoracao: ["confete", "uau", "baloes", "coracao"],
  dinheiro: ["carinha_preocupada"],
  estresse: ["carinha_preocupada"],
  setas: ["seta_desenhada"],
};

// ---------- o que a Bia preenche ----------
export type RespostaAto = {
  narracao: string;
  vagas?: Record<string, { foto?: string; texto?: string; gatilho?: string; pose?: string }>;
};
export type RespostaMoldes = Partial<Record<Ato, RespostaAto>>;

// Quanto da narração cada ato leva (gancho 4–5 · dor 5–6 · virada 3–4 · prova 8–10 · oferta 7–8).
export const PESO_ATO: Record<Ato, number> = { gancho: 0.15, dor: 0.18, virada: 0.12, prova: 0.31, oferta: 0.24 };

// Descrição das vagas que a Bia precisa preencher, por molde (vai no prompt).
export function vagasParaBia(m: Molde, comMascote: boolean): string {
  const linhas: string[] = [];
  for (const v of m.vagas) {
    if (v.tipo === "foto") linhas.push(`"${v.id}": {"foto":"<id da foto>"${v.etiqueta ? ',"texto":"<diferencial, até 4 palavras>","gatilho":"<palavra da narração>"' : ""}}`);
    else if (v.tipo === "etiqueta" && !v.texto && m.ato !== "oferta") linhas.push(`"${v.id}": {"texto":"<até 5 palavras>","gatilho":"<palavra da narração>"}`);
    else if (v.tipo === "etiqueta" && v.texto && m.ato !== "oferta") linhas.push(`"${v.id}": {"texto":"${v.texto}" (pode trocar, até 5 palavras),"gatilho":"<palavra da narração>"}`);
    else if (v.tipo === "balao") linhas.push(`"${v.id}": {"texto":"<até 5 palavras>"}`);
    else if (v.tipo === "mascote" && comMascote && m.ato !== "oferta") linhas.push(`"${v.id}": {"pose":"${v.poses.join('" | "')}"}`);
  }
  return linhas.length ? `{${linhas.join(", ")}}` : "{}";
}

const casa = (p: string, g: string) => p === g || (g.length >= 3 && p.startsWith(g)) || (p.length >= 4 && g.startsWith(p));
const palavrasDe = (s: string) => normalizar(s).split(" ").filter(Boolean);
const RE_URGENCIA = /\b(s[oó]|somente|apenas|primeir|[uú]ltim|limitad|vagas?|contratos?|convidad)/i;
function urgenciaCurta(ex: string): string {
  const m = /(\d+)\s*(?:primeir[oa]s\s*)?(contratos?|vagas?|festas?|datas?|fam[ií]lias?|convidad[oa]s?)/i.exec(ex);
  if (m) return `Só ${m[1]} ${m[2].toLowerCase()}`;
  return ex.split(/\s+/).slice(0, 4).join(" ");
}

// ---------- CONFERÊNCIA do que a Bia mandou (erros voltam pra ela corrigir) ----------
export function validarMoldes(r: RespostaMoldes, escolha: Record<Ato, string>, oferta: Oferta, fotos: Map<string, FotoInfo>, faixa: Faixa, comMascote: Set<Ato>): string[] {
  const erros: string[] = [];
  const usadas: string[] = [];
  let total = 0;
  for (const a of ATOS_MOLDE) {
    const ra = r[a];
    const m = moldePorId(escolha[a])!;
    if (!ra?.narracao?.trim()) { erros.push(`Falta a narração do ato "${a}".`); continue; }
    total += contarPalavras(ra.narracao);
    for (const v of m.vagas) {
      const pv = ra.vagas?.[v.id];
      if (v.tipo === "foto") {
        if (!pv?.foto) erros.push(`Ato ${a}: a vaga ${v.id} precisa de uma foto (id da lista).`);
        else if (!fotos.has(pv.foto)) erros.push(`Ato ${a}: a foto "${pv.foto}" não existe na lista — use só ids da lista.`);
        else usadas.push(pv.foto);
        if (v.etiqueta && !pv?.texto) erros.push(`Ato ${a}: a vaga ${v.id} precisa do "texto" do diferencial.`);
        if (a === "gancho" && pv?.foto && /fachada|entrada do|frente do|port[aã]o|letreiro|vista externa|parte externa/i.test(fotos.get(pv.foto)?.descricao || "")) erros.push(`Nunca abra com fachada/entrada: troque a foto do gancho ("${pv.foto}").`);
      }
      if ((v.tipo === "etiqueta" || v.tipo === "balao" || v.tipo === "foto") && pv?.texto && contarPalavras(pv.texto) > 5) erros.push(`Ato ${a}: o texto "${pv.texto}" passa de 5 palavras.`);
      if (v.tipo === "etiqueta" && !v.texto && a !== "oferta" && !pv?.texto) erros.push(`Ato ${a}: a vaga ${v.id} precisa de "texto".`);
    }
  }
  const rep = usadas.filter((id, i) => usadas.indexOf(id) !== i);
  if (rep.length) erros.push(`Não repita foto no mesmo vídeo (repetida: ${[...new Set(rep)].join(", ")}).`);
  if (total < faixa.min || total > faixa.max) erros.push(`A narração tem ${total} palavras — precisa ter entre ${faixa.min} e ${faixa.max} (soma de todos os atos).`);
  // OFERTA falada
  const falaOferta = palavrasDe(r.oferta?.narracao || "").join(" ");
  const chave = palavrasDe(oferta.principal).filter((p) => p.length >= 4 && !["gratis", "ganha", "ganhe", "mais"].includes(p))[0];
  if (chave && !falaOferta.includes(chave)) erros.push(`A oferta principal ("${oferta.principal}") precisa ser FALADA no ato oferta.`);
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(oferta.prazo || "");
  if (dia && !falaOferta.includes(porExtenso(Number(dia[3])))) erros.push(`O prazo (dia ${Number(dia[3])}) precisa ser FALADO no ato oferta, por extenso.`);
  if (!/whats|zap|chama/.test(falaOferta)) erros.push('O ato oferta termina chamando pro WhatsApp ("chama no WhatsApp").');
  void comMascote;
  return erros;
}

// Problemas que não seguram o vídeo na última tentativa (tamanho um pouco fora da faixa).
export function soDetalhesMoldes(erros: string[]): boolean {
  return erros.every((e) => {
    const n = /narração tem (\d+) palavras — precisa ter entre (\d+) e (\d+)/.exec(e);
    if (n) return Number(n[1]) >= Number(n[2]) - 6 && Number(n[1]) <= Number(n[3]) + 4;
    return /passa de 5 palavras/.test(e);
  });
}

// ---------- molde + resposta da Bia → roteiro de ELEMENTOS que o motor desenha ----------
const Z = { foto: 10, recibo: 12, figurinha: 20, carinhas: 22, texto: 30, selo: 40, mascote: 50, botao: 60 };
export function montarRoteiroMoldes(r: RespostaMoldes, escolha: Record<Ato, string>, oferta: Oferta, comMascote: Set<Ato>): Roteiro {
  const usadasFig = new Set<string>();
  const figurinha = (cat: string) => {
    const pool = FIGURINHAS_CATEGORIA[cat] || FIGURINHAS_CATEGORIA.festa;
    const livre = pool.filter((f) => !usadasFig.has(f));
    const f = (livre.length ? livre : pool)[Math.floor(Math.random() * (livre.length || pool.length))];
    usadasFig.add(f);
    return f;
  };
  const transicao: Record<Ato, string> = { gancho: "rasgo_papel", dor: "virar_pagina", virada: "corte_seco", prova: "corte_seco", oferta: "fim" };
  const extras = (oferta.extras || []).map((x) => x.trim()).filter(Boolean);
  const urgentes = extras.filter((x) => RE_URGENCIA.test(x));
  const normais = extras.filter((x) => !RE_URGENCIA.test(x));
  const pz = prazoCurto(oferta.prazo);
  const textoOferta: Record<string, string> = {
    beneficio_2: normais.slice(0, 2).join(" · "),
    prazo: [urgentes[0] ? urgenciaCurta(urgentes[0]) : "", pz ? `até ${pz}` : ""].filter(Boolean).join(" · "),
  };
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(oferta.prazo || "");

  const cenas: Cena[] = ATOS_MOLDE.map((a, idx) => {
    const m = moldePorId(escolha[a])!;
    const ra = r[a] || { narracao: "" };
    const ps = palavrasDe(ra.narracao);
    const temPalavra = (g?: string) => !!g && ps.some((p) => casa(p, palavrasDe(g)[0] || "~"));
    // gatilho da Bia (se a palavra existe na fala); senão, o tempo do molde (fração da cena)
    const tempo = (v: Vaga, gat?: string, tfPadrao = 0.5) => (temPalavra(gat) ? { gatilho: palavrasDe(gat!)[0] } : { tf: typeof v.t === "number" ? v.t : tfPadrao });
    const acha = (alvos: string[]) => ps.find((p) => alvos.some((x) => x && casa(p, x)));
    const els: Elemento[] = [];
    let nFoto = 0;
    m.vagas.forEach((v, k) => {
      const pv = ra.vagas?.[v.id] || {};
      const base = { x: v.x, y: v.y, w: v.w, rot: v.rot ?? 0, animacao: v.anim || "pop_bounce", vaga: v.id } as Elemento;
      const tfK = (k + 0.5) / m.vagas.length;
      switch (v.tipo) {
        case "foto": {
          if (!pv.foto) return;
          els.push({ ...base, tipo: "foto", asset: pv.foto, moldura: "polaroid", z: Z.foto + nFoto++, ...tempo(v, pv.gatilho, tfK) });
          if (v.etiqueta && pv.texto) els.push({ tipo: "adesivo", estilo: `etiqueta_${v.etiqueta.estilo}`, texto: pv.texto, x: v.etiqueta.x, y: v.etiqueta.y, w: v.etiqueta.w || 420, rot: v.rot ? -v.rot / 2 : 0, animacao: "slide_giro", z: Z.texto, vaga: `${v.id}_etq`, ...(temPalavra(pv.gatilho) ? { gatilho: palavrasDe(pv.gatilho!)[0] } : { tf: Math.min(0.95, (typeof v.t === "number" ? v.t : tfK) + 0.08) }) });
          return;
        }
        case "figurinha":
          els.push({ ...base, tipo: "adesivo", estilo: figurinha(v.categoria), z: Z.figurinha, tf: v.t ?? tfK });
          return;
        case "etiqueta": {
          let texto = pv.texto || v.texto || "";
          let gat = pv.gatilho;
          if (a === "oferta") {
            texto = textoOferta[v.gatilho || ""] || "";
            gat = v.gatilho === "prazo" ? acha([...(urgentes[0] ? palavrasDe(urgenciaCurta(urgentes[0])).filter((p) => p.length >= 4) : []), ...(dia ? [porExtenso(Number(dia[3]))] : []), "ate"]) : acha(palavrasDe(normais[0] || "").filter((p) => p.length >= 4));
          } else if (!temPalavra(gat) && v.gatilho && !["auto"].includes(v.gatilho) && !v.gatilho.startsWith("item_")) gat = v.gatilho;
          if (!texto) return;
          els.push({ ...base, tipo: "adesivo", estilo: `etiqueta_${v.estilo}`, texto, z: Z.texto, ...tempo(v, gat, tfK) });
          return;
        }
        case "balao":
          if (!(pv.texto || v.texto)) return;
          els.push({ ...base, tipo: "adesivo", estilo: "balao_fala", texto: pv.texto || v.texto, z: Z.texto, ...tempo(v, pv.gatilho, tfK) });
          return;
        case "mascote":
          if (!comMascote.has(a)) return;
          els.push({ ...base, tipo: "mascote", pose: v.poses.includes(pv.pose || "") ? pv.pose : v.poses[0], z: Z.mascote, ...tempo(v, pv.gatilho, tfK) });
          return;
        case "logo_grande":
          els.push({ ...base, tipo: "logo", z: Z.selo, tf: v.t ?? tfK });
          return;
        case "selo":
          els.push({ ...base, tipo: "adesivo", estilo: "selo_promo", texto: oferta.principal, z: Z.selo, tf: v.t ?? 0 });
          return;
        case "carinhas_arco": {
          const g = acha(palavrasDe(oferta.principal).filter((p) => p.length >= 4 && !["gratis", "ganha", "ganhe"].includes(p)));
          els.push({ ...base, tipo: "grupo", estilo: "carinhas_criancas", quantidade: v.qtd, intervalo: 0.08, arco: v.arco, z: Z.carinhas, ...(g ? { gatilho: g } : { tf: 0.15 }) });
          return;
        }
        case "botao_whatsapp": {
          const g = acha(["whatsapp", "chama", "zap", "chame"]);
          els.push({ ...base, tipo: "adesivo", estilo: "botao_whatsapp", texto: "Chama no WhatsApp", z: Z.botao, ...(g ? { gatilho: g } : { tf: 0.85 }) });
          return;
        }
        case "rodape": {
          if (!oferta.condicoes) return;
          const g = acha(["whatsapp", "chama", "zap", "chame"]);
          els.push({ ...base, tipo: "texto", estilo: "rodape", texto: "Consulte condições", animacao: "nenhuma", z: Z.botao, ...(g ? { gatilho: g } : { tf: 0.9 }) });
          return;
        }
        case "pilha_recibos":
          for (let i = 0; i < v.qtd; i++) {
            els.push({ tipo: "adesivo", estilo: "recibo", texto: "", pilha: true, x: v.x + (i % 2 ? 1 : -1) * v.deslocamento * 0.6, y: v.y + (i - (v.qtd - 1) / 2) * v.deslocamento, w: v.w, rot: i % 2 ? 4 : -4, animacao: "empilhar", z: Z.recibo + i * 0.01, vaga: `${v.id}${i + 1}`, tf: (v.t ?? 0) + i * 0.06 });
          }
          return;
      }
    });
    // o 1º elemento de cada cena entra em t = 0
    const primeiro = els.find((e) => e.tf === 0) || els[0];
    if (primeiro) { delete primeiro.gatilho; primeiro.tf = 0; }
    return {
      id: idx + 1, ato: a, molde: m.id, narracao: ra.narracao.trim(),
      fundo: a === "oferta" ? "papel_claro" : "papel_kraft",
      transicao_saida: transicao[a], elementos: els,
    };
  });
  return { cenas, moldes: escolha } as Roteiro;
}

// ---------- pedido pra Bia ----------
export function promptBiaMoldes(marca: { nome: string; descricao: string }, faixa: Faixa, escolha: Record<Ato, string>, comMascote: Set<Ato>): string {
  const alvo = Math.round((faixa.min + faixa.max) / 2);
  const atos = ATOS_MOLDE.map((a) => {
    const m = moldePorId(escolha[a])!;
    const palavras = Math.round(alvo * PESO_ATO[a]);
    const dica: Record<Ato, string> = {
      gancho: "pergunta ou cena que para o scroll; a foto F1 é a MAIS impactante (festa cheia, crianças). Nunca fachada/entrada/logo.",
      dor: "o problema do pai/mãe: cite 4 itens que dão trabalho/custam caro (ex.: salão, salgados, decoração, brinquedos) — E1..E4 são esses itens, na ordem em que são falados, e o gatilho de cada um é a palavra do item na fala.",
      virada: `o ${marca.nome} como solução ("tá tudo incluso"); fale a palavra "incluso". F1 = foto de festa cheia.`,
      prova: "4 diferenciais REAIS (só os da lista de diferenciais), um por foto, na ordem: F1..F4 têm a foto que mostra o diferencial, o \"texto\" curto dele e o gatilho (palavra do diferencial na fala).",
      oferta: "fale o benefício principal, os extras, a urgência/prazo por extenso e termine com \"chama no WhatsApp\". As peças da oferta o sistema monta sozinho.",
    };
    return `- ${a} (molde ${m.id} · ${m.nome}) — cerca de ${palavras} palavras. ${dica[a]}\n  vagas: ${vagasParaBia(m, comMascote.has(a))}`;
  }).join("\n");
  return `Você é a Bia, roteirista de vídeos-ANÚNCIO do buffet infantil "${marca.nome}". O vídeo é vertical, narrado, estilo COLAGEM (fotos polaroid, figurinhas, etiquetas). O LAYOUT JÁ ESTÁ PRONTO (moldes): você NÃO escolhe posição, tamanho nem animação — só escreve a narração de cada ato e preenche as vagas pedidas.

DIFERENCIAIS DO BUFFET (use SÓ estes — nunca invente): ${marca.descricao || "(sem descrição — fale de forma geral: festa completa, diversão, tranquilidade pros pais)"}

ATOS (nesta ordem) e o que preencher em cada um:
${atos}

REGRAS:
- Narração falada, informal, frases curtas, sempre "você" (nunca "cê"). Números e datas POR EXTENSO na fala.
- A narração INTEIRA (soma dos 5 atos) tem entre ${faixa.min} e ${faixa.max} palavras. CONTE antes de responder.
- Texto de etiqueta: no máximo 5 palavras; complementa a fala, não repete a frase.
- "gatilho" = UMA palavra que aparece na narração DAQUELE ato, no momento em que a peça deve entrar.
- Fotos: só ids da lista; prefira crianças e cor; não repita foto.
- Use os números da oferta EXATAMENTE como vieram.

Responda SÓ com JSON neste formato:
{"gancho":{"narracao":"...","vagas":{...}},"dor":{"narracao":"...","vagas":{...}},"virada":{"narracao":"...","vagas":{...}},"prova":{"narracao":"...","vagas":{...}},"oferta":{"narracao":"..."}}`;
}
