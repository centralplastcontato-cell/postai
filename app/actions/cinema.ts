"use server";

// VÍDEO CINEMA: o fluxo inteiro do lado do site (mesmo esquema do vídeo anúncio/colagem).
//   1. criarVideoCinema / salvarTemaCinema — o dono conta o tema (e, se quiser, oferta, prazo, depoimento).
//   2. gerarRoteiroCinema — a Bia escreve as cenas; a CONFERÊNCIA (lib/cinema) devolve pra ela corrigir.
//   3. gerarVozCinema + sincronizarVozCinema — narração (a mesma voz dos outros vídeos) e o tempo de
//      cada palavra (Whisper) pra legenda entrar no ritmo da fala.
//   4. montarVideoCinema — manda pro /cinema do motor; ele avisa no /api/video-pronto.
// Usa o registro VideoTematico (modo "cinema"): reaproveita os campos da colagem (tema em
// colagemOferta, roteiro em colagemRoteiro, fotos escolhidas em colagemFotos).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { fotosDivulgaveis } from "@/lib/fotos-divulgaveis";
import { gerarNarracaoMp3 } from "@/lib/narracao";
import { vozValida, VOZ_PADRAO } from "@/lib/vozes";
import { dispararMotorCinema } from "@/lib/video-engine";
import { baseUrl } from "@/lib/config";
import { tempoDasPalavras } from "@/lib/tempo-palavras";
import { contarPalavras } from "@/lib/colagem";
import {
  lerTema, lerRoteiroCinema, validarCinema, soDetalhesCinema, montarRoteiroCinema, alinharCinema, temTemposCinema,
  narracaoCinema, faixaCinema, promptBiaCinema, prazoPorExtenso, DURACAO_CINEMA, COM_FOTO, type TemaCinema,
} from "@/lib/cinema";

async function carregar(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { id: true, nome: true, slug: true, descricao: true, logoUrl: true, corPrimaria: true, paleta: true } } },
  });
  if (!v || v.modo !== "cinema") return { ok: false as const, erro: "Vídeo cinema não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  return { ok: true as const, v };
}
function lerFotosEscolhidas(json: string): string[] {
  try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a.map(String).filter(Boolean).slice(0, 20) : []; } catch { return []; }
}
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD

// ---------- 1. criar / tema ----------
export async function criarVideoCinema(marcaId: string, titulo = "") {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const nome = (titulo || "").trim().slice(0, 40) || "Vídeo cinema";
  const v = await prisma.videoTematico.create({ data: { marcaId, titulo: nome, modo: "cinema" } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, id: v.id };
}

export async function salvarTemaCinema(videoId: string, tema: TemaCinema) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const t = lerTema(JSON.stringify(tema));
  if (t.tema.trim().length < 5) return { ok: false as const, erro: "Conte em uma frase do que é o vídeo (ex: últimas datas de dezembro)." };
  if (t.depoimento.texto && t.depoimento.texto.length < 10) return { ok: false as const, erro: "O depoimento ficou curto demais — cole o texto que o cliente escreveu." };
  const novo = JSON.stringify(t);
  const mudou = c.v.colagemOferta !== novo;
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemOferta: novo, ...(mudou ? { colagemRoteiro: "{}" } : {}) } });
  return { ok: true as const, tema: t, roteiroZerado: mudou && c.v.colagemRoteiro !== "{}" };
}

// ---------- fotos ----------
export async function fotosParaCinema(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const lista = await fotosDivulgaveis(c.v.marcaId, { limite: 400 });
  return { ok: true as const, fotos: lista.map((f) => ({ id: f.id, url: f.url, descricao: f.descricao })) };
}
export async function salvarFotosCinema(videoId: string, ids: string[]) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const ok = new Set((await fotosDivulgaveis(c.v.marcaId, { limite: 400 })).map((f) => f.id));
  const limpas = [...new Set(ids.map(String))].filter((id) => ok.has(id)).slice(0, 20);
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemFotos: JSON.stringify(limpas) } });
  return { ok: true as const, ids: limpas };
}
export async function trocarFotoCinema(videoId: string, indice: number, fotoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  if (c.v.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar." };
  const roteiro = lerRoteiroCinema(c.v.colagemRoteiro);
  const cena = roteiro?.cenas[indice];
  if (!roteiro || !cena || !COM_FOTO.has(cena.tipo)) return { ok: false as const, erro: "Não achei essa foto no roteiro." };
  const foto = (await fotosDivulgaveis(c.v.marcaId, { limite: 400 })).find((f) => f.id === fotoId);
  if (!foto) return { ok: false as const, erro: "Essa foto não pode ser usada (não é desta marca ou a festa não foi autorizada)." };
  cena.foto = fotoId;
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(roteiro) } });
  return { ok: true as const, roteiro, url: foto.url };
}

