"use client";

// Aba VÍDEO do painel — GALERIA de Reels: cada festa é uma miniatura VERTICAL (9:16), estilo a
// aba de Reels do Instagram. Play no centro quando o vídeo está pronto; ⚡ Gerar quando não tem.
// Escolher/ordenar fotos abre o seletor. O AGENDAMENTO/postagem mora em Redes Sociais → 🎬 Reels.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { type FestaView, type FotoView } from "@/lib/festa-tipos";
import { rotuloAniversariantes, tituloCapaFesta } from "@/lib/aniversariantes";
import { SeletorVideoFotos } from "@/components/seletor-video-fotos";
import { criarVideoTematico, excluirVideoTematico, fotosDoVideoTematico } from "@/app/actions/videos-tematicos";

// Vídeo TEMÁTICO do buffet (Reels institucional do acervo, sem festa) — view do painel.
export type VideoTematicoView = {
  id: string;
  titulo: string;
  videoUrl: string; // "" | "gerando" | http (evergreen: nunca "arquivado")
  videoFotos: string[];
  videoCapa: string;
  videoMoldura: string;
  videoTextoFinal: string;
  videoFundo: string; // fundo do quadro: "" (foto borrada) | "cheia" (foto preenche a tela) | "cor" (degradê)
  videoFundoCor: string; // cor do fundo "cor" (hex); "" = cor da marca
  videoMolduraCor: string; // cor da moldura "marca" (hex); "" = cor da marca
  capaEstilo: string; // estilo da capa: "" (clássica) | "impacto" (foto na tela toda) | "ia" (arte da IA)
  capaIaUrl: string; // URL da arte de capa gerada pela IA (quando capaEstilo = "ia")
  videoMusica: string; // trilha escolhida (URL) — "" = jingle do buffet
  videoTextos: Record<string, string>; // legendas por foto (a copy que aparece no vídeo)
  narracao: { texto: string; voz: string; estilo: string; url: string; segundos: number }; // a voz que fala no vídeo
  capaUrl: string | null; // thumb do card (capa escolhida ou 1ª foto)
  postadoVezes: number; // quantas vezes esse vídeo já foi postado (0 = nunca) — evergreen, segue repostável
  naFila: number; // posts desse vídeo AGENDADOS, ainda esperando a data (0 = nada na fila)
  agendadoEm: string | null; // a próxima data agendada (null = nada na fila)
};

// Temas prontos pro botão de criar (também dá pra digitar um tema livre).
const TEMAS_PRONTOS = ["Brinquedos", "Nosso espaço", "Decorações de festa", "Comidas e delícias"];

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

// Player do Reels em tela cheia (clicar fora ou no ✕ fecha).
function PlayerModal({ url, onFechar }: { url: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="relative">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls playsInline preload="metadata" className="max-h-[80vh] rounded-xl" />
        <button onClick={onFechar} aria-label="Fechar" className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">✕</button>
      </div>
      {/* Ações de apoio: abrir o vídeo direto (bom teste quando não carrega) e copiar o link. */}
      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">↗ Abrir em nova aba</a>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => {}); }} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">{copiado ? "✓ Copiado" : "🔗 Copiar link"}</button>
      </div>
    </div>
  );
}

