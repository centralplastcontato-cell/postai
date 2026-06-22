"use client";

// Aba REELS da Agenda: AGENDA e lista os vídeos de festa (Publicacao formato="reels").
// O vídeo NASCE na aba Páginas (escolher fotos → gerar); aqui você escolhe a festa com vídeo
// pronto, marca a data e agenda — igual as outras abas geram o seu tipo. O piloto posta via
// media_type=REELS quando chega a data (próximo passo).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type PublicacaoView } from "./publicacoes-aba";
import { InputDataBR } from "./input-data-br";
import { alternarAprovacao, excluirPublicacao } from "@/app/actions/feed";
import { agendarReelsDaFesta, gerarLegendaReels } from "@/app/actions/festas";

export type FestaComVideo = { id: string; nome: string; videoUrl: string };

function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

export function ReelsAba({ reels, festasComVideo }: { reels: PublicacaoView[]; festasComVideo: FestaComVideo[] }) {
  const router = useRouter();
  const [pend, startT] = useTransition();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  // agendador
  const [festaId, setFestaId] = useState("");
  const [dataISO, setDataISO] = useState("");
  const [legenda, setLegenda] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [gerandoLeg, setGerandoLeg] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [verUrl, setVerUrl] = useState<string | null>(null);

  async function agendar() {
    if (!festaId) { setMsg({ tipo: "erro", txt: "Escolha a festa." }); return; }
    if (!dataISO) { setMsg({ tipo: "erro", txt: "Escolha a data do post." }); return; }
    setAgendando(true); setMsg(null);
    const r = await agendarReelsDaFesta(festaId, dataISO, legenda).catch(() => ({ ok: false as const, erro: "Não deu pra agendar agora." }));
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
                  {festasComVideo.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-white">Data do post</label>
                <InputDataBR value={dataISO} onChange={setDataISO} className="mt-1" />
              </div>
            </div>
            {festaId && (
              <button type="button" onClick={() => { const f = festasComVideo.find((x) => x.id === festaId); if (f) setVerUrl(f.videoUrl); }} className="mt-2 text-xs font-semibold text-[#c7b2ff] transition hover:underline">▶ Ver o vídeo dessa festa</button>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-white">Legenda <span className="font-normal text-muted">(opcional)</span></label>
              <button type="button" onClick={escreverComBia} disabled={gerandoLeg || !festaId} className="rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-2.5 py-1 text-[11px] font-semibold text-[#c7b2ff] transition hover:bg-[#7c3aed]/20 disabled:opacity-40">{gerandoLeg ? "✨ Escrevendo…" : "✨ Escrever com a Bia"}</button>
            </div>
            <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={4} placeholder="Deixe em branco que eu escrevo uma — ou clique em ✨ Escrever com a Bia" className="input-base mt-1 w-full text-xs" />
            {msg && <p className={`mt-2 text-xs font-semibold ${msg.tipo === "ok" ? "text-green-400" : "text-vermelho"}`}>{msg.txt}</p>}
            <button onClick={agendar} disabled={agendando} className="mt-3 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-60">{agendando ? "Agendando…" : "📅 Agendar Reels"}</button>
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
                  <video src={r.videoUrl} controls playsInline className="h-40 w-24 shrink-0 rounded-lg bg-black object-cover" />
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
                  {!postado && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
    </div>
  );
}
