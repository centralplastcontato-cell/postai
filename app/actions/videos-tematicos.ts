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
import { gerarNarracaoMp3 } from "@/lib/narracao";
import { vozValida, VOZ_PADRAO, fotosParaDuracao } from "@/lib/vozes";

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

// Hash curto do conteúdo → entra no ?v= das URLs dos quadros. Muda quando a legenda/foto muda,
// então o motor (e o CDN) buscam a arte NOVA em vez de servir a antiga do cache.
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, videoUrl: true, titulo: true, narracaoUrl: true } });
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
  // A NARRAÇÃO some junto — sem o vídeo, ninguém mais acha esse MP3 (o Blob tem limite).
  if (v.narracaoUrl.startsWith("http")) import("@vercel/blob").then(({ del }) => del(v.narracaoUrl)).catch(() => {});
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}

// Salva a SELEÇÃO ordenada de fotos do vídeo temático (máx 30). Só aceita fotos da MARCA que
// podem ser divulgadas (LGPD) — festa pendente/negada nunca entra em vídeo público.
export async function salvarFotosVideoTematico(videoId: string, fotoIds: string[], capa?: string, moldura?: string, textoFinal?: string, textos?: Record<string, string>, musica?: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, videoCapa: true } });
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
  const data: { videoFotos: string; videoCapa?: string; videoMoldura?: string; videoTextoFinal?: string; videoTextos?: string; videoMusica?: string } = { videoFotos: JSON.stringify(ordenadas) };
  if (capa !== undefined) data.videoCapa = capa === "" || set.has(capa) ? capa : "";
  if (moldura !== undefined) data.videoMoldura = MOLDURAS.includes(moldura) ? moldura : "branca";
  if (textoFinal !== undefined) data.videoTextoFinal = textoFinal.trim().slice(0, 60);
  // música escolhida: "" = jingle do buffet; senão só aceita URL http (do nosso upload)
  if (musica !== undefined) data.videoMusica = musica.startsWith("http") ? musica : "";
  // LEGENDAS vêm junto (o seletor manda o que está na tela): assim uma frase digitada e o clique
  // direto em "Gerar" não se perdem — e legenda de foto que saiu da sequência é podada.
  // A CAPA entra na lista mesmo se a foto dela estiver fora da sequência (dá pra estrelar uma
  // foto do acervo): a frase dela é o gancho que abre o vídeo e não pode se perder.
  if (textos) {
    const capaFinal = data.videoCapa !== undefined ? data.videoCapa : v.videoCapa;
    const chaves = capaFinal ? [...ordenadas, capaFinal] : ordenadas;
    const limpo: Record<string, string> = {};
    for (const id of new Set(chaves)) {
      const f = (textos[id] || "").trim().slice(0, 80);
      if (f) limpo[id] = f;
    }
    data.videoTextos = JSON.stringify(limpo);
  }
  await prisma.videoTematico.update({ where: { id: videoId }, data });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, total: ordenadas.length };
}

// --- Biblioteca de músicas da marca, no contexto do vídeo do BUFFET (mesma lib compartilhada) ---
// wav = versão 24kHz mono (preparada no navegador) que a NARRAÇÃO usa como fundo sob a voz.
type MusicaBanco = { url: string; nome: string; wav?: string };
function lerMusicas(json: string | null): MusicaBanco[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((m): m is MusicaBanco => !!m && typeof m.url === "string" && m.url.startsWith("http")) : [];
  } catch { return []; }
}
// Lista as trilhas da marca + o link do jingle do buffet (recebe o videoId só pra achar a marca).
export async function listarMusicasDaMarcaTema(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado.", musicas: [] as MusicaBanco[], buffetUrl: "" };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro, musicas: [] as MusicaBanco[], buffetUrl: "" };
  const marca = await prisma.marca.findUnique({ where: { id: v.marcaId }, select: { musicas: true, slug: true } });
  return { ok: true as const, musicas: lerMusicas(marca?.musicas ?? "[]"), buffetUrl: musicaBuffet(marca?.slug ?? "") || "" };
}
// Adiciona uma trilha recém-enviada à biblioteca da marca (dedup por URL; mantém as últimas 40).
export async function adicionarMusicaAoBancoTema(videoId: string, url: string, nome: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado.", musicas: [] as MusicaBanco[] };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro, musicas: [] as MusicaBanco[] };
  if (!url.startsWith("http")) return { ok: false as const, erro: "URL inválida.", musicas: [] as MusicaBanco[] };
  const marca = await prisma.marca.findUnique({ where: { id: v.marcaId }, select: { musicas: true } });
  const atuais = lerMusicas(marca?.musicas ?? "[]").filter((m) => m.url !== url);
  const lista = [{ url, nome: (nome || "música").slice(0, 80) }, ...atuais].slice(0, 40);
  await prisma.marca.update({ where: { id: v.marcaId }, data: { musicas: JSON.stringify(lista) } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, musicas: lista };
}

// Guarda o WAV (24kHz mono, preparado no navegador) de uma trilha da biblioteca — pra ela poder
// entrar como fundo da NARRAÇÃO (sob a voz). Casa pela URL do MP3.
export async function definirWavMusicaTema(videoId: string, url: string, wav: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (!url.startsWith("http") || !wav.startsWith("http")) return { ok: false as const, erro: "URL inválida." };
  const marca = await prisma.marca.findUnique({ where: { id: v.marcaId }, select: { musicas: true } });
  const lista = lerMusicas(marca?.musicas ?? "[]").map((m) => (m.url === url ? { ...m, wav } : m));
  await prisma.marca.update({ where: { id: v.marcaId }, data: { musicas: JSON.stringify(lista) } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, musicas: lista };
}

// Fundo dos quadros do vídeo do buffet: "" (foto BORRADA de fundo, padrão) | "cheia" (a foto
// PREENCHE a tela, sem moldura). Muda como o /api/quadro-tema desenha cada quadro.
export async function definirFundoVideo(videoId: string, fundo: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const valor = fundo === "cheia" ? "cheia" : fundo === "cor" ? "cor" : ""; // borrada (padrão) | cheia | cor
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoFundo: valor } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, fundo: valor };
}

