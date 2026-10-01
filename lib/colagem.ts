// VÍDEO ANÚNCIO (colagem) — regras da skill "video-colagem" em código: tipos do roteiro de cenas,
// VALIDADOR (o que a Bia escreveu só vai pro motor se passar aqui), a narração completa e o
// ALINHAMENTO com o tempo real de cada palavra falada (Whisper), pra cada figurinha entrar em
// cima da palavra certa. Módulo puro (sem banco/IA) — dá pra usar no servidor e testar fácil.

export type Oferta = { principal: string; extras: string[]; prazo: string; condicoes: boolean }; // prazo "AAAA-MM-DD" ou ""

export type Elemento = {
  tipo: "foto" | "adesivo" | "mascote" | "grupo" | "texto";
  asset?: string; // id da foto (ImagemMarca)
  estilo?: string;
  texto?: string;
  posicao?: string;
  rotacao?: number;
  animacao?: string;
  moldura?: string;
  pose?: string;
  balao?: string;
  quantidade?: number;
  intervalo?: number;
  gatilho?: string;
  t?: number; // segundos (preenchido pelo alinhamento)
};
export type Cena = { id: number; ato: string; narracao: string; fundo?: string; elementos: Elemento[]; transicao_saida?: string; inicio?: number; fim?: number };
export type Roteiro = { cenas: Cena[] };
export type FotoInfo = { descricao: string; categoria: string };

export const ATOS = ["gancho", "dor", "virada", "prova", "oferta"] as const;
export const ANIMACOES = ["pop_bounce", "slide_giro", "fita_adesiva", "carimbo", "empilhar", "wiggle", "ken_burns", "selo_giro", "nenhuma"];
export const POSICOES = ["centro", "sup_esq", "sup_dir", "inf_esq", "inf_dir", "meio_esq", "meio_dir", "topo", "faixa_meio", "base", "rodape"];
export const POSES = ["pular", "apontar", "comemorar", "acenar"];
export const TRANSICOES = ["corte_seco", "rasgo_papel", "virar_pagina", "acumula", "fim"];
export const MOLDURAS = ["polaroid", "recorte_branco", "sem_moldura"];
export const ESTILOS_ADESIVO = [
  "estrela_amarela", "uau", "coracao", "confete", "baloes", "seta_desenhada", "carinha_preocupada", "balao_fala",
  "etiqueta_amarela", "etiqueta_rosa", "etiqueta_azul", "etiqueta_verde", "recibo", "nota", "selo_promo", "botao_whatsapp",
];
const DECORATIVAS = new Set(["rasgo_papel", "virar_pagina"]);
const TIPOS = ["foto", "adesivo", "mascote", "grupo", "texto"];
const ESTILO_APELIDO: Record<string, string> = {
  selo: "selo_promo", selo_promocao: "selo_promo", selo_promocional: "selo_promo", promo: "selo_promo",
  whatsapp: "botao_whatsapp", botao: "botao_whatsapp", botao_whats: "botao_whatsapp", whats: "botao_whatsapp",
  estrela: "estrela_amarela", explosao: "uau", etiqueta: "etiqueta_amarela", seta: "seta_desenhada", balao: "balao_fala", nota_post_it: "nota",
};
const RE_FACHADA = /fachada|entrada do|frente do|port[aã]o|letreiro|vista externa|parte externa/i;

