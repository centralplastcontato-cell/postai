"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { gerarLegendaArte, gerarLegendaVideo, criarArtePronta, criarArteVideo, prepararPostArteVideo, concluirPostArteVideo, listarArtesProntas, excluirArtePronta, postarPublicacao, postarStory, type ArteProntaView, type OpcaoLegenda } from "@/app/actions/feed";
import { InputDataBR } from "@/components/input-data-br";
import { opcoesHora10 } from "@/lib/horarios";

const HORAS_10 = opcoesHora10(); // opções de hora de 10 em 10 min

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

// 🖼️ MINHA ARTE — o dono sobe uma arte PRONTA (feita fora, ex: promoção no Canva), a Bia lê a
// imagem e escreve a legenda combinando, e ele posta como Story/Feed (na hora ou agendado).
// A arte vai EXATAMENTE como ele fez (o render mostra a imagem inteira, sem template por cima).
export function MinhaArte({ marcaId }: { marcaId: string }) {
  const router = useRouter();
  const [imagemUrl, setImagemUrl] = useState(""); // URL da mídia enviada (imagem OU vídeo)
  const [midia, setMidia] = useState<"imagem" | "video">("imagem"); // o que foi enviado
  const [posterUrl, setPosterUrl] = useState(""); // quadro (foto) tirado do vídeo — vira miniatura (best-effort)
  const [briefVideo, setBriefVideo] = useState(""); // 1 linha "do que é o vídeo" — a Bia usa pra escrever a legenda
  const [progresso, setProgresso] = useState(0); // % do upload do vídeo (arquivo grande)
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState("");
  const [legenda, setLegenda] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [lendoArte, setLendoArte] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcaoLegenda[]>([]); // 3 níveis de legenda que a Bia sugere
  const [formato, setFormato] = useState<"story" | "feed" | "ambos">("story");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("10:00"); // HH:MM (permite escolher os minutos também)
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState("");
  // artes já enviadas
  const [artes, setArtes] = useState<ArteProntaView[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [proc, setProc] = useState("");
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);

  const recarregar = useCallback(async () => {
    const r = await listarArtesProntas(marcaId).catch(() => null);
    setCarregando(false);
    if (r && r.ok) setArtes(r.artes);
  }, [marcaId]);
  useEffect(() => { recarregar(); }, [recarregar]);

  // PERSISTÊNCIA do envio em andamento: se o dono sobe uma mídia (principalmente um vídeo, que é
  // trabalhoso de reenviar) e SAI sem salvar/postar, ao voltar a mídia continua aqui. Guarda no
  // navegador (localStorage) e restaura ao abrir. Limpa quando salva/posta ou troca a mídia.
  const LS_KEY = `postai:minha-arte:pendente:${marcaId}`;
  const restaurado = useRef(false);
  useEffect(() => {
    if (restaurado.current) return;
    restaurado.current = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && typeof p.imagemUrl === "string" && p.imagemUrl.startsWith("http")) {
        setImagemUrl(p.imagemUrl);
        setMidia(p.midia === "video" ? "video" : "imagem");
        setPosterUrl(typeof p.posterUrl === "string" ? p.posterUrl : "");
        setBriefVideo(typeof p.briefVideo === "string" ? p.briefVideo : "");
        setLegenda(typeof p.legenda === "string" ? p.legenda : "");
        setHashtags(typeof p.hashtags === "string" ? p.hashtags : "");
        if (p.formato === "story" || p.formato === "feed" || p.formato === "ambos") setFormato(p.formato);
      }
    } catch {}
  }, [LS_KEY]);
  // Salva/limpa o rascunho do envio sempre que a mídia (ou os campos) mudam.
  useEffect(() => {
    try {
      if (imagemUrl) localStorage.setItem(LS_KEY, JSON.stringify({ imagemUrl, midia, posterUrl, briefVideo, legenda, hashtags, formato }));
      else localStorage.removeItem(LS_KEY);
    } catch {}
  }, [LS_KEY, imagemUrl, midia, posterUrl, briefVideo, legenda, hashtags, formato]);
  const limparPendente = () => { try { localStorage.removeItem(LS_KEY); } catch {} };

  async function handleUpload(file?: File) {
    if (!file) return;
    const ehVideo = (file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    setErro(""); setOk(""); setSubindo(true); setProgresso(0);
    try {
      if (ehVideo) {
        // Vídeo é grande demais pro upload normal (limite de 4,5MB das funções). Sobe DIRETO pro
        // Blob a partir do navegador (client upload), que aguenta arquivos grandes.
        const { upload } = await import("@vercel/blob/client");
        const nome = (file.name || "video.mp4").replace(/[^a-zA-Z0-9.-]/g, "_");
        // Sobe o vídeo direto pro Blob (aguenta arquivo grande).
        const blob = await upload(`artes-video/${Date.now()}-${nome}`, file, {
          access: "public",
          handleUploadUrl: "/api/marketing/blob-upload",
          contentType: file.type || "video/mp4",
          onUploadProgress: (e) => setProgresso(Math.round(e.percentage)),
        });
        setImagemUrl(blob.url); setPosterUrl(""); setMidia("video"); setFormato("feed"); setLegenda(""); setHashtags(""); setOpcoes([]); setBriefVideo("");
      } else {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
        const d = await resp.json();
        if (d.ok && d.url) { setImagemUrl(d.url); setPosterUrl(""); setMidia("imagem"); setLegenda(""); setHashtags(""); setOpcoes([]); }
        else setErro(d.erro || "Não consegui enviar a arte.");
      }
    } catch { setErro(ehVideo ? "Não consegui enviar o vídeo. Confira o tamanho (máx. 120MB) e tente de novo." : "Não consegui enviar a arte. Tente de novo."); }
    setSubindo(false); setProgresso(0);
  }

  // Espera curta (usada no poll do vídeo).
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // POSTAR VÍDEO AGORA (2 fases): inicia o container na Meta e fica consultando até publicar.
  // Se ainda estiver processando depois de ~1min, retorna "processando" (o piloto termina sozinho).
  async function postarVideoAgora(id: string): Promise<{ ok: boolean; erro?: string; processando?: boolean }> {
    const prep = await prepararPostArteVideo(id).catch(() => ({ ok: false as const, erro: "Não consegui iniciar a postagem." }));
    if (!prep.ok) return { ok: false, erro: prep.erro };
    for (let i = 0; i < 16; i++) {
      await sleep(4000);
      const r = await concluirPostArteVideo(id, prep.containerId).catch(() => ({ ok: false as const, erro: "Falha ao checar o vídeo." }));
      if (!r.ok) return { ok: false, erro: r.erro };
      if (r.pronto) return { ok: true };
    }
    return { ok: false, processando: true };
  }

  async function lerArte() {
    if (midia === "video" && !briefVideo.trim()) { setErro("Escreva em uma linha do que é o vídeo (ex: promoção de aniversário) pra a Bia criar a legenda."); return; }
    if (midia === "imagem" && !imagemUrl) { setErro("Envie a arte primeiro."); return; }
    setErro(""); setLendoArte(true);
    // Vídeo: a Bia escreve a partir da sua descrição (o navegador do celular não deixa ela "ver" o vídeo).
    // Imagem: a Bia LÊ a imagem (visão).
    const r = midia === "video"
      ? await gerarLegendaVideo(marcaId, briefVideo).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }))
      : await gerarLegendaArte(marcaId, imagemUrl).catch(() => ({ ok: false as const, erro: "Não consegui ler agora." }));
    setLendoArte(false);
    if (!r.ok) { setErro(r.erro); return; }
    setOpcoes(r.opcoes);
    // já deixa a 1ª (Simples) preenchida; o dono troca clicando nas outras.
    if (r.opcoes[0]) { setLegenda(r.opcoes[0].legenda); setHashtags(r.opcoes[0].hashtags); }
  }
  function usarOpcao(o: OpcaoLegenda) { setLegenda(o.legenda); setHashtags(o.hashtags); }

  // modo: "rascunho" (só guarda, não posta nem agenda) | "agendar" (entra na agenda) | "postar" (posta já).
  // "ambos" = Feed + Story.
  const rotuloFmt = (fmt: "feed" | "story") => fmt === "story" ? "Story" : (midia === "video" ? "Reels" : "Feed");

  async function salvar(modo: "rascunho" | "agendar" | "postar") {
    if (!imagemUrl) { setErro(midia === "video" ? "Envie o vídeo primeiro." : "Envie a arte primeiro."); return; }
    setErro(""); setOk(""); setSalvando(true);
    const legendaFinal = [legenda.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
    const rascunho = modo === "rascunho";
    const postarAgora = modo === "postar";
    const alvos: ("feed" | "story")[] = formato === "ambos" ? ["feed", "story"] : [formato];
    const feitos: string[] = [];
    let ultimoErro = ""; let processando = false;
    for (const fmt of alvos) {
      if (midia === "video") {
        const r = await criarArteVideo(marcaId, imagemUrl, fmt, postarAgora ? undefined : (data || undefined), hora, legenda, hashtags, rascunho, postarAgora, posterUrl).catch(() => ({ ok: false as const, erro: "Não consegui salvar o vídeo agora." }));
        if (!r.ok) { ultimoErro = r.erro; continue; }
        if (postarAgora) {
          const pr = await postarVideoAgora(r.id);
          if (pr.ok) feitos.push(rotuloFmt(fmt));
          else if (pr.processando) processando = true;
          else ultimoErro = pr.erro || "Não consegui postar o vídeo.";
        } else feitos.push(rotuloFmt(fmt));
      } else {
        const r = await criarArtePronta(marcaId, imagemUrl, fmt, postarAgora ? undefined : (data || undefined), hora, legendaFinal, "", rascunho, postarAgora).catch(() => ({ ok: false as const, erro: "Não consegui salvar agora." }));
        if (!r.ok) { ultimoErro = r.erro; continue; }
        if (postarAgora) {
          const post = await (fmt === "story" ? postarStory(r.id) : postarPublicacao(r.id)).catch(() => ({ ok: false as const, erro: "Salvei, mas não consegui postar agora." }));
          if (post.ok) feitos.push(rotuloFmt(fmt));
          else ultimoErro = post.erro;
        } else feitos.push(rotuloFmt(fmt));
      }
    }
    setSalvando(false);
    if (feitos.length || processando) {
      let msg = "";
      if (postarAgora) {
        if (feitos.length) msg = `Publicado no Instagram: ${feitos.join(" + ")}! 🎉`;
        if (processando) msg = `${msg ? msg + " " : ""}O vídeo está sendo processado pela Meta e será postado automaticamente em instantes — pode fechar a tela. ⏳`;
      } else if (rascunho) {
        msg = `Salvo (${feitos.join(" + ")})! Fica guardado em "Suas artes" pra postar quando quiser. 💾`;
      } else {
        msg = data ? `Agendado (${feitos.join(" + ")}) pra ${dataBR(`${data}T12:00:00-03:00`)}! 📅` : `Agendado: ${feitos.join(" + ")} (próxima data livre)! 📅`;
      }
      setOk(msg);
      setImagemUrl(""); setPosterUrl(""); setBriefVideo(""); setMidia("imagem"); setLegenda(""); setHashtags(""); setData(""); setOpcoes([]);
      limparPendente();
    }
    if (ultimoErro) setErro(ultimoErro);
    recarregar();
    router.refresh();
  }

  async function postarArte(a: ArteProntaView) {
    setProc(a.id); setResultado(null);
    if (a.videoUrl) {
      const pr = await postarVideoAgora(a.id);
      setProc("");
      if (pr.ok) setResultado({ tipo: "ok", txt: "Vídeo publicado! 🎉" });
      else if (pr.processando) setResultado({ tipo: "ok", txt: "Vídeo em processamento na Meta — será postado automaticamente em instantes. ⏳" });
      else setResultado({ tipo: "erro", txt: pr.erro || "Não consegui postar o vídeo." });
      recarregar(); router.refresh();
      return;
    }
    const post = await (a.formato === "story" ? postarStory(a.id) : postarPublicacao(a.id)).catch(() => ({ ok: false as const, erro: "Não consegui postar agora." }));
    setProc("");
    setResultado(post.ok ? { tipo: "ok", txt: a.formato === "story" ? "Story postado! 🎉" : "Post publicado! 🎉" } : { tipo: "erro", txt: post.erro });
    recarregar(); router.refresh();
  }
  async function excluir(a: ArteProntaView) {
    setProc(a.id);
    await excluirArtePronta(a.id).catch(() => null);
    setProc("");
    recarregar(); router.refresh();
  }

  return (
    <div>
      <div className="mb-5 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-4 sm:p-5">
        <p className="text-sm font-semibold text-white">🖼️ Minha arte</p>
        <p className="mt-1 text-xs text-muted">
          Já tem uma arte pronta — uma <strong className="text-white/80">imagem</strong> (promoção, convite, algo do Canva) ou um <strong className="text-white/80">vídeo</strong>? Suba aqui e poste <strong className="text-white/80">exatamente como você fez</strong> — a plataforma não mexe nela. Vídeo vai como <strong className="text-white/80">Reels</strong> (feed) ou <strong className="text-white/80">Story</strong>. A <strong className="text-white/80">Bia lê a arte</strong> e escreve a legenda combinando. 🤖
        </p>
      </div>

      {erro && <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}
      {ok && <p className="mb-4 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{ok}</p>}

      {/* 1) Enviar a arte */}
      <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">1 · Envie a arte ou o vídeo</p>
        {imagemUrl ? (
          <div className="mt-2 flex flex-wrap items-start gap-4">
            {midia === "video" ? (
              /* eslint-disable-next-line jsx-a11y/media-has-caption */
              <video src={imagemUrl} controls playsInline className="max-h-72 w-auto rounded-lg border border-linha bg-black object-contain" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imagemUrl} alt="Arte" className="max-h-72 w-auto rounded-lg border border-linha object-contain" />
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-linha px-3 py-2 text-xs text-muted transition hover:border-white/30 hover:text-white">
              🔄 Trocar
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-linha bg-preto p-8 text-center text-sm text-muted transition hover:border-[#7c3aed]">
            <span className="text-2xl">📤</span>
            <span className="font-semibold text-white/80">{subindo ? (progresso > 0 ? `Enviando vídeo… ${progresso}%` : "Enviando…") : "Toque pra enviar imagem ou vídeo"}</span>
            <span className="text-[11px] text-muted/70">Imagem: Story em 9:16, Feed em 4:5. Vídeo (MP4, até 120MB): 9:16 pro Story/Reels. Assim cabe inteiro, sem cortar.</span>
            <input type="file" accept="image/*,video/*" className="hidden" disabled={subindo} onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {imagemUrl && (
        <>
          {/* 2) Legenda (a Bia lê a arte) */}
          <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">2 · Legenda</p>
              <button type="button" onClick={lerArte} disabled={lendoArte} className="rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50">{lendoArte ? "🤖 Escrevendo…" : opcoes.length ? "🔄 Gerar de novo" : midia === "video" ? "🤖 A Bia escreve a legenda" : "🤖 A Bia lê a arte e escreve"}</button>
            </div>
            {midia === "video" && (
              <div className="mt-2">
                <label className="block text-[11px] font-semibold text-white/80">🎬 Do que é o vídeo? <span className="font-normal text-muted/70">(1 linha — a Bia escreve a legenda a partir disso)</span></label>
                <input type="text" value={briefVideo} onChange={(e) => setBriefVideo(e.target.value)} maxLength={200} placeholder="Ex: tour pelo buffet / promoção de aniversário / festa da Manu" className="input-base mt-1" />
                <p className="mt-1 text-[10px] text-muted/70">A Bia não consegue “assistir” ao vídeo pelo celular — por isso ela escreve a partir do que você contar aqui. No Story a legenda não aparece.</p>
              </div>
            )}

            {/* 3 opções da Bia — toque na que gostar (ela cai no campo abaixo, e dá pra ajustar) */}
            {opcoes.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {opcoes.map((o) => {
                  const escolhida = o.legenda === legenda;
                  const emoji = /simpl/i.test(o.nivel) ? "😊" : /top/i.test(o.nivel) ? "🌟" : "✨";
                  return (
                    <button key={o.nivel} type="button" onClick={() => usarOpcao(o)} className={`flex flex-col rounded-lg border p-2.5 text-left transition ${escolhida ? "border-[#ec4899] bg-[#ec4899]/10 ring-1 ring-[#ec4899]/40" : "border-linha bg-preto hover:border-white/30"}`}>
                      <span className="mb-1 flex items-center justify-between text-[11px] font-bold text-white">{emoji} {o.nivel}{escolhida && <span className="text-[9px] font-semibold text-[#f9a8d4]">✓ usando</span>}</span>
                      <span className="line-clamp-4 text-[11px] leading-snug text-muted">{o.legenda}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {opcoes.length > 0 && <p className="mt-1.5 text-[10px] text-muted/70">Toque na opção que você mais gostar — ela cai no campo abaixo, e você ainda pode ajustar. Ou toque em <strong className="text-white/70">🔄 Gerar de novo</strong> pra outras 3.</p>}

            <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={4} placeholder="Escreva a legenda (ou toque em 'A Bia lê a arte' pra ela escrever combinando com a imagem)" className="input-base mt-2 resize-y" />
            <textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} placeholder="#hashtags (opcional)" className="input-base mt-2 resize-y text-[#c7b2ff]" />
          </div>

          {/* 3) Formato + data */}
          <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">3 · Onde e quando</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFormato("story")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${formato === "story" ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white" : "border-linha text-muted hover:text-white"}`}>📲 Story (9:16)</button>
              <button type="button" onClick={() => setFormato("feed")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${formato === "feed" ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white" : "border-linha text-muted hover:text-white"}`}>{midia === "video" ? "🎬 Reels (feed)" : "🖼️ Feed (4:5)"}</button>
              <button type="button" onClick={() => setFormato("ambos")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${formato === "ambos" ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white" : "border-linha text-muted hover:text-white"}`}>📲🖼️ Os dois</button>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              <label className="min-w-0 flex-1 text-xs text-muted">
                Dia <span className="text-muted/70">(vazio = próxima data livre)</span>
                <InputDataBR value={data} onChange={setData} className="mt-1" />
              </label>
              <label className="text-xs text-muted sm:w-36 sm:shrink-0">
                Hora <span className="text-muted/70">(BRT)</span>
                <select value={hora} onChange={(e) => setHora(e.target.value)} style={{ WebkitAppearance: "none", appearance: "none", minWidth: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b9b9b9' stroke-width='1.5'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.6rem center", paddingRight: "1.6rem" }} className="input-base mt-1 w-full">
                  {HORAS_10.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => salvar("rascunho")} disabled={salvando} title="Só guarda a arte pra postar depois — não agenda nem posta" className="rounded-lg border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-4 py-2 text-sm font-semibold text-[#d6c6ff] transition hover:bg-[#7c3aed]/25 disabled:opacity-50">{salvando ? "…" : "💾 Salvar"}</button>
              <button type="button" onClick={() => salvar("agendar")} disabled={salvando} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-50">{salvando ? "…" : "📅 Agendar"}</button>
              <button type="button" onClick={() => salvar("postar")} disabled={salvando} className="rounded-lg bg-[#C13584] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">{salvando ? "Postando…" : "📲 Postar agora"}</button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted/70">A arte vai <strong className="text-white/70">exatamente como você enviou</strong>. No Story a legenda não aparece (o Instagram não mostra legenda em Story).{midia === "video" && <> Vídeo demora <strong className="text-white/70">~1 min</strong> pra processar na Meta ao postar.</>}</p>
          </div>
        </>
      )}

      {/* Artes já enviadas */}
      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Suas artes enviadas</p>
        {resultado && <p className={`mb-2 text-xs font-semibold ${resultado.tipo === "ok" ? "text-emerald-400" : "text-vermelho"}`}>{resultado.txt}</p>}
        {carregando ? (
          <p className="text-xs text-muted">Carregando…</p>
        ) : artes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-xs text-muted">Nenhuma arte enviada ainda. Suba a primeira acima. 👆</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {artes.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-xl border border-linha bg-preto-card">
                {a.videoUrl ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption */
                  <video src={a.videoUrl} controls playsInline className={`w-full bg-black object-contain ${a.formato === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
                ) : a.imagemUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.imagemUrl} alt="" className={`w-full bg-black object-contain ${a.formato === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
                ) : (
                  <div className={`flex w-full items-center justify-center bg-black text-center text-[10px] text-muted/70 ${a.formato === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`}>🎬 Vídeo postado<br />(arquivado)</div>
                )}
                <div className="p-2">
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-white/80">{a.formato === "story" ? "📲 Story" : a.videoUrl ? "🎬 Reels" : "🖼️ Feed"}</span>
                    <span className={`rounded-full px-1.5 py-0.5 font-bold ${a.postado ? "bg-sky-600 text-white" : a.status === "rascunho" ? "bg-[#7c3aed]/25 text-[#d6c6ff]" : "bg-amber-500/20 text-amber-300"}`}>{a.postado ? "📮 Postado" : a.status === "rascunho" ? "💾 Salvo" : `⏰ ${dataBR(a.dataISO)}`}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {!a.postado && <button type="button" onClick={() => postarArte(a)} disabled={proc === a.id} className="flex-1 rounded-md bg-[#C13584] px-2 py-1 text-[10px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">{proc === a.id ? "…" : "📲 Postar agora"}</button>}
                    <button type="button" onClick={() => excluir(a)} disabled={proc === a.id} title="Excluir" className="rounded-md border border-red-900/60 px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