function CardVideo({ f, onAbrirSeletor }: { f: FestaView; onAbrirSeletor: () => void }) {
  const [ver, setVer] = useState(false);

  const pronto = f.videoUrl.startsWith("http");
  const emGeracao = f.videoUrl === "gerando";
  const arquivado = f.videoUrl === "arquivado"; // já foi POSTADO e o MP4 foi apagado (+24h) — regerável das fotos
  const postado = f.videoPostado === true; // já postado pelo Postaí, mas o vídeo ainda está disponível (antes das 24h)
  // NA FILA: tem Reels agendado esperando a data. Não substitui o status (o vídeo segue "Pronto") —
  // é um selo a mais, pra o dono achar de longe o que já está marcado. Vale até em festa já
  // postada: se ele agendou um repost, a fila continua sendo a informação que importa.
  const agendadoEm = f.videoAgendadoEm || null;
  const nomes = rotuloAniversariantes(f.aniversariantes) || "Festa";
  const capa = f.fotos[0]?.url;

  // Postado vem ANTES de "Pronto": se o Reels já foi ao ar (na hora ou arquivado em 24h), mostra "Postado".
  const badge = arquivado || (pronto && postado)
    ? { txt: "📮 Postado", cls: "bg-sky-600 text-white" }
    : pronto
    ? { txt: "✅ Pronto", cls: "bg-green-600 text-white" }
    : emGeracao
    ? { txt: "🎬 Gerando", cls: "bg-amber-500 text-black" }
    : f.fotos.length
    ? { txt: "Pra gerar", cls: "bg-black/70 text-white" }
    : { txt: "Sem fotos", cls: "bg-black/70 text-white/70" };

  // Autorização (LGPD): festa SEM autorização não pode ter o Reels postado — mostra no card.
  const autoriz = f.autorizacao === "negada"
    ? { txt: "✗ Sem autorização", cls: "bg-vermelho text-white" }
    : f.autorizacao === "pendente"
    ? { txt: "⏳ Pendente", cls: "bg-amber-500 text-black" }
    : { txt: "✓ Autorizado", cls: "bg-green-500 text-black" };

  return (
    // A borda roxa acesa é o atalho visual: card agendado se destaca na grade inteira.
    <div className={`overflow-hidden rounded-2xl border bg-preto-card transition ${agendadoEm ? "border-[#7c3aed]/70 hover:border-[#7c3aed]" : "border-linha hover:border-white/15"}`}>
      {/* miniatura vertical 9:16 */}
      <div className="relative aspect-[9/16] bg-preto">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-50">🎬</div>
        )}

        {/* badges do topo: status e, embaixo dele, o selo de agendado */}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.txt}</span>
          {agendadoEm && (
            <span title={`Reels agendado pra ${dataCurta(agendadoEm)}`} className="rounded-full bg-[#7c3aed] px-2 py-0.5 text-[10px] font-bold text-white">⏰ Agendado {dataCurta(agendadoEm)}</span>
          )}
        </div>

        {/* contador de fotos do vídeo (topo dir.) */}
        {f.videoFotos.length > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">🎬 {f.videoFotos.length}</span>
        )}

        {/* play central (pronto) ou spinner (gerando) */}
        {pronto && (
          <button onClick={() => setVer(true)} aria-label="Ver vídeo" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-2xl text-white backdrop-blur-sm transition hover:scale-110 hover:bg-[#7c3aed]">▶</span>
          </button>
        )}
        {emGeracao && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
            <span className="text-3xl">🎬</span>
            <span className="animate-pulse text-[11px] font-semibold text-white">Montando…</span>
          </div>
        )}
        {arquivado && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-3 text-center">
            <span className="text-3xl">📮</span>
            <span className="text-[11px] font-semibold text-white">Vídeo postado no Instagram</span>
            <span className="text-[10px] leading-snug text-white/70">arquivado após 24h pra poupar espaço · gere de novo se precisar</span>
          </div>
        )}

        {/* nome + data (rodapé do thumb, sobre gradiente) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-8">
          <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${autoriz.cls}`}>{autoriz.txt}</span>
          <p className="truncate font-titulo text-sm leading-tight text-white">{nomes}</p>
          <p className="truncate text-[10px] text-white/70">{dataCurta(f.dataISO)}{f.horario ? ` · ${f.horario}` : ""}{f.tema ? ` · ${f.tema}` : ""}</p>
        </div>
      </div>

      {/* ações */}
      <div className="flex items-stretch gap-1.5 p-2">
        {pronto ? (
          <>
            <button onClick={() => setVer(true)} className="flex-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500">▶ Ver vídeo</button>
            <button onClick={onAbrirSeletor} title="Escolher as fotos e gerar o vídeo de novo (substitui o atual)" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed]/70 hover:bg-[#7c3aed]/25">🔄 Refazer</button>
          </>
        ) : emGeracao ? (
          <button disabled className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-300">🎬 Gerando…</button>
        ) : arquivado ? (
          <button onClick={onAbrirSeletor} title="Esse vídeo já foi postado e arquivado. Gere um novo com as fotos (continuam guardadas)." className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">🔄 Gerar de novo</button>
        ) : (
          <button onClick={onAbrirSeletor} className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9]">⚡ Gerar vídeo</button>
        )}
      </div>

      {ver && pronto && <PlayerModal url={f.videoUrl} onFechar={() => setVer(false)} />}
    </div>
  );
}