// ---------- texto / números ----------
const UNIDADES = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
export function porExtenso(n: number): string {
  if (n < 20) return UNIDADES[n] ?? String(n);
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNIDADES[n % 10]}` : "");
  if (n === 100) return "cem";
  return String(n);
}
// minúsculo, sem acento, números viram palavra ("10x" → "dez x"), só letras/números.
export function normalizar(s: string): string {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/(\d+)/g, (m) => ` ${Number(m) <= 100 ? porExtenso(Number(m)) : m} `)
    .replace(/[^a-z0-9]+/g, " ").trim();
}
const palavras = (s: string) => normalizar(s).split(" ").filter(Boolean);
const casa = (p: string, g: string) => p === g || (g.length >= 3 && p.startsWith(g)) || (p.length >= 4 && g.startsWith(p));
export const contarPalavras = (s: string) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

// Narração completa (o que a voz fala), com respiro entre os atos.
export function narracaoCompleta(r: Roteiro): string {
  return r.cenas.map((c, i) => (i > 0 && r.cenas[i - 1].ato !== c.ato ? "... " : "") + c.narracao.trim()).join(" ");
}

function prazoPartes(prazo: string): { dia: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prazo || "");
  return m ? { dia: Number(m[3]), mes: Number(m[2]) } : null;
}
export function prazoCurto(prazo: string): string {
  const p = prazoPartes(prazo);
  return p ? `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}` : "";
}

// ---------- correções automáticas (valores fora do catálogo viram o padrão, sem reprovar) ----------
export function corrigir(r: Roteiro): Roteiro {
  const c = (v: string | undefined, lista: string[], padrao: string) => (v && lista.includes(v) ? v : padrao);
  return {
    cenas: (r.cenas || []).map((cena, i) => ({
      id: i + 1,
      ato: String(cena.ato || "").toLowerCase(),
      narracao: String(cena.narracao || "").trim(),
      fundo: cena.fundo === "papel_claro" ? "papel_claro" : "papel_kraft",
      transicao_saida: c(cena.transicao_saida, TRANSICOES, "corte_seco"),
      elementos: (cena.elementos || []).map((e) => {
        // A IA às vezes põe o nome da figurinha no "tipo" ({"tipo":"selo_promo"}) ou usa apelidos
        // ("selo", "whatsapp") — normaliza pro formato certo em vez de reprovar.
        const bruto = { ...e } as Elemento & { tipo: string };
        const est = ESTILO_APELIDO[String(bruto.estilo || "").toLowerCase()] || String(bruto.estilo || "").toLowerCase();
        const tip = String(bruto.tipo || "").toLowerCase();
        if (!TIPOS.includes(tip)) { bruto.estilo = ESTILO_APELIDO[tip] || tip; bruto.tipo = "adesivo"; }
        else { bruto.tipo = tip as Elemento["tipo"]; if (bruto.estilo) bruto.estilo = est; }
        const x: Elemento = { ...bruto, posicao: c(bruto.posicao, POSICOES, "centro"), animacao: c(bruto.animacao, ANIMACOES, "pop_bounce") };
        if (typeof x.rotacao === "number") x.rotacao = Math.max(-8, Math.min(8, Math.round(x.rotacao)));
        if (x.tipo === "foto") x.moldura = c(x.moldura, MOLDURAS, "polaroid");
        if (x.tipo === "mascote") x.pose = c(x.pose, POSES, "acenar");
        if (x.tipo === "grupo") { x.estilo = "carinhas_criancas"; x.quantidade = Math.max(1, Math.min(12, Number(x.quantidade) || 10)); }
        return x;
      }),
    })),
  };
}

// ---------- peças OBRIGATÓRIAS da cena final ----------
// Selo com o benefício, prazo escrito, extras, botão do WhatsApp e "Consulte condições" são iguais
// em todo anúncio — se a Bia esquecer, o sistema coloca (não vale gastar tentativa da IA nisso).
export function garantirOferta(r: Roteiro, oferta: Oferta): Roteiro {
  const cenas = r.cenas.map((c) => ({ ...c, elementos: [...c.elementos] }));
  const ofertas = cenas.filter((c) => c.ato === "oferta");
  const ultima = ofertas[ofertas.length - 1] || cenas[cenas.length - 1];
  if (!ultima) return r;
  const ps = palavras(ultima.narracao);
  const acha = (alvos: string[]) => ps.find((p) => alvos.some((a) => a && casa(p, a))) || ps[0] || "";
  const todosOferta = ofertas.flatMap((c) => c.elementos);
  const telaOferta = normalizar(todosOferta.map((e) => e.texto || "").join(" "));
  const chave = palavras(oferta.principal).filter((p) => p.length >= 4 && !["gratis", "ganha", "ganhe", "mais"].includes(p));
  if (!todosOferta.some((e) => e.estilo === "selo_promo")) {
    ultima.elementos.push({ tipo: "adesivo", estilo: "selo_promo", texto: oferta.principal, posicao: "centro", animacao: "selo_giro", gatilho: acha(chave) });
  }
  const pz = prazoCurto(oferta.prazo);
  if (pz && !todosOferta.some((e) => (e.texto || "").includes(pz))) {
    const dia = prazoPartes(oferta.prazo);
    ultima.elementos.push({ tipo: "adesivo", estilo: "uau", texto: `Até ${pz}`, posicao: "sup_dir", rotacao: 7, animacao: "carimbo", gatilho: acha(dia ? [porExtenso(dia.dia), "ate"] : ["ate"]) });
  }
  const lados = ["sup_esq", "meio_dir", "meio_esq"];
  (oferta.extras || []).forEach((ex, i) => {
    const k = palavras(ex).filter((p) => p.length >= 4);
    if (k[0] && !telaOferta.includes(k[0])) ultima.elementos.push({ tipo: "adesivo", estilo: i % 2 ? "etiqueta_rosa" : "etiqueta_amarela", texto: ex, posicao: lados[i % 3], rotacao: i % 2 ? 6 : -6, animacao: "carimbo", gatilho: acha(k) });
  });
  if (!ultima.elementos.some((e) => e.estilo === "botao_whatsapp")) {
    ultima.elementos.push({ tipo: "adesivo", estilo: "botao_whatsapp", texto: "Chama no WhatsApp", posicao: "base", animacao: "pop_bounce", gatilho: acha(["whatsapp", "chama", "zap"]) });
  }
  if (oferta.condicoes && !ultima.elementos.some((e) => e.tipo === "texto" && /condi/i.test(e.texto || ""))) {
    ultima.elementos.push({ tipo: "texto", estilo: "rodape", texto: "Consulte condições", posicao: "rodape", animacao: "nenhuma", gatilho: acha(["whatsapp", "chama", "zap"]) });
  }
  return { cenas };
}

// ---------- detalhes VISUAIS que o sistema completa sozinho ----------
// Mínimo de figurinhas por cena, gatilho que não existe na fala e transições decorativas demais
// não são motivo pra reprovar o roteiro inteiro: o sistema arruma.
const FIGURINHAS_POR_ATO: Record<string, { estilo: string; texto?: string }[]> = {
  gancho: [{ estilo: "estrela_amarela", texto: "UAU!" }, { estilo: "confete" }, { estilo: "coracao" }],
  dor: [{ estilo: "carinha_preocupada" }, { estilo: "recibo", texto: "Conta alta" }, { estilo: "nota", texto: "Ufa..." }],
  virada: [{ estilo: "coracao" }, { estilo: "confete" }, { estilo: "estrela_amarela", texto: "Uau!" }],
  prova: [{ estilo: "estrela_amarela" }, { estilo: "seta_desenhada" }, { estilo: "coracao" }],
  oferta: [{ estilo: "confete" }, { estilo: "baloes" }, { estilo: "estrela_amarela" }],
};
const VAGAS_EXTRA = ["sup_dir", "inf_esq", "meio_dir", "sup_esq", "meio_esq", "inf_dir"];
export function completarCenas(r: Roteiro): Roteiro {
  let decorativas = 0;
  const cenas = r.cenas.map((c) => {
    const ps = palavras(c.narracao);
    const palavraEm = (frac: number) => ps[Math.min(ps.length - 1, Math.max(0, Math.round(frac * (ps.length - 1))))] || "";
    const elementos = c.elementos.map((e, k) => {
      const g = palavras(e.gatilho || "")[0];
      if (g && ps.some((p) => casa(p, g))) return e;
      return { ...e, gatilho: palavraEm((k + 0.5) / Math.max(1, c.elementos.length)) };
    });
    const usadas = new Set(elementos.map((e) => e.posicao));
    const pool = FIGURINHAS_POR_ATO[c.ato] || FIGURINHAS_POR_ATO.prova;
    let i = 0;
    while (elementos.filter((e) => e.tipo === "adesivo" || e.tipo === "grupo").length < 2 && i < pool.length) {
      const f = pool[i];
      i++;
      if (elementos.some((e) => e.estilo === f.estilo)) continue;
      const vaga = VAGAS_EXTRA.find((v) => !usadas.has(v)) || "sup_dir";
      usadas.add(vaga);
      elementos.push({ tipo: "adesivo", estilo: f.estilo, texto: f.texto, posicao: vaga, rotacao: i % 2 ? 6 : -6, animacao: i % 2 ? "pop_bounce" : "wiggle", gatilho: palavraEm(i / 3) });
    }
    let transicao = c.transicao_saida;
    if (DECORATIVAS.has(transicao || "")) { decorativas++; if (decorativas > 2) transicao = "corte_seco"; }
    return { ...c, elementos, transicao_saida: transicao };
  });
  return { cenas };
}

// Problemas de GOSTO (não impedem um bom vídeo): na última tentativa, o roteiro é aceito com eles.
// Tamanho da narração só é "gosto" se estiver perto da faixa (60 a 100 palavras ≈ 25 a 38s).
export function soDetalhes(erros: string[]): boolean {
  return erros.every((e) => {
    const n = /narração tem (\d+) palavras/.exec(e);
    if (n) return Number(n[1]) >= 60 && Number(n[1]) <= 100;
    return /sem cor|passa de 5 palavras|elementos — use/.test(e);
  });
}

// ---------- VALIDADOR ----------
// Devolve a lista de problemas (vazia = aprovado). As mensagens voltam pra Bia corrigir.
export function validarRoteiro(r: Roteiro, oferta: Oferta, fotos: Map<string, FotoInfo>): string[] {
  const erros: string[] = [];
  const cenas = r.cenas || [];
  if (!cenas.length) return ["O roteiro não tem cenas."];

  // 5 atos, na ordem, sem pular e sem voltar
  const seq = cenas.map((c) => c.ato).filter((a, i, arr) => i === 0 || arr[i - 1] !== a);
  if (seq.join(",") !== ATOS.join(",")) erros.push(`Os atos precisam ser exatamente ${ATOS.join(" → ")}, nessa ordem (cenas do mesmo ato ficam seguidas). Veio: ${seq.join(" → ")}.`);

  // duração (~2,6 palavras/s): 28–35s ≈ 70–92 palavras
  const total = cenas.reduce((s, c) => s + contarPalavras(c.narracao), 0);
  if (total < 68 || total > 92) erros.push(`A narração tem ${total} palavras — precisa ter entre 70 e 90 (vídeo de 28 a 35 segundos).`);

  // fotos
  const ids = cenas.flatMap((c) => c.elementos.filter((e) => e.tipo === "foto").map((e) => e.asset || ""));
  if (ids.length > 10) erros.push(`Use no máximo 10 fotos (veio ${ids.length}).`);
  if (ids.length < 3) erros.push("Use pelo menos 3 fotos do buffet (prova real).");
  const repetidas = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidas.length) erros.push(`Não repita foto no mesmo vídeo (repetida: ${[...new Set(repetidas)].join(", ")}).`);
  for (const id of ids) if (!fotos.has(id)) erros.push(`A foto "${id}" não existe na lista — use só os ids da lista de fotos.`);
  const gancho = cenas.find((c) => c.ato === "gancho");
  const fotosGancho = gancho?.elementos.filter((e) => e.tipo === "foto") || [];
  if (gancho && !fotosGancho.length) erros.push("A cena do gancho precisa de uma foto impactante (festa cheia/salão montado com crianças).");
  for (const e of fotosGancho) if (RE_FACHADA.test(fotos.get(e.asset || "")?.descricao || "")) erros.push(`Nunca abra com fachada/entrada: troque a foto "${e.asset}" do gancho.`);

  // cenas
  let decorativas = 0;
  cenas.forEach((c, i) => {
    const n = c.elementos.length;
    const max = c.ato === "oferta" ? 10 : 5; // a oferta recebe as peças obrigatórias (selo, prazo, extras, botão, rodapé)
    if (n < 2 || n > max) erros.push(`Cena ${i + 1} (${c.ato}) tem ${n} elementos — use de 2 a ${max === 10 ? "4 (a da oferta pode ter até 10)" : "4 (no máximo 5)"}.`);
    const figurinhas = c.elementos.filter((e) => e.tipo === "adesivo" || e.tipo === "grupo").length;
    if (figurinhas < 2) erros.push(`Cena ${i + 1} (${c.ato}) precisa de pelo menos 2 figurinhas (adesivos).`);
    if (!c.narracao) erros.push(`Cena ${i + 1} está sem narração.`);
    if (DECORATIVAS.has(c.transicao_saida || "")) decorativas++;
    const ps = palavras(c.narracao);
    for (const e of c.elementos) {
      if (e.tipo === "adesivo" && !ESTILOS_ADESIVO.includes(e.estilo || "")) erros.push(`Cena ${i + 1}: estilo de adesivo "${e.estilo}" não existe. Use um destes: ${ESTILOS_ADESIVO.join(", ")}.`);
      if ((e.tipo === "adesivo" || e.tipo === "texto") && e.texto && contarPalavras(e.texto) > 5 && e.estilo !== "selo_promo") erros.push(`Cena ${i + 1}: o texto "${e.texto}" passa de 5 palavras.`);
      if (e.balao && contarPalavras(e.balao) > 5) erros.push(`Cena ${i + 1}: o balão do mascote "${e.balao}" passa de 5 palavras.`);
      const g = palavras(e.gatilho || "")[0];
      if (!g) erros.push(`Cena ${i + 1}: todo elemento precisa de "gatilho" (uma palavra da narração dessa cena).`);
      else if (!ps.some((p) => casa(p, g))) erros.push(`Cena ${i + 1}: o gatilho "${e.gatilho}" não aparece na narração dessa cena.`);
    }
  });
  if (decorativas > 2) erros.push(`Use no máximo 2 transições decorativas (rasgo_papel/virar_pagina); veio ${decorativas}.`);

  // OFERTA: falada E escrita
  const cenasOferta = cenas.filter((c) => c.ato === "oferta");
  const falaOferta = palavras(cenasOferta.map((c) => c.narracao).join(" ")).join(" ");
  const telaOferta = normalizar(cenasOferta.flatMap((c) => c.elementos.map((e) => `${e.texto || ""} ${e.balao || ""}`)).join(" "));
  const chave = palavras(oferta.principal).filter((p) => p.length >= 4 && !["gratis", "ganha", "ganhe", "mais"].includes(p))[0];
  if (chave && !falaOferta.includes(chave)) erros.push(`A oferta principal ("${oferta.principal}") precisa ser FALADA na cena da oferta.`);
  if (chave && !telaOferta.includes(chave)) erros.push(`A oferta principal ("${oferta.principal}") precisa aparecer ESCRITA (selo_promo) na cena da oferta.`);
  if (!cenasOferta.some((c) => c.elementos.some((e) => e.estilo === "selo_promo"))) erros.push("A cena da oferta precisa de um selo_promo com o benefício principal.");
  for (const ex of oferta.extras || []) {
    const k = palavras(ex).filter((p) => p.length >= 4)[0];
    if (k && !telaOferta.includes(k)) erros.push(`O extra "${ex}" precisa aparecer escrito na cena da oferta.`);
  }
  const pz = prazoPartes(oferta.prazo);
  if (pz) {
    if (!falaOferta.includes(porExtenso(pz.dia))) erros.push(`O prazo (dia ${pz.dia}) precisa ser FALADO na oferta (ex: "só até dia ${porExtenso(pz.dia)}").`);
    const telaCrua = cenasOferta.flatMap((c) => c.elementos.map((e) => e.texto || "")).join(" ");
    if (!telaCrua.includes(prazoCurto(oferta.prazo)) && !telaCrua.includes(`${pz.dia}/${pz.mes}`)) erros.push(`O prazo precisa aparecer ESCRITO na tela como "Até ${prazoCurto(oferta.prazo)}".`);
  }
  const ultima = cenas[cenas.length - 1];
  if (!ultima.elementos.some((e) => e.estilo === "botao_whatsapp")) erros.push("A última cena precisa do botao_whatsapp.");
  if (oferta.condicoes && !ultima.elementos.some((e) => e.tipo === "texto" && /condi/i.test(e.texto || ""))) erros.push('A última cena precisa do rodapé "Consulte condições" (tipo texto, posicao rodape).');
  return erros;
}

// ---------- ALINHAMENTO com a voz (Whisper) ----------
export type PalavraFalada = { word: string; start: number; end: number };

// Casa as palavras do roteiro com as palavras que a voz REALMENTE falou (na ordem), preenche o
// início/fim de cada cena e o `t` de cada elemento (o instante do gatilho). O que não casar é
// estimado proporcionalmente dentro da cena.
export function alinharTempos(r: Roteiro, falada: PalavraFalada[], duracaoAudio: number): Roteiro {
  const fw: { p: string; t: number; f: number }[] = [];
  for (const w of falada) for (const p of palavras(w.word)) fw.push({ p, t: w.start, f: w.end });
  // Sem o tempo das palavras (Whisper falhou): espalha as palavras do roteiro por igual na duração
  // do áudio — os adesivos ficam perto da palavra, só não cravados.
  if (!fw.length && duracaoAudio > 0) {
    const todas = r.cenas.flatMap((c) => palavras(c.narracao));
    const passo = (duracaoAudio - 0.6) / Math.max(1, todas.length);
    todas.forEach((p, i) => fw.push({ p, t: 0.3 + i * passo, f: 0.3 + (i + 1) * passo }));
  }

  // tempo de cada palavra do roteiro (null = não achou)
  let j = 0;
  const porCena = r.cenas.map((c) => palavras(c.narracao).map((p) => {
    for (let k = j; k < Math.min(fw.length, j + 8); k++) if (casa(fw[k].p, p) || casa(p, fw[k].p)) { j = k + 1; return { p, t: fw[k].t as number | null }; }
    return { p, t: null as number | null };
  }));

  // início de cada cena = 1ª palavra encontrada (ou estimado entre vizinhas)
  const inicios: (number | null)[] = porCena.map((ps) => ps.find((x) => x.t !== null)?.t ?? null);
  const fimTotal = duracaoAudio || (fw.length ? fw[fw.length - 1].f : 30);
  for (let i = 0; i < inicios.length; i++) {
    if (inicios[i] === null) {
      const ant = i > 0 ? (inicios[i - 1] as number) : 0;
      const prox = inicios.slice(i + 1).find((x) => x !== null) ?? fimTotal;
      inicios[i] = ant + (prox - ant) / 2;
    }
  }
  return {
    cenas: r.cenas.map((c, i) => {
      const inicio = Math.max(0, (inicios[i] as number) - 0.12);
      const fim = i < r.cenas.length - 1 ? Math.max(inicio + 0.8, (inicios[i + 1] as number) - 0.12) : fimTotal + 0.3;
      const ps = porCena[i];
      const total = ps.length || 1;
      return {
        ...c,
        inicio,
        fim,
        elementos: c.elementos.map((e, k) => {
          const g = palavras(e.gatilho || "")[0];
          const idx = g ? ps.findIndex((x) => casa(x.p, g)) : -1;
          const achou = idx >= 0 ? ps[idx].t : null;
          const t = achou !== null ? achou - 0.05 : idx >= 0 ? inicio + (idx / total) * (fim - inicio - 0.3) : inicio + 0.2 + k * 0.3;
          return { ...e, t: Math.max(inicio, t) };
        }),
      };
    }),
  };
}

// ---------- PROMPT da Bia (a skill, condensada) ----------
export function promptSistemaColagem(marca: { nome: string; descricao: string }): string {
  return `Você é a Bia, roteirista de vídeos-ANÚNCIO do buffet infantil "${marca.nome}". Transforme as fotos do buffet + a oferta num vídeo vertical 9:16 de 28 a 35 segundos, narrado, no estilo COLAGEM/scrapbook (fotos tipo polaroid, adesivos e textos entrando na tela enquanto uma voz conduz). O objetivo é VENDER FESTA: prender nos 3 primeiros segundos, mostrar prova real, deixar a oferta clara e terminar chamando pro WhatsApp.