export async function dadosVideoCinema(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const roteiro = lerRoteiroCinema(c.v.colagemRoteiro);
  const escolhidas = lerFotosEscolhidas(c.v.colagemFotos);
  const ids = [...new Set([...(roteiro ? roteiro.cenas.map((x) => x.foto || "").filter(Boolean) : []), ...escolhidas])];
  const imgs = ids.length ? await prisma.imagemMarca.findMany({ where: { id: { in: ids }, marcaId: c.v.marcaId }, select: { id: true, url: true } }) : [];
  return {
    ok: true as const,
    titulo: c.v.titulo,
    tema: lerTema(c.v.colagemOferta),
    roteiro,
    fotos: Object.fromEntries(imgs.map((i) => [i.id, i.url])),
    fotosEscolhidas: escolhidas,
    narracao: { url: c.v.narracaoUrl, segundos: c.v.narracaoSeg, voz: c.v.narracaoVoz || VOZ_PADRAO, estilo: c.v.narracaoEstilo },
    temTempos: temTemposCinema(roteiro) && c.v.narracaoUrl.startsWith("http"),
    videoUrl: c.v.videoUrl,
  };
}

// ---------- 2. roteiro (Bia + conferência) ----------
// Velocidade REAL da voz (palavras/s), medida nos vídeos já narrados com ela nesta marca.
async function velocidadeDaVoz(marcaId: string, voz: string): Promise<number> {
  const vs = await prisma.videoTematico.findMany({
    where: { marcaId, modo: { in: ["colagem", "cinema"] }, narracaoVoz: voz, narracaoSeg: { gt: 8 }, NOT: { narracaoTexto: "" } },
    orderBy: { criadoEm: "desc" }, take: 3, select: { narracaoTexto: true, narracaoSeg: true },
  });
  const taxas = vs.map((x) => contarPalavras(x.narracaoTexto) / Math.max(5, x.narracaoSeg - 1.2)).filter((t) => t > 1 && t < 4);
  return taxas.length ? taxas.reduce((a, b) => a + b, 0) / taxas.length : 2.3;
}
// Ordena o acervo pra Bia: crianças/festa/cor primeiro; vazio, escuro e fachada por último.
function pontuar(descricao: string): number {
  const d = descricao.toLowerCase();
  let p = 0;
  if (/crian|menin|aniversari|parab|bolo|festa|brincando|sorrindo|dan[çc]/.test(d)) p += 3;
  if (/colorid|balõ|balo|decora|luzes|brinquedo|pula|tobog|piscina de bolinha/.test(d)) p += 1.5;
  if (/vazi|sem pessoas|escur/.test(d)) p -= 3;
  if (/fachada|entrada|letreiro|port[aã]o|externa/.test(d)) p -= 1;
  return p;
}