// Nome amigável de uma trilha a partir da URL do Blob (tira o "123456-" e a extensão).
function nomeDaMusica(url: string): string {
  try {
    const base = decodeURIComponent(url.split("/").pop() || "música");
    return base.replace(/^\d+-/, "").replace(/\.[^.]+$/, "").replace(/_/g, " ").trim() || "música";
  } catch { return "música"; }
}

// Card de um vídeo TEMÁTICO do buffet — mesma cara do card de festa, sem LGPD/aniversariante.
function CardTematico({ v, ocupado, onAbrirSeletor, onExcluir }: { v: VideoTematicoView; ocupado: boolean; onAbrirSeletor: () => void; onExcluir: () => void }) {
  const [ver, setVer] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  const pronto = v.videoUrl.startsWith("http");
  const emGeracao = v.videoUrl === "gerando";
  const postado = pronto && v.postadoVezes > 0; // já foi ao ar (mas segue guardado pra repostar)
  // Postado vem ANTES de "Pronto": se o vídeo do buffet já foi postado, o selo mostra isso.
  const badge = postado
    ? { txt: "📮 Postado", cls: "bg-sky-600 text-white" }
    : pronto
    ? { txt: "✅ Pronto", cls: "bg-green-600 text-white" }
    : emGeracao
    ? { txt: "🎬 Gerando", cls: "bg-amber-500 text-black" }
    : { txt: "Pra gerar", cls: "bg-black/70 text-white" };
  // O vídeo do buffet é reutilizável: mesmo postado, o texto reforça que dá pra repostar.
  const rodape = postado
    ? `${v.postadoVezes > 1 ? `postado ${v.postadoVezes}×` : "já postado"} — reposte quando quiser`
    : pronto
    ? "guardado — reposte quando quiser"
    : "monte com fotos do acervo";
  // Evergreen: aqui "agendado" convive com "postado" (ele volta ao ar em datas diferentes), então
  // o selo mostra a PRÓXIMA data e, se tiver mais de um marcado, quantos ainda estão na fila.
  const naFila = v.agendadoEm ? `⏰ Agendado ${dataCurta(v.agendadoEm)}${v.naFila > 1 ? ` +${v.naFila - 1}` : ""}` : "";

  return (
    <div className={`overflow-hidden rounded-2xl border bg-preto-card transition ${naFila ? "border-[#7c3aed] shadow-[0_0_0_1px_rgba(124,58,237,0.5)]" : "border-[#7c3aed]/30 hover:border-[#7c3aed]/60"}`}>
      <div className="relative aspect-[9/16] bg-preto">
        {v.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.capaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-50">🏰</div>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.txt}</span>
          {naFila && <span className="rounded-full bg-[#7c3aed] px-2 py-0.5 text-[10px] font-bold text-white">{naFila}</span>}
        </div>
        {v.videoFotos.length > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">🎬 {v.videoFotos.length}</span>
        )}
        {pronto && (
          <button onClick={() => setVer(true)} aria-label="Ver vídeo" className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-2xl text-white backdrop-blur-sm transition hover:scale-110 hover:bg-[#7c3aed]">▶</span>
          </button>
        )}
        {emGeracao && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
            <span className="text-3xl">🎬</span>
            <span className="animate-pulse text-[11px] font-semibold text-white">Montando…</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-8">
          <span className="mb-1 inline-block rounded-full bg-[#7c3aed]/80 px-2 py-0.5 text-[9px] font-bold text-white">🏰 Vídeo do buffet</span>
          <p className="truncate font-titulo text-sm leading-tight text-white">{v.titulo}</p>
          <p className="truncate text-[10px] text-white/70">{rodape}</p>
        </div>
      </div>

      <div className="flex items-stretch gap-1.5 p-2">
        {pronto ? (
          <>
            <button onClick={() => setVer(true)} className="flex-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500">▶ Ver vídeo</button>
            <button onClick={onAbrirSeletor} disabled={ocupado} title="Escolher as fotos e gerar de novo (substitui o vídeo atual)" className="shrink-0 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2.5 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:border-[#7c3aed]/70 hover:bg-[#7c3aed]/25 disabled:opacity-50">🔄</button>
          </>
        ) : emGeracao ? (
          <button disabled className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-300">🎬 Gerando…</button>
        ) : (
          <button onClick={onAbrirSeletor} disabled={ocupado} className="flex-1 rounded-lg bg-[#7c3aed] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-50">{ocupado ? "Abrindo…" : "⚡ Fotos & gerar"}</button>
        )}
        {!emGeracao && (confirmaExcluir ? (
          <button onClick={() => { onExcluir(); setConfirmaExcluir(false); }} className="shrink-0 rounded-lg bg-red-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600">Excluir?</button>
        ) : (
          <button onClick={() => setConfirmaExcluir(true)} title="Excluir este vídeo temático" className="shrink-0 rounded-lg border border-red-900/60 px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-950/40">✕</button>
        ))}
      </div>

      {ver && pronto && <PlayerModal url={v.videoUrl} onFechar={() => setVer(false)} />}
    </div>
  );
}

export function VideoPainel({ marcaId, festas, tematicos, corMarca }: { marcaId: string; festas: FestaView[]; tematicos: VideoTematicoView[]; corMarca: string }) {
  const router = useRouter();
  const [seletor, setSeletor] = useState<FestaView | null>(null);
  // criação/edição de vídeo TEMÁTICO
  const [temaNovo, setTemaNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const [msgTema, setMsgTema] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [carregandoTema, setCarregandoTema] = useState<string | null>(null); // id do temático abrindo o seletor
  const [seletorTema, setSeletorTema] = useState<{ video: VideoTematicoView; fotos: FotoView[] } | null>(null);
  // "Banco" de trilhas: as músicas já enviadas em outros vídeos desta marca, pra reusar sem re-upload.
  const musicasBanco = Array.from(new Set(festas.map((f) => f.videoMusica).filter((u) => u && u.startsWith("http")))).map((url) => ({ url, nome: nomeDaMusica(url) }));

  // Auto-refresh enquanto algum vídeo está "Gerando": o motor monta na nuvem e avisa por callback
  // (salva no banco). Aqui o painel se atualiza sozinho a cada 12s pra o card virar "pronto" sem F5.
  const algumGerando = festas.some((f) => f.videoUrl === "gerando") || tematicos.some((v) => v.videoUrl === "gerando");
  useEffect(() => {
    if (!algumGerando) return;
    const t = setInterval(() => router.refresh(), 12000);
    return () => clearInterval(t);
  }, [algumGerando, router]);

  async function criarTema(nome: string) {
    const tema = nome.trim();
    if (tema.length < 3) { setMsgTema({ tipo: "erro", txt: "Dê um nome pro tema (ex: Brinquedos)." }); return; }
    setCriando(true); setMsgTema(null);
    const r = await criarVideoTematico(marcaId, tema).catch(() => ({ ok: false as const, erro: "Não deu pra criar agora." }));
    setCriando(false);
    if (!r.ok) { setMsgTema({ tipo: "erro", txt: r.erro || "Não deu pra criar." }); return; }
    setTemaNovo("");
    setMsgTema({ tipo: "ok", txt: `✨ Criei "${tema}" já com ${r.sugeridas} fotos sugeridas — toque em ⚡ Fotos & gerar pra revisar.` });
    router.refresh();
  }
  // Abre o seletor do temático: o servidor devolve o acervo divulgável com as fotos JÁ
  // escolhidas na frente (e garante que nenhuma delas suma, mesmo em acervo grande).
  async function abrirSeletorTema(v: VideoTematicoView) {
    setCarregandoTema(v.id); setMsgTema(null);
    const r = await fotosDoVideoTematico(v.id).catch(() => ({ ok: false as const, erro: "Não consegui carregar as fotos." }));
    setCarregandoTema(null);
    if (!r.ok) { setMsgTema({ tipo: "erro", txt: r.erro || "Não consegui carregar as fotos." }); return; }
    setSeletorTema({ video: v, fotos: r.fotos as FotoView[] });
  }
  async function excluirTema(id: string) {
    setMsgTema(null);
    const r = await excluirVideoTematico(id).catch(() => ({ ok: false as const, erro: "Não deu pra excluir agora." }));
    if (!r.ok) { setMsgTema({ tipo: "erro", txt: r.erro || "Não deu pra excluir." }); return; }
    router.refresh();
  }

  return (
    <div>
      {/* ---- VÍDEOS DO BUFFET (temáticos, do acervo) ---- */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">🏰 Vídeos do buffet</p>
        <p className="mt-1 text-xs text-muted">
          Reels <strong className="text-white/80">do seu espaço</strong> (sem festa específica): escolha um tema e a IA já sugere as melhores fotos do acervo — brinquedos, decoração, comidas… O vídeo fica <strong className="text-white/80">guardado</strong> pra repostar quando quiser.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {TEMAS_PRONTOS.map((t) => (
            <button key={t} type="button" disabled={criando} onClick={() => criarTema(t)} className="rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 text-xs font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-50">➕ {t}</button>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={temaNovo} onChange={(e) => setTemaNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criarTema(temaNovo); }} placeholder="Outro tema…" className="input-base w-36 py-1.5 text-xs" />
            <button type="button" disabled={criando || temaNovo.trim().length < 3} onClick={() => criarTema(temaNovo)} className="rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-50">{criando ? "✨ Criando…" : "Criar"}</button>
          </div>
        </div>
        {msgTema && <p className={`mt-2 text-xs font-semibold ${msgTema.tipo === "ok" ? "text-green-400" : "text-vermelho"}`}>{msgTema.txt}</p>}
      </div>

      {tematicos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {tematicos.map((v) => (
            <CardTematico key={v.id} v={v} ocupado={carregandoTema === v.id} onAbrirSeletor={() => abrirSeletorTema(v)} onExcluir={() => excluirTema(v.id)} />
          ))}
        </div>
      )}

      {/* ---- VÍDEOS DAS FESTAS ---- */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">🎬 Vídeo das festas</p>
        <p className="mt-1 text-xs text-muted">
          Monte o <strong className="text-white/80">Reels</strong> de cada festa: escolha e ordene as fotos (🎬 Fotos), clique em <strong className="text-white/80">⚡ Gerar vídeo</strong> e o Postaí monta sozinho (capa + jingle). Depois, pra <strong className="text-white/80">agendar/postar</strong>, vá em <strong className="text-white/80">📱 Redes Sociais → 🎬 Reels</strong>.
        </p>
      </div>

      {festas.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhuma festa ainda. Crie festas na aba <strong className="text-white">📸 Festas</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {festas.map((f) => (
            <CardVideo key={f.id} f={f} onAbrirSeletor={() => setSeletor(f)} />
          ))}
        </div>
      )}

      {seletor && (
        <SeletorVideoFotos
          festaId={seletor.id}
          nome={rotuloAniversariantes(seletor.aniversariantes) || "Festa"}
          fotos={seletor.fotos}
          inicial={seletor.videoFotos}
          capaInicial={seletor.videoCapa}
          molduraInicial={seletor.videoMoldura}
          textoFinalInicial={seletor.videoTextoFinal}
          tituloCapaInicial={seletor.videoTituloCapa}
          tituloCapaAuto={tituloCapaFesta(seletor.aniversariantes, rotuloAniversariantes(seletor.aniversariantes))}
          musicaInicial={seletor.videoMusica}
          musicasBanco={musicasBanco}
          corMarca={corMarca}
          jaTemVideo={seletor.videoUrl.startsWith("http")}
          onFechar={() => setSeletor(null)}
        />
      )}

      {seletorTema && (
        <SeletorVideoFotos
          festaId=""
          tematicoId={seletorTema.video.id}
          nome={seletorTema.video.titulo}
          fotos={seletorTema.fotos}
          inicial={seletorTema.video.videoFotos}
          capaInicial={seletorTema.video.videoCapa}
          molduraInicial={seletorTema.video.videoMoldura}
          textoFinalInicial={seletorTema.video.videoTextoFinal}
          textosIniciais={seletorTema.video.videoTextos}
          narracao={seletorTema.video.narracao}
          fundoInicial={seletorTema.video.videoFundo}
          fundoCorInicial={seletorTema.video.videoFundoCor}
          molduraCorInicial={seletorTema.video.videoMolduraCor}
          capaEstiloInicial={seletorTema.video.capaEstilo}
          capaIaUrlInicial={seletorTema.video.capaIaUrl}
          musicaInicial={seletorTema.video.videoMusica}
          musicasBanco={musicasBanco}
          corMarca={corMarca}
          jaTemVideo={seletorTema.video.videoUrl.startsWith("http")}
          onFechar={() => setSeletorTema(null)}
        />
      )}
    </div>
  );
}
