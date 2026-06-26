"use client";

// Aba REELS da Agenda: AGENDA e lista os vídeos de festa (Publicacao formato="reels").
// O vídeo NASCE na aba Páginas (escolher fotos → gerar); aqui você escolhe a festa com vídeo
// pronto, marca a data e agenda — igual as outras abas geram o seu tipo. O piloto posta via
// media_type=REELS quando chega a data (próximo passo).

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type PublicacaoView } from "./publicacoes-aba";
import { InputDataBR } from "./input-data-br";
import { alternarAprovacao, excluirPublicacao } from "@/app/actions/feed";
import { agendarReelsDaFesta, gerarLegendaReels, atualizarReels, postarReelsAgora } from "@/app/actions/festas";
import { rotuloHora } from "@/lib/horarios";

export type FestaComVideo = { id: string; nome: string; videoUrl: string; data: string; horario: string };

function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

// Rótulo da festa no seletor: "Samuel · 21/06 13:00" (nome + data e horário DA FESTA).
function festaLabel(f: FestaComVideo): string {
  const dia = new Date(f.data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  return `${f.nome} · ${dia}${f.horario ? ` ${f.horario}` : ""}`;
}

// ISO → "YYYY-MM-DD" (fuso SP) e a hora (0-23 SP) — pra pré-preencher a edição de um agendado.
function isoParaYMD(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function horaSP(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso))) % 24;
}