// Cor do fundo "cor" (degradê): guarda um hex (#RRGGBB). "" volta pra cor da marca.
export async function definirFundoCorVideo(videoId: string, cor: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const valor = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toUpperCase() : ""; // só aceita hex válido; senão volta pra cor da marca
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoFundoCor: valor } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, cor: valor };
}

// Cor da MOLDURA "Cor" (a borda da foto): guarda um hex (#RRGGBB). "" volta pra cor da marca.
export async function definirMolduraCorVideo(videoId: string, cor: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const valor = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toUpperCase() : "";
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoMolduraCor: valor } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, cor: valor };
}

// Estilo da CAPA (1º quadro) do vídeo do buffet: "" (clássica) | "impacto" (capa chamativa, tipo
// thumbnail — foto na tela toda + texto gigante com contorno). Muda como o /api/quadro-tema desenha o quadro 0.
export async function definirCapaEstilo(videoId: string, estilo: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const valor = estilo === "impacto" ? "impacto" : estilo === "ia" ? "ia" : ""; // só aceita os estilos conhecidos
  await prisma.videoTematico.update({ where: { id: videoId }, data: { capaEstilo: valor } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, estilo: valor };
}

// Gera uma ARTE de capa festiva com IA (gpt-image-1) e guarda no Blob. É um fundo decorativo
// (balões, confete, cores da marca) SEM pessoas/rostos/texto — a chamada é escrita por cima depois,
// no /api/quadro-tema. Já marca capaEstilo = "ia". Custa uns centavos e leva alguns segundos.
export async function gerarCapaIa(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, include: { marca: { select: { nome: true, corPrimaria: true } } } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  const cor = v.marca.corPrimaria || "#7C3AED";
  const tema = (v.titulo || "").trim();
  // Fundo festivo abstrato — nunca pessoas/rostos/texto (a chamada entra por cima; rosto de IA
  // ia distorcer). Espaço livre embaixo pra o título. Vertical 9:16.
  const prompt = `Arte de CAPA vertical estilo THUMBNAIL de YouTube, MUITO chamativa e clickbait, pra um vídeo de rede social de um buffet infantil chamado "${v.marca.nome}"${tema ? `, no clima de "${tema}"` : ""}. Cores SUPER saturadas e alto contraste, energia explosiva de festa: balões, confete, brilhos, estrelas, raios de luz e formas divertidas, com destaque forte para a cor ${cor}. Composição ousada, iluminação dramática. Deixe um GRANDE espaço mais escuro/limpo na parte de BAIXO (uns 40% da altura) pra escrever um título GIGANTE depois. NÃO desenhe pessoas, rostos, crianças, texto, letras, números nem logotipos — apenas a arte de fundo. Formato vertical 9:16.`;
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1536" }),
    });
    if (!resp.ok) return { ok: false as const, erro: `A IA não respondeu agora (${resp.status}). Tente de novo.` };
    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { ok: false as const, erro: "A IA não devolveu a imagem. Tente de novo." };
    const { put } = await import("@vercel/blob");
    const blob = await put(`${v.marcaId}/capa-ia-${videoId}-${Date.now()}.png`, Buffer.from(b64, "base64"), { access: "public", contentType: "image/png" });
    const antigo = v.capaIaUrl;
    await prisma.videoTematico.update({ where: { id: videoId }, data: { capaIaUrl: blob.url, capaEstilo: "ia" } });
    if (antigo && antigo.startsWith("http")) import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    return { ok: true as const, url: blob.url };
  } catch (e) {
    console.error("Erro ao gerar capa IA:", e);
    return { ok: false as const, erro: "Não consegui gerar a capa agora. Tente de novo." };
  }
}