// UMA tentativa por chamada (a Vercel corta em 60s): reprovou → devolve o rascunho + problemas e a
// TELA chama de novo mandando a correção (até 3 vezes).
export async function gerarRoteiroCinema(videoId: string, correcao?: { rascunho: string; erros: string[] }, ultimaTentativa = false) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const tema = lerTema(v.colagemOferta);
  if (tema.tema.trim().length < 5) return { ok: false as const, erro: "Conte do que é o vídeo primeiro." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const faixa = faixaCinema(await velocidadeDaVoz(v.marcaId, v.narracaoVoz || VOZ_PADRAO));

  const idsDoDono = lerFotosEscolhidas(v.colagemFotos);
  const todas = await fotosDivulgaveis(v.marcaId, { limite: 400 });
  const doDono = todas.filter((f) => idsDoDono.includes(f.id)).map((f) => ({ ...f, descricao: f.descricao || "(foto escolhida pelo dono)" }));
  const soDoDono = doDono.length >= 4;
  const acervo = soDoDono ? doDono : [
    ...doDono,
    ...todas.filter((f) => f.descricao && !idsDoDono.includes(f.id)).map((f) => ({ ...f, pts: pontuar(f.descricao) })).sort((a, b) => b.pts - a.pts || a.usos - b.usos).slice(0, 50 - doDono.length),
  ];
  if (acervo.length < 3) return { ok: false as const, erro: "Preciso de pelo menos 3 fotos (com descrição) no banco de imagens pra montar o vídeo." };
  const ids = new Set(acervo.map((f) => f.id));

  const pedido = `FOTOS DISPONÍVEIS (id | descrição) — as primeiras costumam ser as melhores:
${acervo.map((f) => `${f.id} | ${f.descricao}`).join("\n")}
${doDono.length ? `\nFOTOS ESCOLHIDAS PELO DONO — ${soDoDono ? "use SÓ estas" : "use TODAS estas"}: ${doDono.map((f) => f.id).join(", ")}` : ""}

Escreva o roteiro.`;
  const mensagens: { role: string; content: string }[] = [
    { role: "system", content: promptBiaCinema({ nome: v.marca.nome, descricao: v.marca.descricao || "" }, tema, faixa) },
    { role: "user", content: pedido },
  ];
  if (correcao?.rascunho) {
    mensagens.push(
      { role: "assistant", content: correcao.rascunho.slice(0, 20000) },
      { role: "user", content: `O roteiro foi REPROVADO na conferência. Corrija TODOS estes pontos e devolva o JSON completo de novo:\n- ${(correcao.erros || []).slice(0, 12).join("\n- ")}` },
    );
  }

  let texto = "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", response_format: { type: "json_object" }, temperature: correcao ? 0.5 : 0.85, messages: mensagens }),
      signal: AbortSignal.timeout(42000),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    texto = data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("Erro ao escrever o roteiro do cinema:", e);
    return { ok: false as const, erro: "Não consegui falar com a Bia agora. Tenta de novo em instantes." };
  }
  let resposta: Parameters<typeof validarCinema>[0];
  try { resposta = JSON.parse(texto); } catch {
    return { ok: false as const, reprovado: true as const, rascunho: texto, erros: ["A resposta não veio em JSON válido — responda SÓ com o JSON no formato pedido."] };
  }
  const erros = validarCinema(resposta, tema, ids, faixa);
  if (doDono.length && !soDoDono) {
    const usadas = new Set((resposta.cenas || []).map((x) => x?.foto || ""));
    for (const f of doDono) if (!usadas.has(f.id)) erros.push(`Use a foto "${f.id}" — o dono escolheu ela pro vídeo.`);
  }
  if (erros.length && !(ultimaTentativa && soDetalhesCinema(erros))) return { ok: false as const, reprovado: true as const, rascunho: texto, erros };
  const roteiro = montarRoteiroCinema(resposta, tema, hojeSP());
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(roteiro), narracaoTexto: narracaoCinema(roteiro) } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, roteiro, palavras: contarPalavras(narracaoCinema(roteiro)) };
}

// O dono pode mexer na FALA de uma cena antes de gerar a voz (ex: trocar uma palavra).
export async function editarFalaCinema(videoId: string, indice: number, fala: string, destaques: string[]) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const roteiro = lerRoteiroCinema(c.v.colagemRoteiro);
  const cena = roteiro?.cenas[indice];
  if (!roteiro || !cena) return { ok: false as const, erro: "Cena não encontrada." };
  const f = fala.trim().slice(0, 220);
  if (contarPalavras(f) < 2) return { ok: false as const, erro: "A fala ficou vazia." };
  cena.fala = f;
  cena.destaques = destaques.map((d) => d.trim()).filter(Boolean).slice(0, 2);
  delete cena.palavras; delete cena.inicio; delete cena.fim; // a voz precisa ser gerada de novo
  await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(roteiro), narracaoTexto: narracaoCinema(roteiro) } });
  return { ok: true as const, roteiro };
}