export function ReelsAba({ reels, festasComVideo, dataAlvo, horaPadrao }: { reels: PublicacaoView[]; festasComVideo: FestaComVideo[]; dataAlvo: string | null; horaPadrao: number }) {
  const router = useRouter();
  const [pend, startT] = useTransition();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  // edição de um Reels JÁ agendado (data, hora, legenda)
  const [editando, setEditando] = useState<string | null>(null);
  const [edData, setEdData] = useState("");
  const [edHora, setEdHora] = useState(horaPadrao);
  const [edLegenda, setEdLegenda] = useState("");
  // postar agora
  const [confirmarPostar, setConfirmarPostar] = useState<string | null>(null);
  const [postando, setPostando] = useState(false);
  const [resultadoPostar, setResultadoPostar] = useState<{ tipo: "ok" | "erro"; txt: string; link?: string | null } | null>(null);

  // agendador
  const [festaId, setFestaId] = useState("");
  const [dataISO, setDataISO] = useState(dataAlvo ?? "");
  const [hora, setHora] = useState(horaPadrao);
  // se o dono está olhando um dia X na agenda, a data do Reels acompanha (e dá pra trocar).
  useEffect(() => { if (dataAlvo) setDataISO(dataAlvo); }, [dataAlvo]);
  const [legenda, setLegenda] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [gerandoLeg, setGerandoLeg] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [verUrl, setVerUrl] = useState<string | null>(null);

  async function agendar() {
    if (!festaId) { setMsg({ tipo: "erro", txt: "Escolha a festa." }); return; }
    if (!dataISO) { setMsg({ tipo: "erro", txt: "Escolha a data do post." }); return; }
    setAgendando(true); setMsg(null);
    const r = await agendarReelsDaFesta(festaId, dataISO, legenda, hora).catch(() => ({ ok: false as const, erro: "Não deu pra agendar agora." }));
    setAgendando(false);
    if (!r.ok) { setMsg({ tipo: "erro", txt: r.erro || "Não deu pra agendar." }); return; }
    setMsg({ tipo: "ok", txt: "✓ Reels agendado! Aparece aqui embaixo." });
    setFestaId(""); setDataISO(""); setLegenda("");
    router.refresh();
  }
  async function escreverComBia() {
    if (!festaId) { setMsg({ tipo: "erro", txt: "Escolha a festa primeiro." }); return; }
    setGerandoLeg(true); setMsg(null);
    const r = await gerarLegendaReels(festaId).catch(() => ({ ok: false as const, erro: "Não consegui escrever agora." }));
    setGerandoLeg(false);
    if (!r.ok) { setMsg({ tipo: "erro", txt: r.erro || "Não consegui escrever." }); return; }
    setLegenda(r.legenda);
  }
  function aprovar(id: string) {
    setOcupadoId(id);
    startT(async () => { await alternarAprovacao(id).catch(() => {}); router.refresh(); setOcupadoId(null); });
  }
  function excluir(id: string) {
    setOcupadoId(id);
    startT(async () => { await excluirPublicacao(id).catch(() => {}); router.refresh(); setOcupadoId(null); });
  }
  function abrirEdicao(r: PublicacaoView) {
    setEditando(r.id);
    setEdData(isoParaYMD(r.data));
    setEdHora(horaSP(r.data));
    setEdLegenda(r.legenda);
  }
  function salvarEdicao(id: string) {
    if (!edData) return;
    setOcupadoId(id);
    startT(async () => { await atualizarReels(id, edData, edHora, edLegenda).catch(() => {}); router.refresh(); setOcupadoId(null); setEditando(null); });
  }
  async function postarAgora(id: string) {
    setPostando(true); setResultadoPostar(null);
    const r = await postarReelsAgora(id).catch(() => ({ ok: false as const, erro: "Não consegui postar agora." }));
    setPostando(false);
    if (!r.ok) { setResultadoPostar({ tipo: "erro", txt: r.erro || "Falhou ao postar." }); return; }
    setResultadoPostar({ tipo: "ok", txt: "Reels publicado no Instagram!", link: r.permalink });
    setConfirmarPostar(null);
    router.refresh();
  }

  // festas cujo Reels JÁ foi postado — pra marcar no seletor e não reagendar por engano.
  // cruza pelo nome no título do Reels ("Reels — Samuel" → "Samuel").
  const nomesPostados = new Set(
    reels.filter((r) => r.status === "postado").map((r) => (r.titulo || "").replace(/^Reels\s*[—–-]\s*/i, "").trim())
  );

  return (
    <div className="space-y-4">
      {/* AGENDADOR */}
      <div className="rounded-xl border border-linha bg-preto-card p-4">
        <p className="text-sm font-bold text-white">🎬 Agendar um Reels de festa</p>
        <p className="mt-0.5 text-xs text-muted">Escolha uma festa com vídeo pronto e marque a data. O vídeo é gerado na aba <strong className="text-white/80">📄 Páginas</strong>.</p>
        {festasComVideo.length === 0 ? (
          <p className="mt-3 rounded-lg border border-linha bg-preto px-3 py-2 text-xs text-muted">
            Nenhuma festa com vídeo pronto ainda. Vá em <strong className="text-white">📄 Páginas</strong>, escolha as fotos de uma festa e gere o vídeo.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-white">Festa</label>
                <select value={festaId} onChange={(e) => { setFestaId(e.target.value); setMsg(null); }} className="input-base mt-1 w-full text-sm">
                  <option value="">Escolha a festa…</option>
                  {festasComVideo.map((f) => <option key={f.id} value={f.id}>{festaLabel(f)}{nomesPostados.has(f.nome) ? "  ✅ já postado" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-white">Data e hora do post</label>
                <div className="mt-1 flex gap-2">
                  <InputDataBR value={dataISO} onChange={setDataISO} className="flex-1" />
                  <select value={hora} onChange={(e) => setHora(Number(e.target.value))} className="input-base w-24 text-sm" aria-label="Hora do post">
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {festaId && (
              <button type="button" onClick={() => { const f = festasComVideo.find((x) => x.id === festaId); if (f) setVerUrl(f.videoUrl); }} className="mt-2 text-xs font-semibold text-[#c7b2ff] transition hover:underline">▶ Ver o vídeo dessa festa</button>
            )}
            {festaId && nomesPostados.has(festasComVideo.find((f) => f.id === festaId)?.nome ?? "") && (
              <p className="mt-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400">✅ Essa festa já teve um Reels postado — só agende de novo se quiser repostar.</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-white">Legenda <span className="font-normal text-muted">(opcional)</span></label>
              <button type="button" onClick={escreverComBia} disabled={gerandoLeg || !festaId} className="rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-2.5 py-1 text-[11px] font-semibold text-[#c7b2ff] transition hover:bg-[#7c3aed]/20 disabled:opacity-40">{gerandoLeg ? "✨ Escrevendo…" : "✨ Escrever com a Bia"}</button>
            </div>
            <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={4} placeholder="Deixe em branco que eu escrevo uma — ou clique em ✨ Escrever com a Bia" className="input-base mt-1 w-full text-xs" />
            {msg && <p className={`mt-2 text-xs font-semibold ${msg.tipo === "ok" ? "text-green-400" : "text-vermelho"}`}>{msg.txt}</p>}
            <button onClick={agendar} disabled={agendando || !festaId || !dataISO} title={!festaId || !dataISO ? "Escolha a festa e a data" : ""} className="mt-3 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-50">{agendando ? "Salvando…" : "💾 Salvar e agendar Reels"}</button>
          </>
        )}
      </div>

      {/* LISTA dos agendados */}
      {reels.length === 0 ? (
        <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
          Nenhum Reels agendado ainda — use o quadro acima. ⬆️
        </div>
      ) : (
        <div className="space-y-3">
          {reels.map((r) => {
            const postado = r.status === "postado";
            const ocupado = ocupadoId === r.id && pend;
            return (
              <div key={r.id} className="flex gap-3 rounded-xl border border-linha bg-preto-card p-3">
                {r.videoUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={`${r.videoUrl}#t=0.5`} preload="metadata" controls playsInline className="h-40 w-24 shrink-0 rounded-lg bg-black object-cover" />
                ) : (
                  <div className="flex h-40 w-24 shrink-0 items-center justify-center rounded-lg bg-black text-2xl">🎬</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-white">{r.titulo}</p>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-[#7c3aed]/40 bg-[#7c3aed]/15 text-[#c7b2ff]"}`}>
                      {postado ? "✓ Postado" : "📅 Agendado"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{quando(r.data)}</p>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted">{r.legenda}</p>
                  {!postado && editando === r.id && (
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <InputDataBR value={edData} onChange={setEdData} className="flex-1" />
                        <select value={edHora} onChange={(e) => setEdHora(Number(e.target.value))} className="input-base w-24 text-sm" aria-label="Hora">
                          {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
                        </select>
                      </div>
                      <textarea value={edLegenda} onChange={(e) => setEdLegenda(e.target.value)} rows={3} className="input-base w-full text-xs" />
                      <div className="flex gap-1.5">
                        <button onClick={() => salvarEdicao(r.id)} disabled={ocupado} className="rounded-md bg-[#7c3aed] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-40">💾 Salvar</button>
                        <button onClick={() => setEditando(null)} disabled={ocupado} className="rounded-md border border-linha px-3 py-1 text-xs font-semibold text-muted transition hover:text-white disabled:opacity-40">Cancelar</button>
                      </div>
                    </div>
                  )}
                  {!postado && editando !== r.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button onClick={() => { setResultadoPostar(null); setConfirmarPostar(r.id); }} disabled={ocupado} className="rounded-md bg-[#C13584] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40">🎬 Postar agora</button>
                      <button onClick={() => abrirEdicao(r)} disabled={ocupado} className="rounded-md border border-linha px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-[#7c3aed] hover:text-white disabled:opacity-40">✏️ Editar</button>
                      <button onClick={() => aprovar(r.id)} disabled={ocupado} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${r.aprovado ? "bg-green-600 text-white hover:bg-green-500" : "border border-linha text-muted hover:border-green-500 hover:text-white"}`}>{r.aprovado ? "✓ Aprovado" : "Aprovar"}</button>
                      <button onClick={() => excluir(r.id)} disabled={ocupado} className="rounded-md border border-red-900 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">Excluir</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ver o vídeo */}
      {verUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setVerUrl(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={verUrl} controls playsInline className="max-h-[85vh] rounded-xl" />
            <button onClick={() => setVerUrl(null)} aria-label="Fechar" className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">✕</button>
          </div>
        </div>
      )}

      {/* confirmar postar agora */}
      {confirmarPostar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => !postando && setConfirmarPostar(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-bold text-white">🎬 Postar Reels agora?</p>
            <p className="mt-2 text-xs text-muted">Isso publica o vídeo <strong className="text-white">AGORA</strong> no Instagram da marca (perfil público). A Meta processa o vídeo primeiro, então pode levar até <strong className="text-white">1 minuto</strong>. ⏳</p>
            {resultadoPostar?.tipo === "erro" && <p className="mt-2 rounded-md border border-vermelho/30 bg-vermelho/10 px-2.5 py-1.5 text-xs text-vermelho">{resultadoPostar.txt}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarPostar(null)} disabled={postando} className="flex-1 rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-muted transition hover:text-white disabled:opacity-50">Cancelar</button>
              <button onClick={() => postarAgora(confirmarPostar)} disabled={postando} className="flex-1 rounded-lg bg-[#C13584] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{postando ? "Postando… ⏳" : "Sim, postar agora"}</button>
            </div>
          </div>
        </div>
      )}

      {/* sucesso do post */}
      {resultadoPostar?.tipo === "ok" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setResultadoPostar(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-green-500/30 bg-preto-card p-5 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 text-sm font-bold text-white">{resultadoPostar.txt}</p>
            {resultadoPostar.link && <a href={resultadoPostar.link} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-[#C13584] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90">Ver no Instagram ↗</a>}
            <button onClick={() => setResultadoPostar(null)} className="mt-3 block w-full rounded-lg border border-linha px-3 py-2 text-xs font-semibold text-muted transition hover:text-white">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
