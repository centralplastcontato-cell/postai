"use server";

// VÍDEO TEMÁTICO do buffet — Reels institucional SEM festa: montado com fotos do ACERVO
// (ImagemMarca) sobre um tema ("Brinquedos", "Nosso espaço", "Decorações de festa"...).
// Espelha o fluxo do vídeo de festa (app/actions/festas.ts), com 3 diferenças:
//  - as fotos vêm do acervo inteiro (só as divulgáveis) e a IA SUGERE a seleção pelo tema
//    (o dono ajusta no seletor);
//  - o texto da capa é o próprio tema (não "Fulano fez X aninhos");
//  - é EVERGREEN: o mesmo vídeo é repostado várias vezes, então o MP4 NUNCA é apagado
//    enquanto houver Reels (agendado ou postado) apontando pra ele — e o cron não arquiva
//    (o vínculo é a coluna Publicacao.videoTematicoId, não um prefixo de slug).

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { guardaMarca } from "@/lib/acesso";
import { dispararMotorReels } from "@/lib/video-engine";
import { musicaBuffet } from "@/lib/musica-buffet";
import { baseUrl } from "@/lib/config";
import { fotosDivulgaveis, type FotoDivulgavel } from "@/lib/fotos-divulgaveis";
import { ranquearPorTema } from "@/lib/selecao-fotos";

const MOLDURAS = ["nenhuma", "branca", "grossa", "marca"];
const MAX_FOTOS = 30; // teto do motor (mesmo do vídeo de festa)
const FOTOS_SUGERIDAS = 26; // ~65s de vídeo

function lerIds(json: string): string[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Apaga o MP4 do Blob — MAS só se nenhum Reels (agendado ou postado) ainda apontar pra ele.
// Evergreen: o dono agenda vários reposts do mesmo vídeo; apagar o arquivo por baixo faria o
// piloto tentar postar uma URL morta (e um post que falha trava a fila de Reels da marca).
async function apagarMp4SeOrfao(videoId: string, url: string) {
  if (!url.startsWith("http")) return;
  const emUso = await prisma.publicacao.count({ where: { videoTematicoId: videoId, videoUrl: url } }).catch(() => 1);
  if (emUso > 0) return; // ainda tem post usando esse arquivo — não apaga
  import("@vercel/blob").then(({ del }) => del(url)).catch(() => {});
}

// Ordena as fotos do acervo pelo TEMA. Duas etapas:
//  1) CAÇA no acervo INTEIRO as fotos cuja DESCRIÇÃO fala do assunto (ranquearPorTema) — sem
//     isso, a IA recebia um cardápio de rodízio e um vídeo de "Brinquedos" vinha só com bolo
//     e família posando (2/3 do acervo é foto de festa);
//  2) a IA escolhe e ORDENA entre essas candidatas (prioriza ambiente/decoração/brinquedos,
//     evita retrato/close). Por fim, espalha entre festas (máx 2 da mesma).
// Devolve os IDs na ordem sugerida (até `n`).
const CANDIDATAS_IA = 60; // quantas o ranking entrega pra IA escolher

async function sugerirFotosTema(marcaId: string, tema: string, n: number): Promise<string[]> {
  const acervo = await fotosDivulgaveis(marcaId, { comDescricao: true, limite: 1000 });
  if (!acervo.length) return [];
  // Do tema primeiro; se o tema for raro no acervo, completa com o rodízio (nunca fica sem foto).
  const { fotos: doTema } = ranquearPorTema(acervo, tema, Math.max(n * 2, 24));
  const cands = doTema.slice(0, CANDIDATAS_IA);
  const key = process.env.OPENAI_API_KEY;
  let prefs = cands;
  if (key && cands.length > n) {
    try {
      const lista = cands.map((c, i) => `${i + 1}. ${c.descricao}`).join("\n");
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0,
          messages: [
            { role: "system", content: "Você escolhe as fotos de um VÍDEO (Reels) institucional de um buffet de festas infantis. Responda APENAS com JSON." },
            {
              role: "user",
              content: `Tema do vídeo: "${tema.trim()}".\nFotos disponíveis:\n${lista}\n\nEscolha até ${n} fotos que MOSTRAM esse tema, na ORDEM em que devem aparecer no vídeo (uma narrativa gostosa de assistir):\n- a foto tem que mostrar o ASSUNTO do tema — se o tema é "Brinquedos", cada foto tem que ter brinquedo/jogo aparecendo; NÃO escolha foto só porque tem criança feliz;\n- prefira cenas do espaço/produto (ambiente, brinquedo, decoração, comida) a retrato/close de rosto e foto posada de família;\n- cada foto de uma CENA bem diferente (nunca duas parecidas em sequência);\n- se não houver ${n} fotos boas do tema, escolha MENOS — melhor um vídeo curto e certeiro que um cheio de foto que não tem a ver.\nSem repetir. Responda só com JSON: {"fotos":[números]}`,
            },
          ],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { fotos?: number[] };
        const vistos = new Set<number>();
        const porIA: FotoDivulgavel[] = [];
        for (const x of j.fotos ?? []) {
          if (!Number.isInteger(x) || x < 1 || x > cands.length || vistos.has(x)) continue;
          vistos.add(x);
          porIA.push(cands[x - 1]);
        }
        // A IA pode escolher MENOS que n (tema com poucas fotos boas) — e deve mesmo: melhor
        // vídeo curto e certeiro. Só usamos o que ela escolheu (não completamos com sobra).
        if (porIA.length) prefs = porIA;
      }
    } catch (e) {
      console.error("Erro ao sugerir fotos do vídeo temático:", e);
    }
  }
  // Espalha entre festas: 1º uma foto por festa, depois admite 2, e só libera o teto se o
  // acervo for pequeno — vídeo com tudo da mesma festa parece álbum de família, não venda.
  const limite = Math.min(n, prefs.length);
  const escolhidas: FotoDivulgavel[] = [];
  const jaEscolhida = new Set<string>();
  const porFesta = new Map<string, number>();
  for (const teto of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const c of prefs) {
      if (escolhidas.length >= limite) break;
      if (jaEscolhida.has(c.id)) continue;
      if (c.festaId && (porFesta.get(c.festaId) ?? 0) >= teto) continue;
      escolhidas.push(c);
      jaEscolhida.add(c.id);
      if (c.festaId) porFesta.set(c.festaId, (porFesta.get(c.festaId) ?? 0) + 1);
    }
    if (escolhidas.length >= limite) break;
  }
  return escolhidas.map((c) => c.id);
}