DIFERENCIAIS DO BUFFET (use SÓ estes — nunca invente diferencial): ${marca.descricao || "(sem descrição cadastrada — fale de forma geral: festa completa, diversão, tranquilidade pros pais)"}

ESTRUTURA OBRIGATÓRIA — 5 atos, nesta ordem (um ato pode ter 1 ou 2 cenas seguidas):
1. gancho (3–4s): pergunta ou cena que para o scroll. Foto MAIS impactante (festa cheia, crianças, salão montado). NUNCA abra com fachada, entrada ou logo.
2. dor (5–7s): o problema do pai/mãe (conta alta, mil fornecedores, estresse). Use recibos (estilo "recibo", animação "empilhar") e a carinha_preocupada. Pode ficar sem foto.
3. virada (3–4s): o buffet como solução ("no ${marca.nome}... tá tudo incluso").
4. prova (7–10s): 2 ou 3 diferenciais reais, UMA FOTO POR DIFERENCIAL, na mesma ordem da fala. Pode ter 2 cenas — as fotos se ACUMULAM na tela como um mural.
5. oferta (6–8s): o benefício principal lidera, extras como reforço, PRAZO falado e escrito, chamada pro WhatsApp.

REGRAS DE TEXTO:
- Narração falada, informal, frases curtas, sempre "você" (nunca "cê"). Números e datas POR EXTENSO na fala ("dez amiguinhos", "até quinze de outubro").
- A narração INTEIRA soma entre 70 e 90 palavras.
- Texto na tela: no máximo 5 palavras por adesivo (o selo_promo pode ter o benefício inteiro). A tela COMPLEMENTA a fala, não repete a frase.
- Prazo: falado E escrito ("Até DD/MM" num adesivo).
- Use os números da oferta EXATAMENTE como vieram.