// ---------- 3. voz + tempo de cada palavra ----------
export async function gerarVozCinema(videoId: string, vozId?: string, direcao?: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar." };
  const roteiro = lerRoteiroCinema(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Peça o roteiro pra Bia primeiro." };
  const voz = vozValida(vozId || v.narracaoVoz || VOZ_PADRAO);
  const estilo = (direcao ?? v.narracaoEstilo ?? "").trim().slice(0, 900);
  try {
    // mesma voz e direção dos outros vídeos (sem acelerar); só as pausas mudas longas encurtam
    const texto = narracaoCinema(roteiro);
    const { url, segundos } = await gerarNarracaoMp3({ texto, vozId: voz, direcao: estilo, slugMarca: v.marca.slug || "marca", ref: videoId.slice(-6), apertarPausas: true });
    const alinhado = alinharCinema(roteiro, [], segundos); // tempo ESTIMADO (o exato vem na outra chamada)
    const antigo = v.narracaoUrl;
    await prisma.videoTematico.update({
      where: { id: videoId },
      data: { colagemRoteiro: JSON.stringify(alinhado), narracaoTexto: texto, narracaoVoz: voz, narracaoEstilo: estilo, narracaoUrl: url, narracaoSeg: Math.round(segundos) },
    });
    if (antigo.startsWith("http")) import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
    const foraDoTempo = segundos > DURACAO_CINEMA.max + 2 ? ("longo" as const) : segundos < DURACAO_CINEMA.min - 4 ? ("curto" as const) : null;
    return { ok: true as const, url, segundos: Math.round(segundos), segundosExatos: segundos, foraDoTempo, palavrasTexto: contarPalavras(texto) };
  } catch (e) {
    console.error("Erro ao gerar a voz do cinema:", e);
    return { ok: false as const, erro: "Não consegui gerar a voz agora." };
  }
}

export async function sincronizarVozCinema(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const roteiro = lerRoteiroCinema(v.colagemRoteiro);
  if (!roteiro || !v.narracaoUrl.startsWith("http")) return { ok: false as const, erro: "Gere a voz primeiro." };
  const falada = await tempoDasPalavras(v.narracaoUrl);
  const palavrasTexto = contarPalavras(v.narracaoTexto);
  const repetiu = falada.length > palavrasTexto * 1.3; // a voz às vezes repete trechos
  if (falada.length) {
    // duração exata do áudio: o fim da última palavra + o rabicho do jingle (o narracaoSeg é arredondado)
    const seg = Math.max(v.narracaoSeg, (falada[falada.length - 1]?.end || 0) + 1.2);
    await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(alinharCinema(roteiro, falada, seg)) } });
  }
  return { ok: true as const, sincronizado: falada.length > 0, repetiu, palavrasFaladas: falada.length, palavrasTexto };
}

// A voz saiu fora do tempo: a Bia reescreve SÓ as falas (mesmas cenas e fotos).
export async function ajustarTamanhoCinema(videoId: string, segundosAtuais: number) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  const roteiro = lerRoteiroCinema(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Sem roteiro pra ajustar." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const tema = lerTema(v.colagemOferta);
  const atuais = contarPalavras(narracaoCinema(roteiro));
  const alvo = Math.max(40, Math.min(110, Math.round((atuais * DURACAO_CINEMA.ideal) / Math.max(10, segundosAtuais))));
  const fator = alvo / Math.max(1, atuais);
  const lista = roteiro.cenas.map((x, i) => `${i + 1}. [${x.tipo}] (hoje ${contarPalavras(x.fala)} → escreva ${Math.max(4, Math.round(contarPalavras(x.fala) * fator))}) "${x.fala}" — mantenha a palavra: ${x.destaques.join(", ")}`).join("\n");
  for (let tentativa = 1; tentativa <= 2; tentativa++) try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1", response_format: { type: "json_object" }, temperature: 0.5,
        messages: [
          { role: "system", content: `Você ajusta o TAMANHO da narração de um vídeo-anúncio sem mudar a história. Reescreva cada fala pra que o TOTAL tenha ${alvo} palavras (hoje ${atuais}), seguindo a meta de CADA cena. Mantenha o tom informal, "você", números por extenso${tema.principal ? `, a oferta exata (${tema.principal})` : ""}${tema.prazo ? `, o prazo "até ${prazoPorExtenso(tema.prazo)}"` : ""} e, em cada cena, a palavra indicada. Proibido repetir frase. Responda só com JSON: {"falas":["cena 1","cena 2",...]} na mesma ordem.` },
          { role: "user", content: lista },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const j = JSON.parse((await resp.json()).choices?.[0]?.message?.content ?? "{}") as { falas?: string[] };
    if (!Array.isArray(j.falas) || j.falas.length !== roteiro.cenas.length) throw new Error("resposta fora do formato");
    const novo = { ...roteiro, cenas: roteiro.cenas.map((x, i) => { const n = { ...x, fala: String(j.falas![i] || x.fala).trim() }; delete n.palavras; delete n.inicio; delete n.fim; return n; }) };
    await prisma.videoTematico.update({ where: { id: videoId }, data: { colagemRoteiro: JSON.stringify(novo), narracaoTexto: narracaoCinema(novo) } });
    return { ok: true as const, roteiro: novo, palavras: contarPalavras(narracaoCinema(novo)) };
  } catch (e) {
    console.error(`Erro ao ajustar o tamanho do cinema (tentativa ${tentativa}):`, e);
  }
  return { ok: false as const, erro: "Não consegui ajustar o tamanho da fala agora." };
}