// Cria o vídeo temático JÁ com a sugestão de fotos da IA (o dono ajusta no seletor).
export async function criarVideoTematico(marcaId: string, titulo: string) {
  const g = await guardaMarca(marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const tema = (titulo || "").trim().slice(0, 40);
  if (tema.length < 3) return { ok: false as const, erro: "Dê um nome pro tema do vídeo (ex: Brinquedos)." };
  const fotos = await sugerirFotosTema(marcaId, tema, FOTOS_SUGERIDAS);
  const v = await prisma.videoTematico.create({ data: { marcaId, titulo: tema, videoFotos: JSON.stringify(fotos) } });
  revalidatePath(`/painel/marcas/${marcaId}`);
  return { ok: true as const, id: v.id, sugeridas: fotos.length };
}

// Fotos pro SELETOR do vídeo temático: o acervo divulgável (as sugeridas/escolhidas PRIMEIRO)
// — garantindo que as já escolhidas apareçam mesmo se saírem da janela do rodízio (acervo
// grande), senão salvar de novo as apagaria da sequência sem avisar.
export async function fotosDoVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, videoFotos: true, videoCapa: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };

  const acervo = await fotosDivulgaveis(v.marcaId, { limite: 400 });
  const ids = lerIds(v.videoFotos);
  const alvo = new Set(v.videoCapa ? [...ids, v.videoCapa] : ids);
  const presentes = new Set(acervo.map((f) => f.id));
  const faltantes = [...alvo].filter((id) => !presentes.has(id));
  // As escolhidas que ficaram fora da janela do acervo (banco grande) voltam pra lista — mas
  // só se AINDA forem divulgáveis (uma festa pode ter perdido a autorização depois).
  if (faltantes.length) {
    const [extras, festasOk] = await Promise.all([
      prisma.imagemMarca.findMany({
        where: { marcaId: v.marcaId, id: { in: faltantes } },
        select: { id: true, url: true, categoria: true, descricao: true, festaId: true, usos: true },
      }),
      prisma.festa.findMany({ where: { marcaId: v.marcaId, autorizacao: "autorizada" }, select: { id: true } }),
    ]);
    const ok = new Set(festasOk.map((f) => f.id));
    acervo.push(...extras.filter((e) => !e.festaId || ok.has(e.festaId)));
  }
  const porId = new Map(acervo.map((f) => [f.id, f]));
  const escolhidas = ids.map((id) => porId.get(id)).filter((f): f is FotoDivulgavel => !!f);
  const escolhidasIds = new Set(escolhidas.map((f) => f.id));
  const resto = acervo.filter((f) => !escolhidasIds.has(f.id));
  return {
    ok: true as const,
    // ordem: as da sequência primeiro (o seletor mantém a ordem salva), depois o resto
    fotos: [...escolhidas, ...resto].map((f) => ({ id: f.id, url: f.url, momento: f.categoria, descricao: f.descricao })),
  };
}

