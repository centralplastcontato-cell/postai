"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarMascote, definirMascote, removerMascote, excluirMascoteArte, usarImagemComoMascote, removerFundoMascote, gerarFicha3d } from "@/app/actions/mascote";

const FICHA_LABELS = ["Frente", "Lado", "Costas"];

// 🦸 ESTÚDIO DO MASCOTE (Fase 1): o dono gera opções em 3D fofo, escolhe uma e ela vira o
// mascote OFICIAL da marca. Depois (Fases 2/3) esse MESMO mascote é colado nos posts/vídeos.

export function MascoteEstudio({
  marcaId,
  mascoteUrl,
  mascotes,
  ficha3d,
}: {
  marcaId: string;
  mascoteUrl: string; // mascote oficial atual ("" = nenhum)
  mascotes: string[]; // biblioteca de opções geradas
  ficha3d?: string; // ficha do personagem (frente/lado/costas) pro 3D ("" = não gerada)
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gerando, setGerando] = useState(false);
  const [proc, setProc] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [referenciaUrl, setReferenciaUrl] = useState("");
  const [subindoRef, setSubindoRef] = useState(false);

  function handleGerar() {
    setErro(null);
    setGerando(true);
    startTransition(async () => {
      const r = await gerarMascote(marcaId, descricao.trim() || undefined, referenciaUrl || undefined);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setGerando(false);
    });
  }
  function handleUsarReferencia() {
    if (!referenciaUrl) return;
    setErro(null);
    setProc("usar-ref");
    startTransition(async () => {
      const r = await usarImagemComoMascote(marcaId, referenciaUrl);
      if (!r.ok) setErro(r.erro);
      else setReferenciaUrl("");
      router.refresh();
      setProc(null);
    });
  }
  async function handleUploadRef(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setSubindoRef(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok) setReferenciaUrl(data.url);
      else setErro(data.erro || "Falha ao enviar a imagem de referência.");
    } catch {
      setErro("Falha ao enviar a imagem. Tente de novo.");
    } finally {
      setSubindoRef(false);
    }
  }
  function handleEscolher(url: string) {
    setErro(null);
    setProc(url);
    startTransition(async () => {
      const r = await definirMascote(marcaId, url);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleRemover() {
    setErro(null);
    setProc("remover");
    startTransition(async () => {
      const r = await removerMascote(marcaId);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  // Ficha 3D: novo formato é JSON [frente, lado, costas]; formato antigo era 1 URL só.
  const fichaUrls: string[] = (() => {
    if (!ficha3d) return [];
    if (ficha3d.startsWith("[")) { try { const a = JSON.parse(ficha3d); return Array.isArray(a) ? a.filter((u): u is string => typeof u === "string" && u.startsWith("http")) : []; } catch { return []; } }
    return [ficha3d];
  })();
  const [gerandoFicha, setGerandoFicha] = useState(false);
  function handleFicha3d() {
    setErro(null);
    setGerandoFicha(true);
    startTransition(async () => {
      const r = await gerarFicha3d(marcaId);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setGerandoFicha(false);
    });
  }
  function handleRemoverFundo() {
    if (!mascoteUrl) return;
    setErro(null);
    setProc("fundo");
    startTransition(async () => {
      const r = await removerFundoMascote(marcaId, mascoteUrl);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleExcluir(url: string) {
    setErro(null);
    setProc(url);
    startTransition(async () => {
      const r = await excluirMascoteArte(marcaId, url);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }

  // Fundo quadriculado (mostra que o PNG é transparente).
  const xadrez = {
    backgroundColor: "#2a2a2a",
    backgroundImage:
      "linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)",
    backgroundSize: "22px 22px",
    backgroundPosition: "0 0, 0 11px, 11px -11px, -11px 0",
  } as const;

  return (
    <div>
      {ampliada && (
        <div onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div style={xadrez} className="rounded-lg border border-linha">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada} alt="Mascote" className="h-auto max-h-[85vh] w-auto max-w-[90vw]" />
          </div>
          <button onClick={() => setAmpliada(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-4 sm:p-5">
        <p className="text-sm font-semibold text-white">🦸 Estúdio do Mascote</p>
        <p className="mt-1 text-xs text-muted">
          Crie o mascote da marca em <strong className="text-white/80">3D fofo</strong>. Você gera opções, escolhe uma e ela vira o <strong className="text-white/80">mascote oficial</strong> — sempre o mesmo, pra usar nos posts e vídeos. É a base perfeita pra fazer ele em 3D depois.
        </p>
      </div>

      {erro && <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

      {/* Mascote oficial atual */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Mascote oficial da marca</p>
        {mascoteUrl ? (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setAmpliada(mascoteUrl)} style={xadrez} className="overflow-hidden rounded-xl border-2 border-[#7c3aed]" title="Ampliar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mascoteUrl} alt="Mascote oficial" className="h-48 w-auto object-contain" />
            </button>
            <div className="flex flex-col gap-2">
              <span className="rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">✓ Esse é o mascote ativo</span>
              <button type="button" onClick={handleRemoverFundo} disabled={isPending} title="Tira o fundo (deixa transparente) pra colar limpo nos posts" className="rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">{proc === "fundo" ? "🪄 Tirando o fundo…" : "🪄 Deixar fundo transparente"}</button>
              <button type="button" onClick={handleRemover} disabled={isPending} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">Tirar mascote ativo</button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-linha bg-preto-card p-6 text-center text-sm text-muted">
            Ainda não tem mascote escolhido. Gere opções abaixo e toque na que você mais gostar. 👇
          </div>
        )}
      </div>

      {/* Imagem de referência (opcional) — a IA cria o mascote baseado nela */}
      <div className="mb-3">
        <p className="text-xs text-muted">Imagem de referência <span className="text-muted/70">(opcional — um rascunho ou inspiração; a IA cria o mascote baseado nela)</span></p>
        {referenciaUrl ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={referenciaUrl} alt="Referência" className="h-20 w-20 rounded-lg border border-linha object-cover" />
              <div className="flex flex-col gap-2">
                <button type="button" onClick={handleUsarReferencia} disabled={isPending} className="rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">✅ Usar esta imagem como mascote</button>
                <button type="button" onClick={() => setReferenciaUrl("")} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:border-vermelho hover:text-white">Remover referência</button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted/70">Use direto a sua imagem (sem a IA recriar) — ou gere versões 3D baseadas nela no botão abaixo.</p>
          </>
        ) : (
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border border-linha px-3 py-2 text-xs text-muted transition hover:border-[#7c3aed] hover:text-white">
            {subindoRef ? "Enviando…" : "📎 Enviar imagem de referência"}
            <input type="file" accept="image/*" className="hidden" disabled={subindoRef} onChange={(e) => handleUploadRef(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* Descrição do mascote (opcional) */}
      <label className="mb-3 block text-xs text-muted">
        Descreva seu mascote <span className="text-muted/70">(opcional — se deixar vazio, a IA sugere conceitos variados)</span>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ex: um dragãozinho verde fofo com uma coroa e capa vermelha, segurando um balão"
          className="input-base mt-1 resize-y"
        />
        <span className="mt-0.5 block text-[10px] text-muted/70">Quando você descreve, a IA cria 3 versões da SUA ideia (variando a pose).</span>
      </label>

      {/* Gerar opções */}
      <button
        type="button"
        onClick={handleGerar}
        disabled={gerando || isPending}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {gerando ? "🎨 Criando opções… (uns segundos)" : descricao.trim() || referenciaUrl ? "✨ Gerar meu mascote" : mascotes.length ? "✨ Gerar mais opções" : "✨ Gerar opções de mascote"}
      </button>

      {/* Biblioteca de opções */}
      {mascotes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Suas opções — toque pra escolher o oficial</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mascotes.map((url) => {
              const ativo = url === mascoteUrl;
              return (
                <div key={url} className={`relative flex flex-col overflow-hidden rounded-xl border ${ativo ? "border-[#7c3aed] ring-2 ring-[#7c3aed]/50" : "border-linha"}`}>
                  <button type="button" onClick={() => handleExcluir(url)} disabled={isPending} title="Excluir esta opção" className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/55 px-2 py-0.5 text-sm font-bold text-red-300 transition hover:bg-red-900/70 hover:text-white disabled:opacity-40">✕</button>
                  <button type="button" onClick={() => setAmpliada(url)} style={xadrez} className="block" title="Ampliar">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Opção de mascote" className="h-44 w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEscolher(url)}
                    disabled={isPending || ativo}
                    className={`py-2 text-xs font-semibold transition disabled:opacity-60 ${ativo ? "bg-[#7c3aed]/20 text-[#c7b2ff]" : "bg-preto-card text-muted hover:bg-[#7c3aed] hover:text-white"}`}
                  >
                    {ativo ? "✓ Oficial" : proc === url ? "Salvando…" : "Usar este"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-muted">
        Dica: gere quantas vezes quiser até achar o mascote perfeito — as opções ficam salvas aqui. O mascote escolhido já pode entrar nos <strong className="text-white/80">posts</strong> e nos <strong className="text-white/80">vídeos</strong>.
      </p>

      {/* FASE 4 — Ficha pro 3D (só quando há mascote oficial) */}
      {mascoteUrl && (
        <div className="mt-7 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">🧊 Ficha pro 3D <span className="ml-1 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c7b2ff]">pra vender nas festas</span></p>
          <p className="mt-1 text-xs text-muted">
            Gera uma <strong className="text-white/80">prancha de referência</strong> do mascote em 3 vistas — <strong className="text-white/80">frente, lado e costas</strong>. É o material que um artista ou serviço de 3D usa pra modelar o boneco.
          </p>

          {erro && <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

          {fichaUrls.length > 0 && (
            <div className={`mt-3 grid gap-3 ${fichaUrls.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
              {fichaUrls.map((url, i) => {
                // Ficha única = as 3 vistas numa imagem só (mantém a coroa igual entre elas).
                const rotulo = fichaUrls.length === 1 ? "Ficha — frente, lado e costas" : (FICHA_LABELS[i] || `Vista ${i + 1}`);
                const nomeArquivo = fichaUrls.length === 1 ? "mascote-ficha-3d.png" : `mascote-${(FICHA_LABELS[i] || `vista-${i + 1}`).toLowerCase()}.png`;
                return (
                  <div key={url} className="overflow-hidden rounded-lg border border-linha">
                    <button type="button" onClick={() => setAmpliada(url)} className="block w-full transition hover:opacity-90" title="Ampliar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={rotulo} className="w-full object-contain" />
                    </button>
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-[11px] font-semibold text-muted">{rotulo}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" download={nomeArquivo} className="text-[11px] font-semibold text-[#c7b2ff] hover:underline">⬇ Baixar</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFicha3d}
              disabled={gerandoFicha || isPending}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {gerandoFicha ? "🧊 Criando a ficha… (uns segundos)" : fichaUrls.length ? "🔄 Gerar de novo" : "🧊 Gerar ficha pro 3D"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted/70">A IA desenha as 3 vistas (frente, lado e costas) numa <strong className="text-white/70">imagem só</strong> — assim a coroa/bandeira fica igual entre elas. É uma referência pro 3D, não a peça final. A bandeira sai branca (o logo de verdade o 3D coloca depois).</p>
        </div>
      )}
    </div>
  );
}