// ---------- 4. motor ----------
function coresDaMarca(primaria: string, paletaJson: string) {
  let paleta: string[] = [];
  try { paleta = (JSON.parse(paletaJson || "[]") as unknown[]).map(String).filter((c) => /^#[0-9a-f]{6}$/i.test(c)); } catch {}
  const p = /^#[0-9a-f]{6}$/i.test(primaria) ? primaria : "#2D6BFF";
  const secundaria = paleta.find((c) => c.toLowerCase() !== p.toLowerCase()) || "#FF4D4D";
  return { primaria: p, secundaria, destaque: "#FFC83D" };
}

export async function montarVideoCinema(videoId: string) {
  const c = await carregar(videoId);
  if (!c.ok) return c;
  const { v } = c;
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "Já estou montando esse vídeo — aguarde um pouquinho." };
  const roteiro = lerRoteiroCinema(v.colagemRoteiro);
  if (!roteiro) return { ok: false as const, erro: "Peça o roteiro pra Bia primeiro." };
  if (!v.narracaoUrl.startsWith("http") || !temTemposCinema(roteiro)) return { ok: false as const, erro: "Gere a voz antes de montar o vídeo." };

  // LGPD: só fotos desta marca, soltas ou de festa autorizada.
  const ids = [...new Set(roteiro.cenas.map((x) => x.foto || "").filter(Boolean))];
  const imgs = await prisma.imagemMarca.findMany({
    where: { id: { in: ids }, marcaId: v.marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] },
    select: { id: true, url: true },
  });
  if (imgs.length !== ids.length) return { ok: false as const, erro: "Alguma foto do roteiro não está mais disponível — troque a foto ou peça um roteiro novo." };

  const ultima = roteiro.cenas[roteiro.cenas.length - 1];
  const duracao = Math.min(70, Math.max(ultima.fim || 0, (ultima.palavras?.[ultima.palavras.length - 1]?.e || 0) + 1.5));
  const antigo = v.videoUrl;
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: "gerando" } });
  const r = await dispararMotorCinema({
    props: {
      cenas: roteiro.cenas.map((x) => ({ tipo: x.tipo, inicio: x.inicio, fim: x.fim, foto: x.foto, dados: x.dados, palavras: x.palavras })),
      duracao,
      fotos: Object.fromEntries(imgs.map((i) => [i.id, i.url])),
      logoUrl: v.marca.logoUrl || undefined,
      nomeMarca: v.marca.nome,
      cores: coresDaMarca(v.marca.corPrimaria, v.marca.paleta),
    },
    audioUrl: v.narracaoUrl,
    nomeArquivo: `${v.marca.slug || "reels"}-cinema`,
    ref: videoId,
    callbackUrl: process.env.VIDEO_CALLBACK_URL || `${baseUrl()}/api/video-pronto`,
    callbackToken: process.env.VIDEO_CALLBACK_SECRET || "",
  });
  if (!r.ok) {
    await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: antigo } });
    return { ok: false as const, erro: r.erro };
  }
  await prisma.imagemMarca.updateMany({ where: { id: { in: ids } }, data: { usos: { increment: 1 } } }).catch(() => {});
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}