export async function excluirVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, videoUrl: true, titulo: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  // Enquanto o motor monta, excluir deixaria o MP4 órfão no Blob (o callback não acha o id).
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "Esse vídeo está sendo montado agora — espere terminar pra excluir." };
  // Reels AGENDADO usando esse vídeo: excluir mataria o post (URL morta). Avisa o dono.
  const agendados = await prisma.publicacao.count({ where: { videoTematicoId: videoId, status: "a_postar" } });
  if (agendados > 0) return { ok: false as const, erro: `Esse vídeo tem ${agendados} Reels agendado${agendados > 1 ? "s" : ""}. Cancele o agendamento (aba 🎬 Reels) antes de excluir.` };

  const url = v.videoUrl;
  await prisma.videoTematico.delete({ where: { id: videoId } }); // Publicacao.videoTematicoId vira null (SetNull)
  // Só apaga o MP4 se nenhum Reels POSTADO ainda o mostra no painel (o cron não arquiva temático).
  if (url.startsWith("http")) {
    const postados = await prisma.publicacao.count({ where: { videoUrl: url, status: "postado" } }).catch(() => 1);
    if (postados === 0) import("@vercel/blob").then(({ del }) => del(url)).catch(() => {});
  }
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}

// Salva a SELEÇÃO ordenada de fotos do vídeo temático (máx 30). Só aceita fotos da MARCA que
// podem ser divulgadas (LGPD) — festa pendente/negada nunca entra em vídeo público.
export async function salvarFotosVideoTematico(videoId: string, fotoIds: string[], capa?: string, moldura?: string, textoFinal?: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };

  // Valida contra o acervo divulgável — a CAPA pode ser uma foto fora da sequência (o seletor
  // permite estrelar qualquer foto), igual no vídeo de festa.
  const candidatos = capa ? [...fotoIds, capa] : fotoIds;
  const [imgs, festasOk] = await Promise.all([
    prisma.imagemMarca.findMany({ where: { marcaId: v.marcaId, id: { in: candidatos } }, select: { id: true, festaId: true } }),
    prisma.festa.findMany({ where: { marcaId: v.marcaId, autorizacao: "autorizada" }, select: { id: true } }),
  ]);
  const okFesta = new Set(festasOk.map((f) => f.id));
  const set = new Set(imgs.filter((i) => !i.festaId || okFesta.has(i.festaId)).map((i) => i.id));

  const ordenadas = fotoIds.filter((id) => set.has(id)).slice(0, MAX_FOTOS);
  const data: { videoFotos: string; videoCapa?: string; videoMoldura?: string; videoTextoFinal?: string } = { videoFotos: JSON.stringify(ordenadas) };
  if (capa !== undefined) data.videoCapa = capa === "" || set.has(capa) ? capa : "";
  if (moldura !== undefined) data.videoMoldura = MOLDURAS.includes(moldura) ? moldura : "branca";
  if (textoFinal !== undefined) data.videoTextoFinal = textoFinal.trim().slice(0, 60);
  await prisma.videoTematico.update({ where: { id: videoId }, data });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, total: ordenadas.length };
}