// Renomeia o vídeo do buffet (o "titulo" — ex: "Promo agosto 02"). É o nome interno pra organizar.
export async function renomearVideoTematico(videoId: string, titulo: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const t = (titulo || "").trim().slice(0, 80);
  if (t.length < 2) return { ok: false as const, erro: "Dê um nome com pelo menos 2 letras." };
  await prisma.videoTematico.update({ where: { id: videoId }, data: { titulo: t } });
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const, titulo: t };
}

// Dispara o MOTOR pra montar o vídeo temático (mesmo motor do Reels de festa). O texto da capa
// é o TEMA. O callback /api/video-pronto reconhece o id e salva a URL aqui.
export async function gerarVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { logoUrl: true, slug: true, corPrimaria: true, corFundo: true, site: true } } },
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

  // COM LEGENDA (a copy da Bia): cada quadro do slideshow vira uma ARTE nossa (/api/quadro-tema)
  // — foto emoldurada sobre a cor da marca, com a frase embaixo. O motor só junta os quadros e
  // põe a música (o contrato dele não tem texto por foto), então o texto vai "queimado" na
  // imagem. A moldura vai "nenhuma" porque a arte já traz a dela.
  // SEM legenda: segue o caminho antigo (fotos cruas; o motor faz fundo borrado + moldura).
  const legendas = (() => {
    try {
      const m = JSON.parse(v.videoTextos || "{}");
      return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, string>) : {};
    } catch {
      return {} as Record<string, string>;
    }
  })();

  // COM NARRAÇÃO, é a VOZ que manda no tamanho do vídeo: o motor dá ~2,3s por foto, então o
  // vídeo usa só as fotos que cabem na locução — senão a voz acabaria e o vídeo seguiria mudo.
  const temNarracao = v.narracaoUrl.startsWith("http") && v.narracaoSeg > 0;
  const idsTodos = ids.filter((id) => mapa.has(id) && mapa.get(id) !== capaUrl);
  let idsSlideshow = idsTodos;
  if (temNarracao) {
    const cabem = fotosParaDuracao(v.narracaoSeg, MAX_FOTOS);
    // Fotos DE MENOS = a voz é cortada no meio (e o convite final nunca é ouvido). Melhor
    // recusar com uma conta clara do que entregar um vídeo com a fala truncada.
    if (idsTodos.length < cabem) {
      return {
        ok: false as const,
        erro: `A narração tem ${v.narracaoSeg}s e precisa de ${cabem} fotos — você escolheu ${idsTodos.length}. Adicione mais fotos ou peça um roteiro mais curto.`,
      };
    }
    // Fotos DE MAIS: corta — mas mantendo as que TÊM LEGENDA (a Bia espalha as frases pelo
    // vídeo; um corte cego pelas primeiras deixaria o vídeo sem texto nenhum). A ordem
    // original da sequência é preservada.
    const posicao = new Map(idsTodos.map((id, i) => [id, i]));
    const comLegenda = idsTodos.filter((id) => (legendas[id] || "").trim());
    const semLegenda = idsTodos.filter((id) => !(legendas[id] || "").trim());
    const escolhidas = [...comLegenda.slice(0, cabem), ...semLegenda].slice(0, cabem);
    idsSlideshow = escolhidas.sort((a, b) => (posicao.get(a) ?? 0) - (posicao.get(b) ?? 0));
  }
  // Só conta legenda das fotos que ESTÃO no slideshow agora — legenda órfã (de foto que o dono
  // tirou depois, ou que virou capa) não pode fazer o vídeo inteiro trocar de estilo à toa.
  const temLegenda = idsSlideshow.some((id) => (legendas[id] || "").trim());

  // A FRASE DE CAPA (o gancho de abertura) também vira arte NOSSA: o motor escreve o texto da
  // capa numa fonte fixa, numa linha só — um gancho de verdade estourava a tela e as pontas
  // eram cortadas ("Diversão que vira lembrança pra vida" → "rsão que vira lembrança pra").
  // Desenhando aqui, a frase quebra linha e a fonte encolhe conforme o tamanho.
  const fraseCapa = (v.videoCapa && (legendas[v.videoCapa] || "").trim()) || "";

  // O motor (Cloud Run) baixa os quadros — a URL tem que ser PÚBLICA. Rodando local, o
  // baseUrl() é localhost e o motor não alcança: usamos o mesmo host do callback (produção),
  // que lê o MESMO banco e desenha o quadro igual.
  let base = baseUrl();
  try {
    if (process.env.VIDEO_CALLBACK_URL) base = new URL(process.env.VIDEO_CALLBACK_URL).origin;
  } catch {} // env torta não pode derrubar a geração
  base = base.replace(/\/$/, "");
  // O ?v= é a ÚNICA chave de cache do quadro: precisa mudar quando QUALQUER coisa desenhada
  // muda — legenda, fotos, capa, a URL de cada foto E a identidade da marca (cor/logo/site).
  // "q2" = VERSÃO do desenho do quadro (fundo virou foto BORRADA). Bumpar isso quando o visual do
  // quadro muda força a CDN a redesenhar (o ?v= só depende de dados; sem isso, serviria o antigo).
  const versao = hashCurto(
    ["q2", v.videoFundo, v.videoTextos, v.videoFotos, v.videoCapa, v.marca.corPrimaria, v.marca.corFundo, v.marca.site, v.marca.logoUrl, capaUrl, ...idsSlideshow.map((id) => mapa.get(id))].join("|"),
  );

  let fotosMotor: string[];
  if (temLegenda) {
    // O índice do quadro é a posição da foto em videoFotos (a rota lê o MESMO array).
    fotosMotor = idsSlideshow.map((id) => `${base}/api/quadro-tema/${videoId}/${ids.indexOf(id) + 1}.jpg?v=${versao}`);
  } else {
    // Sem legenda: fotos cruas (o motor faz fundo borrado + moldura). Respeita o corte da
    // narração também — a lista sai de idsSlideshow, não de todas as fotos.
    fotosMotor = idsSlideshow.map((id) => mapa.get(id)).filter((u): u is string => !!u);
    if (!fotosMotor.length) fotosMotor = fotos.filter((u) => u !== capaUrl);
  }
  if (!fotosMotor.length) return { ok: false as const, erro: "Escolha pelo menos 2 fotos pro vídeo (uma vira a capa)." };

  // Com frase de capa, a capa é a NOSSA arte (n=0). Sem frase, vai a foto crua — mas SEM texto:
  // o nome do tema ("Brinquedos") é etiqueta interna, não abertura de vídeo. Melhor capa limpa
  // do que capa com etiqueta. Por isso o motor nunca escreve nada na capa.
  const capaFinal = fraseCapa ? `${base}/api/quadro-tema/${videoId}/0.jpg?v=${versao}` : capaUrl;
  const textoDaCapa = "";

  const antigo = v.videoUrl; // guardado ANTES do lock (só apagamos depois, e se ninguém usar)
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoUrl: "gerando" } });
  // Rodízio: marca como USADAS só as fotos que REALMENTE entraram no vídeo (a narração pode
  // ter cortado as demais). Contar foto que nunca foi ao ar faria o ranking evitá-la no
  // próximo vídeo do mesmo tema — perderíamos cenas boas sem elas nunca terem aparecido.
  const usadas = [...new Set([...idsSlideshow, ...(v.videoCapa && mapa.has(v.videoCapa) ? [v.videoCapa] : [])])];
  if (usadas.length) await prisma.imagemMarca.updateMany({ where: { id: { in: usadas } }, data: { usos: { increment: 1 } } }).catch(() => {});
  const r = await dispararMotorReels({
    fotos: fotosMotor,
    capaUrl: capaFinal,
    moldura: temLegenda ? "nenhuma" : v.videoMoldura || "branca",
    corMoldura: v.marca.corPrimaria || "#FFFFFF",
    logoUrl: v.marca.logoUrl,
    // A trilha do vídeo: a NARRAÇÃO (que já vem com o jingle misturado por baixo) ou, sem
    // narração, o jingle puro. O motor só aceita uma trilha — por isso a mistura é nossa.
    // Com narração: a voz (com o jingle já misturado). Sem narração: a trilha ESCOLHIDA pelo dono
    // (videoMusica) tem prioridade; senão, o jingle do buffet.
    musicaUrl: temNarracao ? v.narracaoUrl : (v.videoMusica?.startsWith("http") ? v.videoMusica : musicaBuffet(v.marca.slug)) || undefined,
    // A arte da capa JÁ traz o texto (a nossa, que quebra linha) — o motor nunca escreve nada
    // por cima (ele usa fonte fixa, numa linha só, e cortava as pontas da frase).
    textoCapa: textoDaCapa,
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

// A Bia escreve a COPY do vídeo: uma legenda curta em algumas fotos-chave (não em todas —
// texto demais cansa), com começo-meio-fim: gancho → o que o pai/mãe ganha → convite.
// Cada frase fala do que a FOTO daquele quadro mostra (foto-primeiro, como no carrossel).
// Devolve o mapa { fotoId: frase } pra o dono revisar/editar no seletor antes de gerar.
export async function gerarTextosVideoTematico(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { nome: true, descricao: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const ids = lerIds(v.videoFotos);
  if (!ids.length) return { ok: false as const, erro: "Escolha as fotos do vídeo primeiro." };
  // Mesma trava do gerar/salvar: só fotos DESTA marca e divulgáveis (LGPD) — nem a descrição
  // de uma foto não autorizada vai pra IA, nem vira legenda no vídeo.
  const [imgs, festasOk] = await Promise.all([
    prisma.imagemMarca.findMany({ where: { marcaId: v.marcaId, id: { in: ids } }, select: { id: true, descricao: true, festaId: true } }),
    prisma.festa.findMany({ where: { marcaId: v.marcaId, autorizacao: "autorizada" }, select: { id: true } }),
  ]);
  const okFesta = new Set(festasOk.map((f) => f.id));
  const desc = new Map(imgs.filter((i) => !i.festaId || okFesta.has(i.festaId)).map((i) => [i.id, i.descricao]));
  // A capa tem a FRASE DE CAPA (o gancho que abre o vídeo) — não uma legenda de quadro.
  const capaId = v.videoCapa && desc.has(v.videoCapa) ? v.videoCapa : ids.find((id) => desc.has(id)) || "";
  const doSlideshow = ids.filter((id) => id !== capaId && desc.get(id)?.trim());
  if (!doSlideshow.length) return { ok: false as const, erro: "As fotos escolhidas ainda não têm descrição." };

  const lista = doSlideshow.map((id, i) => `${i + 1}. ${desc.get(id)}`).join("\n");
  const quantas = Math.min(8, Math.max(4, Math.round(doSlideshow.length / 3))); // ~1 a cada 3 fotos
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: `Você é a social media do buffet infantil "${v.marca.nome}". ${v.marca.descricao || ""}
Você escreve a COPY de um Reels sobre "${v.titulo}" — frases curtas que aparecem POR CIMA das fotos.
REGRAS:
- Fale COM o pai/mãe que decide a festa ("seu filho", "sua festa"), vendendo o BENEFÍCIO (diversão segura, memórias, festa sem trabalho pra você) — não descreva a foto ("Mesa decorada") nem rotule ("Brinquedos", "Nosso espaço").
- Cada frase nasce da FOTO daquele quadro: fale do que ela mostra, conectando com o benefício.
- Frases CURTAS: 3 a 8 palavras. Nada de ponto final em todas; pode usar "!" com moderação. No máximo 1 emoji no vídeo inteiro.
- A copy tem ARCO: a CAPA é o gancho que segura o dedo, as do meio entregam o que a família ganha, a última é um convite.
- A marca É o lugar da festa: nunca mande "procurar um local".`,
          },
          {
            role: "user",
            content: `Fotos do vídeo, na ordem em que aparecem:\n${lista}\n\n1) Escreva a FRASE DE CAPA: é o primeiro texto que a pessoa lê, sobre a foto de abertura — um GANCHO que faz parar de rolar o feed (até 6 palavras, até 40 caracteres). NUNCA use o nome do tema como capa ("Brinquedos", "Nosso espaço") — isso é etiqueta, não gancho.\n2) Escolha ${quantas} fotos-chave (bem espalhadas, nunca duas seguidas) e escreva a frase de cada uma. As outras fotos passam sem texto.\nResponda só com JSON: {"capa":"...","legendas":[{"foto":número,"frase":"..."}]}`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { capa?: string; legendas?: { foto?: number; frase?: string }[] };
    const mapa: Record<string, string> = {};
    // Frase de CAPA (o gancho que abre o vídeo) — guardada na chave da foto de capa. Curta:
    // o motor escreve ela sobre a foto de abertura e frase longa não caberia.
    const capa = (j.capa || "").trim().slice(0, 48);
    if (capaId && capa) mapa[capaId] = capa;
    for (const item of j.legendas ?? []) {
      const i = Number(item?.foto);
      const frase = (item?.frase || "").trim().slice(0, 80);
      if (!Number.isInteger(i) || i < 1 || i > doSlideshow.length || !frase) continue;
      mapa[doSlideshow[i - 1]] = frase;
    }
    if (!Object.keys(mapa).length) throw new Error("A IA não devolveu legendas.");
    await prisma.videoTematico.update({ where: { id: videoId }, data: { videoTextos: JSON.stringify(mapa) } });
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    return { ok: true as const, textos: mapa, quantas: Object.keys(mapa).length, capa: capa || null };
  } catch (e) {
    console.error("Erro ao escrever a copy do vídeo:", e);
    return { ok: false as const, erro: "Não consegui escrever a copy agora." };
  }
}

// A Bia escreve (ou REESCREVE) a legenda de UMA foto só — o botão ✨ ao lado do campo dela.
// Serve pras fotos que ficaram "sem legenda" e pra trocar uma frase que não agradou: a Bia
// olha a descrição DAQUELA foto e vê as frases das outras, pra não repetir ideia.
// Na foto de CAPA, ela escreve o GANCHO de abertura (mais curto).
export async function gerarLegendaUmaFotoVideo(videoId: string, fotoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { nome: true, descricao: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  // LGPD + marca: só foto desta marca e divulgável.
  const img = await prisma.imagemMarca.findFirst({
    where: { id: fotoId, marcaId: v.marcaId, OR: [{ festaId: null }, { festa: { autorizacao: "autorizada" } }] },
    select: { descricao: true },
  });
  if (!img?.descricao?.trim()) return { ok: false as const, erro: "Essa foto ainda não tem descrição — a Bia precisa dela pra escrever." };

  let mapa: Record<string, string> = {};
  try {
    const m = JSON.parse(v.videoTextos || "{}");
    if (m && typeof m === "object" && !Array.isArray(m)) mapa = m as Record<string, string>;
  } catch {}
  const ehCapa = v.videoCapa === fotoId;
  const outras = Object.entries(mapa)
    .filter(([id, f]) => id !== fotoId && (f || "").trim())
    .map(([, f]) => `"${f}"`)
    .join("; ");
  const atual = (mapa[fotoId] || "").trim();

  const limite = ehCapa ? 48 : 80;
  const pedido = ehCapa
    ? `A FOTO DE CAPA mostra: "${img.descricao}".\nEscreva a FRASE DE ABERTURA do vídeo: o gancho que faz o pai/mãe parar de rolar o feed. Até 6 palavras (máx ${limite} caracteres). NUNCA use o nome do tema ("${v.titulo}") — isso é etiqueta, não gancho.`
    : `A FOTO deste quadro mostra: "${img.descricao}".\nEscreva a legenda que aparece embaixo dela no vídeo: 3 a 8 palavras, vendendo o BENEFÍCIO que essa cena comprova pro pai/mãe (máx ${limite} caracteres).`;
  const contexto = outras ? `\n\nJá existem estas frases no vídeo — NÃO repita a ideia nem as palavras delas: ${outras}.` : "";
  const trocar = atual ? `\n\nA frase atual desta foto é "${atual}" — escreva uma DIFERENTE, com outro ângulo.` : "";

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        temperature: 0.95, // alta: clicar de novo tem que trazer uma opção NOVA
        messages: [
          {
            role: "system",
            content: `Você é a social media do buffet infantil "${v.marca.nome}". ${v.marca.descricao || ""}
O vídeo é um Reels sobre "${v.titulo}". Você escreve UMA frase curta que aparece por cima de uma foto.
REGRAS: fale COM o pai/mãe que decide a festa ("seu filho", "sua festa") vendendo o BENEFÍCIO (diversão segura, memórias, festa sem trabalho pra você); a frase NASCE da foto (fale do que ela mostra), mas NUNCA descreva a foto ("Mesa decorada") nem rotule ("Brinquedos"). Sem ponto final obrigatório; no máximo 1 emoji. A marca É o lugar da festa — nunca mande procurar local.`,
          },
          { role: "user", content: `${pedido}${contexto}${trocar}\n\nResponda só com JSON: {"frase":"..."}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { frase?: string };
    const frase = (j.frase || "").trim().replace(/^["']|["']$/g, "").slice(0, limite);
    if (!frase) throw new Error("A IA não devolveu frase.");
    mapa[fotoId] = frase;
    await prisma.videoTematico.update({ where: { id: videoId }, data: { videoTextos: JSON.stringify(mapa) } });
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    return { ok: true as const, frase, ehCapa };
  } catch (e) {
    console.error("Erro ao escrever a legenda da foto:", e);
    return { ok: false as const, erro: "Não consegui escrever agora." };
  }
}

// ---- NARRAÇÃO (a voz que fala no vídeo) ----

// A Bia escreve o ROTEIRO da locução a partir do BRIEFING do dono ("quero anunciar a promoção
// de julho, 10 pessoas grátis até dia 20"). Texto pra ser FALADO — frases curtas, respiro,
// jeito de gente. Devolve o roteiro pro dono revisar antes de virar voz.
export async function gerarRoteiroNarracao(videoId: string, briefing: string, segundosAlvo = 25) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { nome: true, descricao: true, telefone: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };

  const b = (briefing || "").trim();
  // ~2,6 palavras por segundo de locução (medido nas vozes do Google a 1.08x).
  const palavras = Math.max(30, Math.round(segundosAlvo * 2.6));
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `Você escreve o ROTEIRO DA LOCUÇÃO de um vídeo do buffet infantil "${v.marca.nome}". ${v.marca.descricao || ""}
É texto PRA SER FALADO em voz alta, não pra ser lido. Regras que fazem a voz soar humana:
- Frases CURTAS. Uma ideia por frase.
- Use "..." onde a voz deve respirar/pausar, e "!" onde ela sobe.
- Fale como brasileiro fala: "pra", "tá", "cê", "olha só", "pois é". Nada de texto empolado.
- Comece com um GANCHO que segura a atenção nos 3 primeiros segundos.
- Fale COM o pai/mãe ("seu filho", "sua festa"), vendendo o BENEFÍCIO — não liste características.
- Termine com uma CHAMADA clara pra ação.
- Números por extenso ("vinte por cento", "dia vinte") — a voz lê melhor.
- Sem emoji, sem hashtag, sem marcação de cena. SÓ o que a voz fala.
- A marca É o lugar da festa: nunca mande procurar outro local.
- Tamanho: cerca de ${palavras} palavras (a locução tem que durar ~${segundosAlvo}s).`,
          },
          {
            role: "user",
            content: `Tema do vídeo: "${v.titulo}".\nO que o dono quer anunciar: ${b || "um convite pra conhecer o buffet e fechar a festa aqui"}.${v.marca.telefone ? `\nWhatsApp da marca: ${v.marca.telefone} (só cite se fizer sentido na chamada final).` : ""}\n\nEscreva o roteiro. Responda só com JSON: {"roteiro":"..."}`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { roteiro?: string };
    const roteiro = (j.roteiro || "").trim().slice(0, 1200);
    if (!roteiro) throw new Error("A IA não devolveu roteiro.");
    await prisma.videoTematico.update({ where: { id: videoId }, data: { narracaoTexto: roteiro } });
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    return { ok: true as const, roteiro };
  } catch (e) {
    console.error("Erro ao escrever o roteiro da narração:", e);
    return { ok: false as const, erro: "Não consegui escrever o roteiro agora." };
  }
}

// A Bia escreve a 2ª FALA (CTA) — a fala CURTA do FIM do vídeo, que convida a agir (fazer o
// orçamento, acessar o site). NÃO persiste (fica no MP3 quando o dono gera a voz); só devolve o texto.
export async function gerarCtaNarracao(videoId: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { nome: true, site: true, telefone: true } } },
  });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const key = process.env.OPENAI_API_KEY;

  const site = (v.marca.site || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const fallback = site
    ? `Acesse ${site} e faça seu orçamento agora mesmo!`
    : "Chama a gente e garanta a festa do seu filho agora mesmo!";
  if (!key) return { ok: true as const, cta: fallback };
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `Você escreve a FALA FINAL (CTA) de um vídeo do buffet infantil "${v.marca.nome}" — pra ser FALADA em voz alta no fim do vídeo. Regras:
- UMA a DUAS frases CURTAS (no máximo ~18 palavras no total).
- Tom empolgado e direto, convidando a pessoa a AGIR AGORA (fazer o orçamento / garantir a festa).
${site ? `- Cite o site no fim: ${site} (deixe a URL na fala pra a voz ler).` : ""}${v.marca.telefone ? `\n- Pode convidar a chamar no WhatsApp.` : ""}
- A marca É o lugar da festa; nunca mande procurar outro local.
- Sem emoji, sem hashtag, sem marcação de cena. Só o que a voz fala.`,
          },
          { role: "user", content: `Tema do vídeo: "${v.titulo}". Escreva a fala final (CTA). Responda só com JSON: {"cta":"..."}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { cta?: string };
    const cta = (j.cta || "").trim().slice(0, 300);
    return { ok: true as const, cta: cta || fallback };
  } catch (e) {
    console.error("Erro ao escrever o CTA da narração:", e);
    return { ok: true as const, cta: fallback };
  }
}

// Gera a VOZ (Google Chirp3-HD) já misturada com o jingle e guarda no Blob. O dono OUVE antes
// de mandar montar o vídeo — trocar a voz e ouvir de novo custa centavos e leva 2 segundos.
export async function gerarNarracaoVideo(videoId: string, texto: string, vozId: string, direcao?: string, volMusica?: number, texto2?: string, alvoSegundos?: number, musicaWavUrl?: string) {
  const v = await prisma.videoTematico.findUnique({
    where: { id: videoId },
    include: { marca: { select: { slug: true, musicas: true } } },
  });
  // (videoUrl entra no select pelo include padrão — usado logo abaixo pra barrar a corrida)
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  const t = (texto || "").trim().slice(0, 1200);
  if (t.length < 20) return { ok: false as const, erro: "Escreva o roteiro da narração primeiro." };
  // O motor está BAIXANDO essa trilha agora — trocar/apagar o MP3 no meio da montagem deixaria
  // o Reels mudo (e o vídeo preso em "gerando", porque o motor erraria sem callback).
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar pra mexer na narração." };

  const voz = vozValida(vozId || v.narracaoVoz || VOZ_PADRAO);
  const estilo = (direcao ?? v.narracaoEstilo ?? "").trim().slice(0, 900);
  const antigo = v.narracaoUrl;
  try {
    // volMusica: FRAÇÃO do slider (0..1) — 0 = sem música | 0,5 = padrão | 1 = bem alta. Clampa por segurança.
    const vm = typeof volMusica === "number" && isFinite(volMusica) ? Math.max(0, Math.min(1, volMusica)) : undefined;
    // 2ª fala (CTA no fim, opcional) e a duração ALVO do vídeo com TODAS as fotos — a música
    // estica até lá pra nenhuma foto ficar de fora. Clampa a duração num intervalo são.
    const t2 = (texto2 || "").trim().slice(0, 400);
    const alvo = typeof alvoSegundos === "number" && isFinite(alvoSegundos) ? Math.max(10, Math.min(120, alvoSegundos)) : undefined;
    // Fundo da narração: o WAV passado direto pelo "Ouvir" (a trilha escolhida na tela AGORA) tem
    // prioridade; senão, o WAV da trilha salva (videoMusica). Sem nada disso → jingle do buffet.
    const musicaWav = (musicaWavUrl && musicaWavUrl.startsWith("http"))
      ? musicaWavUrl
      : v.videoMusica?.startsWith("http")
        ? lerMusicas(v.marca.musicas).find((m) => m.url === v.videoMusica)?.wav
        : undefined;
    const { url, segundos } = await gerarNarracaoMp3({ texto: t, texto2: t2 || undefined, vozId: voz, direcao: estilo, slugMarca: v.marca.slug || "marca", ref: videoId.slice(-6), volMusica: vm, alvoSegundos: alvo, musicaWav: musicaWav || undefined });
    await prisma.videoTematico.update({
      where: { id: videoId },
      data: { narracaoTexto: t, narracaoVoz: voz, narracaoEstilo: estilo, narracaoUrl: url, narracaoSeg: Math.round(segundos) },
    });
    // A narração anterior não serve mais — o Blob tem limite.
    if (antigo.startsWith("http")) import("@vercel/blob").then(({ del }) => del(antigo)).catch(() => {});
    revalidatePath(`/painel/marcas/${v.marcaId}`);
    return { ok: true as const, url, segundos, fotos: fotosParaDuracao(segundos, MAX_FOTOS) };
  } catch (e) {
    console.error("Erro ao gerar a narração:", e);
    return { ok: false as const, erro: "Não consegui gerar a voz agora." };
  }
}

// Tira a narração do vídeo (volta a ser só imagens + jingle).
export async function removerNarracaoVideo(videoId: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, narracaoUrl: true, videoUrl: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  if (v.videoUrl === "gerando") return { ok: false as const, erro: "O vídeo está sendo montado agora — espere terminar pra tirar a narração." };
  await prisma.videoTematico.update({
    where: { id: videoId },
    data: { narracaoTexto: "", narracaoUrl: "", narracaoSeg: 0 },
  });
  if (v.narracaoUrl.startsWith("http")) import("@vercel/blob").then(({ del }) => del(v.narracaoUrl)).catch(() => {});
  revalidatePath(`/painel/marcas/${v.marcaId}`);
  return { ok: true as const };
}

// Edita à mão a legenda de UMA foto do vídeo (o dono ajusta o que a Bia escreveu).
export async function editarTextoFotoVideo(videoId: string, fotoId: string, frase: string) {
  const v = await prisma.videoTematico.findUnique({ where: { id: videoId }, select: { marcaId: true, videoTextos: true } });
  if (!v) return { ok: false as const, erro: "Vídeo não encontrado." };
  const g = await guardaMarca(v.marcaId);
  if (!g.ok) return { ok: false as const, erro: g.erro };
  let mapa: Record<string, string> = {};
  try {
    const m = JSON.parse(v.videoTextos || "{}");
    if (m && typeof m === "object") mapa = m as Record<string, string>;
  } catch {}
  const f = (frase || "").trim().slice(0, 80);
  if (f) mapa[fotoId] = f;
  else delete mapa[fotoId]; // frase vazia = a foto passa limpa
  await prisma.videoTematico.update({ where: { id: videoId }, data: { videoTextos: JSON.stringify(mapa) } });
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