FOTOS: escolha da lista pelo id. Priorize fotos com crianças e cor; evite espaço vazio ou escuro; nunca fachada no gancho; no máximo 10 fotos; não repita.

CADA CENA: de 2 a 4 elementos (a da oferta pode ter até 8), com pelo menos 2 figurinhas (adesivo ou grupo). Todo elemento tem "gatilho" = UMA palavra da narração DAQUELA cena, no momento em que ele deve entrar.

MASCOTE (o castelinho apresentador): tipo "mascote", com "pose" (pular | apontar | comemorar | acenar) e "balao" opcional (até 5 palavras). Entra pulando no gancho, aponta as fotos na prova, comemora segurando o selo na oferta.

CATÁLOGO (use só estes valores):
- tipo: foto | adesivo | mascote | grupo | texto
- estilo do adesivo: ${ESTILOS_ADESIVO.join(", ")}
- grupo: {"tipo":"grupo","estilo":"carinhas_criancas","quantidade":10,"intervalo":0.08} (carinhas de criança pulando — ótimo pra "amiguinhos")
- texto: só o rodapé {"tipo":"texto","estilo":"rodape","texto":"Consulte condições","posicao":"rodape"}
- animacao: ${ANIMACOES.join(", ")} (fade só em exceção)
- posicao: ${POSICOES.join(", ")} (fotos: centro, sup_esq, sup_dir, inf_esq, inf_dir; mascote: inf_esq, inf_dir, meio_esq, meio_dir; botão WhatsApp: base)
- moldura da foto: polaroid | recorte_branco | sem_moldura
- rotacao: entre -8 e 8, alternando o sinal
- fundo: papel_kraft (padrão) | papel_claro (use na oferta)
- transicao_saida: corte_seco (maioria) | rasgo_papel | virar_pagina (no MÁXIMO 2 decorativas no vídeo) | acumula (entre cenas do mesmo ato) | fim (última cena)

A ÚLTIMA cena tem: selo_promo com o benefício principal (animação selo_giro), o prazo escrito, os extras escritos, o botao_whatsapp (posicao base) e, se houver condições, o rodapé "Consulte condições".

Responda SÓ com JSON: {"cenas":[{"id":1,"ato":"gancho","narracao":"...","fundo":"papel_kraft","elementos":[{"tipo":"foto","asset":"<id>","moldura":"polaroid","posicao":"centro","rotacao":-5,"animacao":"pop_bounce","gatilho":"..."}],"transicao_saida":"corte_seco"}]}`;
}