// Dispara o MOTOR pra montar o vídeo temático (mesmo motor do Reels de festa). O texto da capa
// é o TEMA. O callback /api/video-pronto reconhece o id e salva a URL aqui.
export async function gerarVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { logoUrl: true, slug: true, corPrimaria: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "Já estou gerando esse vídeo — aguarde um pouquinho." };
  if (!v.marca.logoUrl) return { ok: false as const, erro: "A marca precisa de um logo pra montar o vídeo." };

  const ids = lerIds(v.videoFotos);
  if (!ids.length) return { ok: false as const, erro: "Escolha as fotos do vídeo primeiro." };
  const alvo = v.videoCapa ? [...ids, v.videoCapa] : ids;
  const [imgs, festasOk] = await Promise.all([
    prisma.imagemMarca.findMany({ where: { marcaId: v.marcaId, id: { in: alvo } }, select: { id: true, url: true, festaId: true } }),
    prisma.festa.findMany({ where: { marcaId: v.marcaId, autorizacao: "autorizada" }, select: { id: true } }),
  ]);
  const okFesta = new Set(festasOk.map((f) => f.id));
  const mapa = new Map(imgs.filter((i) => !i.festaId || okFesta.has(i.festaId)).map((i) => [i.id, i.url]));
  let fotos = ids.map((id) => mapa.get(id)).filter((u): u is string => !!u);
  if (!fotos.length) return { ok: false as const, erro: "As fotos escolhidas não estão mais disponíveis — escolha de novo." };

  const capaUrl = (v.videoCapa && mapa.get(v.videoCapa)) || fotos[0];
  const semCapa = fotos.filter((u) => u !== capaUrl);
  if (semCapa.length > 0) fotos = semCapa;

  const antigo = v.videoUrl; // guardado ANTES do lock (só apagamos depois, e se ninguém usar)
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: "gerando" } });
  // Rodízio: marca as fotos como USADAS (o ranking desconta por uso, então o PRÓXIMO vídeo
  // do mesmo tema traz cenas diferentes em vez de repetir exatamente as mesmas).
  const usadas = ids.filter((id) => mapa.has(id));
  if (usadas.length) await prisma.imagemMarca.updateMany({ where: { id: { in: usadas } }, data: { usos: { increment: 1 } } }).catch(() => {});
  const r = await dispararMotorReels({
    fotos,
    capaUrl,
    moldura: v.videoMoldura || "branca",
    corMoldura: v.marca.corPrimaria || "#FFFFFF",
    logoUrl: v.marca.logoUrl,
    musicaUrl: musicaBuffet(v.marca.slug) || undefined,
    textoCapa: v.titulo,
    nomeArquivo: `${v.marca.slug || "reels"}-tema`,
    ...(v.videoTextoFinal?.trim() ? { tituloFinal: v.videoTextoFinal.trim(), subFinal: "" } : {}),
    // O motor só ECOA esse id no callback — mandamos o id do vídeo temático e o
    // /api/video-pronto descobre sozinho se é de festa ou temático.
    festaId: videoId,
    callbackUrl: process.env.VIDEO_CALLBACK_URL || `${baseUrl()}/api/video-pronto`,
    callbackToken: process.env.VIDEO_CALLBACK_SECRET || "",
  });
  if (!r.ok) {
    await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: antigo } }); // devolve o vídeo que existia
    return { ok: false as const, erro: r.erro };
  }
  // Vídeo NOVO a caminho → apaga o antigo do Blob, MAS só se nenhum Reels ainda o usa
  // (evergreen: pode haver repost agendado apontando pro arquivo atual).
  await apagarMp4SeOrfao(videoId, antigo);
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}

