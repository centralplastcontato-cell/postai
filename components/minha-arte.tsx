"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { gerarLegendaArte, criarArtePronta, listarArtesProntas, excluirArtePronta, postarPublicacao, postarStory, type ArteProntaView } from "@/app/actions/feed";
import { InputDataBR } from "@/components/input-data-br";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

// 🖼️ MINHA ARTE — o dono sobe uma arte PRONTA (feita fora, ex: promoção no Canva), a Bia lê a
// imagem e escreve a legenda combinando, e ele posta como Story/Feed (na hora ou agendado).
// A arte vai EXATAMENTE como ele fez (o render mostra a imagem inteira, sem template por cima).
export function MinhaArte({ marcaId }: { marcaId: string }) {
  const router = useRouter();
  const [imagemUrl, setImagemUrl] = useState("");
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState("");
  const [legenda, setLegenda] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [lendoArte, setLendoArte] = useState(false);
  const [formato, setFormato] = useState<"story" | "feed">("story");
  const [data, setData] = useState("");
  const [hora, setHora] = useState(10);
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

  async function handleUpload(file?: File) {
    if (!file) return;
    setErro(""); setOk(""); setSubindo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const d = await resp.json();
      if (d.ok && d.url) { setImagemUrl(d.url); setLegenda(""); setHashtags(""); }
      else setErro(d.erro || "Não consegui enviar a arte.");
    } catch { setErro("Não consegui enviar a arte. Tente de novo."); }
    setSubindo(false);
  }

  async function lerArte() {
    if (!imagemUrl) return;
    setErro(""); setLendoArte(true);
    const r = await gerarLegendaArte(marcaId, imagemUrl).catch(() => ({ ok: false as const, erro: "Não consegui ler a arte agora." }));
    setLendoArte(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLegenda(r.legenda);
    if (r.hashtags) setHashtags(r.hashtags);
  }

  // Cria a arte na agenda. Se postarAgora, já publica no Instagram na hora.
  async function salvar(postarAgora: boolean) {
    if (!imagemUrl) { setErro("Envie a arte primeiro."); return; }
    setErro(""); setOk(""); setSalvando(true);
    const legendaFinal = [legenda.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
    const r = await criarArtePronta(marcaId, imagemUrl, formato, data || undefined, hora, legendaFinal, "").catch(() => ({ ok: false as const, erro: "Não consegui salvar agora." }));
    if (!r.ok) { setSalvando(false); setErro(r.erro); return; }
    if (postarAgora) {
      const post = await (formato === "story" ? postarStory(r.id) : postarPublicacao(r.id)).catch(() => ({ ok: false as const, erro: "Salvei na agenda, mas não consegui postar agora." }));
      setSalvando(false);
      if (!post.ok) { setOk("Arte salva na agenda!"); setErro(post.erro); }
      else setOk(formato === "story" ? "Story postado no Instagram! 🎉" : "Post publicado no Instagram! 🎉");
    } else {
      setSalvando(false);
      setOk(data ? `Arte agendada pra ${dataBR(`${data}T12:00:00-03:00`)}! 📅` : "Arte salva na agenda (próxima data livre)! 📅");
    }
    setImagemUrl(""); setLegenda(""); setHashtags(""); setData("");
    recarregar();
    router.refresh();
  }

  async function postarArte(a: ArteProntaView) {
    setProc(a.id); setResultado(null);
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
          Já tem uma arte pronta (uma <strong className="text-white/80">promoção</strong>, um convite, algo feito no Canva)? Suba aqui e poste <strong className="text-white/80">exatamente como você fez</strong> — a plataforma não mexe nela. A <strong className="text-white/80">Bia lê a arte</strong> e escreve a legenda combinando. 🤖
        </p>
      </div>

      {erro && <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}
      {ok && <p className="mb-4 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{ok}</p>}

      {/* 1) Enviar a arte */}
      <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">1 · Envie a arte</p>
        {imagemUrl ? (
          <div className="mt-2 flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagemUrl} alt="Arte" className="max-h-72 w-auto rounded-lg border border-linha object-contain" />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-linha px-3 py-2 text-xs text-muted transition hover:border-white/30 hover:text-white">
              🔄 Trocar arte
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-linha bg-preto p-8 text-center text-sm text-muted transition hover:border-[#7c3aed]">
            <span className="text-2xl">📤</span>
            <span className="font-semibold text-white/80">{subindo ? "Enviando…" : "Toque pra enviar a arte"}</span>
            <span className="text-[11px] text-muted/70">Pro Story faça a arte em 9:16 (vertical); pro Feed em 4:5. Assim ela cabe inteira, sem cortar.</span>
            <input type="file" accept="image/*" className="hidden" disabled={subindo} onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {imagemUrl && (
        <>
          {/* 2) Legenda (a Bia lê a arte) */}
          <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">2 · Legenda</p>
              <button type="button" onClick={lerArte} disabled={lendoArte} className="rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50">{lendoArte ? "🤖 Lendo a arte…" : "🤖 A Bia lê a arte e escreve"}</button>
            </div>
            <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={4} placeholder="Escreva a legenda (ou toque em 'A Bia lê a arte' pra ela escrever combinando com a imagem)" className="input-base mt-2 resize-y" />
            <textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} placeholder="#hashtags (opcional)" className="input-base mt-2 resize-y text-[#c7b2ff]" />
          </div>

          {/* 3) Formato + data */}
          <div className="mb-4 rounded-xl border border-linha bg-preto-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">3 · Onde e quando</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFormato("story")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${formato === "story" ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white" : "border-linha text-muted hover:text-white"}`}>📲 Story (9:16)</button>
              <button type="button" onClick={() => setFormato("feed")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${formato === "feed" ? "border-[#7c3aed] bg-[#7c3aed]/20 text-white" : "border-linha text-muted hover:text-white"}`}>🖼️ Feed (4:5)</button>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              <label className="min-w-0 flex-1 text-xs text-muted">
                Dia <span className="text-muted/70">(vazio = próxima data livre)</span>
                <InputDataBR value={data} onChange={setData} className="mt-1" />
              </label>
              <label className="text-xs text-muted sm:w-36 sm:shrink-0">
                Hora <span className="text-muted/70">(BRT)</span>
                <select value={hora} onChange={(e) => setHora(Number(e.target.value))} style={{ WebkitAppearance: "none", appearance: "none", minWidth: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b9b9b9' stroke-width='1.5'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.6rem center", paddingRight: "1.6rem" }} className="input-base mt-1 w-full">
                  {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => salvar(false)} disabled={salvando} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-50">{salvando ? "Salvando…" : "📅 Agendar"}</button>
              <button type="button" onClick={() => salvar(true)} disabled={salvando} className="rounded-lg bg-[#C13584] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">{salvando ? "Postando…" : "📲 Postar agora"}</button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted/70">A arte vai <strong className="text-white/70">exatamente como você enviou</strong>. No Story a legenda não aparece na imagem (o Instagram não mostra legenda em Story).</p>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.imagemUrl} alt="" className={`w-full bg-black object-contain ${a.formato === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
                <div className="p-2">
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-white/80">{a.formato === "story" ? "📲 Story" : "🖼️ Feed"}</span>
                    <span className={`rounded-full px-1.5 py-0.5 font-bold ${a.postado ? "bg-sky-600 text-white" : "bg-amber-500/20 text-amber-300"}`}>{a.postado ? "📮 Postado" : `⏰ ${dataBR(a.dataISO)}`}</span>
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