// A Bia escreve a frase de ENCERRAMENTO do vídeo temático (último quadro, até ~48 letras).
export async function gerarTextoFinalVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, include: { marca: { select: { nome: true } } } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const fallback = "Vem viver isso com a gente!";
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: true as const, texto: fallback };
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        temperature: 0.9,
        max_tokens: 40,
        messages: [
          { role: "system", content: `Você escreve UMA frase curtinha (máx 48 caracteres) de encerramento pra um vídeo do buffet infantil "${v.marca.nome}" sobre "${v.titulo}". Convite caloroso pro pai/mãe, sem aspas, sem emoji.` },
          { role: "user", content: "Escreva a frase." },
        ],
      }),
    });
    if (!resp.ok) return { ok: true as const, texto: fallback };
    const data = await resp.json();
    const texto = String(data?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 48);
    return { ok: true as const, texto: texto || fallback };
  } catch {
    return { ok: true as const, texto: fallback };
  }
}

// Legenda do Reels temático (institucional — sem aniversariante). Usada no agendar e no botão da Bia.
async function legendaReelsTematicoIA(tema: string, buffet: string): Promise<string> {
  const hashTema = tema.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const fallback = `✨ ${tema} é aqui no ${buffet}! 🎉 Dá o play e vem conhecer de pertinho o que preparamos pra festa do seu filho ser inesquecível 💛\n\nChama a gente e agende uma visita! 🥳\n\n#festainfantil #buffetinfantil${hashTema ? ` #${hashTema}` : ""}`;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;
  const sistema = `Você é a social media de um buffet infantil chamado "${buffet}". Escreva a LEGENDA de um Reels institucional que mostra "${tema}" do buffet. Regras:
- Tom caloroso e brasileiro; fale COM o pai/mãe ("seu filho", "sua festa").
- Frase de abertura com impacto; venda o BENEFÍCIO (diversão segura, memórias, festa sem trabalho).
- Use de 3 a 5 emojis no total.
- Termine com convite pra conhecer/agendar visita.
- 3 a 5 hashtags no final. Máximo de 600 caracteres. Sem aspas. Não invente preço nem data.`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", temperature: 0.8, max_tokens: 350, messages: [{ role: "system", content: sistema }, { role: "user", content: `Vídeo sobre: ${tema}.` }] }),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? String(content).trim() : fallback;
  } catch {
    return fallback;
  }
}

// Botão "✨ Escrever com a Bia" do agendador de Reels temático.
export async function gerarLegendaReelsTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, include: { marca: { select: { nome: true } } } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const legenda = await legendaReelsTematicoIA(v.titulo, v.marca.nome);
  return { ok: true as const, legenda };
}

// AGENDA o Reels temático: cria a Publicacao formato="reels" pro piloto postar. Pode ser
// chamado quantas vezes quiser (evergreen: reposta o MESMO vídeo em outras datas). O vínculo
// videoTematicoId é o que protege o MP4 do arquivamento e da exclusão.
export async function agendarReelsTematico(videoId: string, dataYMD: string, legendaManual?: string, horaSel?: number) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { nome: true, horaPost: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!v.videoUrl.startsWith("http")) return { ok: false as const, erro: "Esse vídeo ainda não foi gerado." };

  const horaFinal = typeof horaSel === "number" && horaSel >= 0 && horaSel <= 23 ? horaSel : (v.marca.horaPost ?? 10);
  const hh = String(horaFinal).padStart(2, "0");
  const data = new Date(`${dataYMD}T${hh}:00:00-03:00`); // BRT
  if (isNaN(data.getTime())) return { ok: false as const, erro: "Data inválida." };

  const legenda = (legendaManual && legendaManual.trim()) || (await legendaReelsTematicoIA(v.titulo, v.marca.nome));
  const slug = `reels-tema-${videoId.slice(-6)}-${randomBytes(3).toString("hex")}`;
  const pub = await prisma.publicacao.create({
    data: {
      marcaId: v.marcaId,
      slug,
      data,
      template: "divulgacao",
      titulo: `Reels — ${v.titulo}`,
      legenda,
      formato: "reels",
      videoUrl: v.videoUrl,
      videoTematicoId: videoId,
      categoria: "espaco",
      status: "a_postar",
      aprovado: false,
    },
  });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, id: pub.id };
}
