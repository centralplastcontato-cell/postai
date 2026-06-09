"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPublicacao,
  regerarPublicacao,
  postarPublicacao,
  excluirPublicacao,
  gerarImagemPublicacao,
  definirImagemPublicacao,
  removerImagemPublicacao,
} from "@/app/actions/feed";
import { TEMPLATES, TEMPLATE_LABEL, type Template } from "@/lib/feed-templates";
import { dataComemorativaDe } from "@/lib/datas-comemorativas";
import { ConfirmDialog } from "./confirm-dialog";

type Confirmacao = { titulo: string; descricao?: string; textoConfirmar: string; acao: () => void };

export type PublicacaoView = {
  id: string;
  slug: string;
  data: string;
  template: string;
  titulo: string;
  texto: string;
  legenda: string;
  hashtags: string;
  imagemUrl: string | null;
  status: string;
  tema: string | null;
};

function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function PublicacoesAba({
  marcaId,
  publicacoes,
  destacarId,
  dataAlvo,
  onGerado,
}: {
  marcaId: string;
  publicacoes: PublicacaoView[];
  destacarId?: string | null;
  dataAlvo?: string | null;
  onGerado?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [template, setTemplate] = useState<Template>("dica");
  const [tema, setTema] = useState("");
  const [oferta, setOferta] = useState("");
  const [validade, setValidade] = useState("");
  const [inclui, setInclui] = useState("");
  const [regras, setRegras] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [legendaAbertaId, setLegendaAbertaId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const comemorativa = dataAlvo ? dataComemorativaDe(dataAlvo) : null;

  function usarTemplateData() {
    if (!comemorativa) return;
    setTemplate("data-comemorativa");
    if (comemorativa.sugestao) setTema(comemorativa.sugestao);
  }

  function handleGerar() {
    setErro(null);
    startTransition(async () => {
      const itens = inclui.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await gerarPublicacao({ marcaId, template, tema, data: dataAlvo ?? undefined, oferta, validade, inclui: itens, regras });
      if (r.ok) {
        setTema("");
        setOferta("");
        setValidade("");
        setInclui("");
        setRegras("");
        onGerado?.();
        router.refresh();
      } else setErro(r.erro);
    });
  }
  function handleRegerar(id: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await regerarPublicacao(id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleExcluir(id: string) {
    setConfirmacao({
      titulo: "Excluir esta publicação?",
      descricao: "A ação não pode ser desfeita.",
      textoConfirmar: "Excluir",
      acao: () =>
        startTransition(async () => {
          const r = await excluirPublicacao(id);
          if (!r.ok) setErro(r.erro);
          router.refresh();
        }),
    });
  }
  function handlePostar(p: PublicacaoView) {
    setConfirmacao({
      titulo: "Postar no Instagram agora?",
      descricao: `"${p.titulo}" vai ao ar de verdade no perfil da marca.`,
      textoConfirmar: "Postar agora",
      acao: async () => {
        setProc(p.id);
        try {
          const r = await postarPublicacao(p.id);
          if (!r.ok) setErro(r.erro);
          router.refresh();
        } finally {
          setProc(null);
        }
      },
    });
  }
  function handleGerarImagem(id: string) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await gerarImagemPublicacao({ id });
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  async function handleUpload(id: string, file: File | undefined) {
    if (!file) return;
    setProc(id);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Falha no upload.");
        return;
      }
      const r = await definirImagemPublicacao({ id, url: data.url });
      if (!r.ok) setErro(r.erro);
      router.refresh();
    } finally {
      setProc(null);
    }
  }
  function handleRemoverImagem(id: string) {
    setProc(id);
    startTransition(async () => {
      const r = await removerImagemPublicacao(id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function copiar(p: PublicacaoView) {
    navigator.clipboard.writeText(`${p.legenda}\n\n${p.hashtags}`);
    setCopiadoId(p.id);
    setTimeout(() => setCopiadoId(null), 2000);
  }

  return (
    <div>
      {imgExpandida && (
        <div onClick={() => setImgExpandida(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgExpandida} alt="Arte" className="h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-lg border border-linha" />
          <button onClick={() => setImgExpandida(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="mb-1 text-sm font-semibold text-white">Gerar publicação (feed) com IA</p>
        <p className="mb-3 text-xs text-muted">Post de imagem única, no tom da marca. Sem escolher dia, cai na próxima data livre da agenda.</p>

        <div className="mb-3 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t} type="button" onClick={() => setTemplate(t)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${template === t ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`}>
              {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="mb-3 text-xs text-muted">
          Dia do post
          <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
            {dataAlvo ? (
              <span className="font-semibold text-white">📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)}</span>
            ) : (
              <span className="text-muted">Clique num dia livre no calendário ↑ (senão, vai pra próxima data livre da agenda)</span>
            )}
          </div>
        </div>

        {comemorativa && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-yellow-400/40 bg-yellow-400/5 px-3 py-2.5">
            <span className="text-sm text-yellow-100">
              {comemorativa.emoji} Esse dia é <strong className="font-semibold text-yellow-200">{comemorativa.nome}</strong>. Quer fazer um post da data?
            </span>
            {template === "data-comemorativa" ? (
              <span className="text-xs font-semibold text-green-300">✓ usando o template de data comemorativa</span>
            ) : (
              <button type="button" onClick={usarTemplateData} className="rounded-md border border-yellow-400/60 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-100 transition hover:bg-yellow-400/20">
                🥳 Usar template Data Comemorativa
              </button>
            )}
          </div>
        )}

        {template === "promocao" && (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              Oferta / destaque
              <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex: 20% OFF, 10 crianças grátis" className="input-base" />
            </label>
            <label className="text-xs text-muted">
              Validade / condição
              <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: Válido até 30/06" className="input-base" />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              O que está incluso <span className="text-muted/70">(um item por linha — aparece como lista na arte)</span>
              <textarea value={inclui} onChange={(e) => setInclui(e.target.value)} rows={4} placeholder={"Ex:\n2h de salão\nMonitor incluso\nDecoração temática"} className="input-base resize-y" />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              Regras / condições <span className="text-muted/70">(letras miúdas no rodapé)</span>
              <input value={regras} onChange={(e) => setRegras(e.target.value)} placeholder="Ex: Válido seg a qui, mediante reserva, não cumulativo" className="input-base" />
            </label>
            <p className="text-[11px] text-amber-400/90 sm:col-span-2">⚠ Oferta vazia: a IA sugere — confira antes de postar. Itens inclusos e regras são só seus (a IA não inventa).</p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs text-muted">
            Assunto (opcional — se vazio, a IA escolhe)
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: novidade da semana" className="input-base" />
          </label>
          <button onClick={handleGerar} disabled={isPending} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar"}
          </button>
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      </div>

      {publicacoes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhuma publicação ainda. Escolha um template acima e clique em Gerar.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publicacoes.map((p) => {
            const v = hashCurto(`${p.titulo}|${p.texto}|${p.imagemUrl ?? ""}`);
            const arte = `/api/feed/${p.id}?v=${v}`;
            const postado = p.status === "postado";
            const ocupado = proc === p.id;
            return (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-preto-card p-3 ${destacarId === p.id ? "border-sky-500 ring-2 ring-sky-500/50" : "border-linha"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{dataBR(p.data)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "Postado" : "A postar"}</span>
                </div>
                <button type="button" onClick={() => setImgExpandida(arte)} title="Ampliar" className="overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={arte} alt={p.titulo} className="aspect-[4/5] w-full object-cover" />
                </button>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">{TEMPLATE_LABEL[p.template as Template] ?? p.template}</p>
                <p className="line-clamp-2 text-sm text-white">{p.titulo}</p>

                <div className="mt-2">
                  <button type="button" onClick={() => setLegendaAbertaId((c) => (c === p.id ? null : p.id))} className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted transition hover:text-white">
                    <span>{legendaAbertaId === p.id ? "▾" : "▸"}</span> Legenda + hashtags
                  </button>
                  {legendaAbertaId === p.id && (
                    <pre className="scroll-bonito mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-linha bg-preto p-2.5 text-xs text-white">{p.legenda}{p.hashtags ? `\n\n${p.hashtags}` : ""}</pre>
                  )}
                </div>

                {ocupado && <p className="mt-1 text-[11px] text-muted">Processando…</p>}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button onClick={() => handleRegerar(p.id)} disabled={ocupado} title="Regerar texto" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻ Regerar</button>
                  <a href={arte} download={`feed-${p.slug}.png`} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">⬇ Baixar</a>
                  <button onClick={() => copiar(p)} className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{copiadoId === p.id ? "✓ Copiado" : "Copiar texto"}</button>
                  <button onClick={() => handleGerarImagem(p.id)} disabled={ocupado} title="Gerar foto de fundo com IA" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🖼️ IA</button>
                  <label className="cursor-pointer rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">
                    📤 Foto
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(p.id, e.target.files?.[0])} />
                  </label>
                  {p.imagemUrl && (
                    <button onClick={() => handleRemoverImagem(p.id)} disabled={ocupado} title="Remover foto de fundo" className="rounded-md border border-linha px-2 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">✕ Foto</button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!postado && (
                    <button onClick={() => handlePostar(p)} disabled={ocupado} className="rounded-md bg-[#C13584] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📷 Postar</button>
                  )}
                  <button onClick={() => handleExcluir(p.id)} disabled={ocupado} className="rounded-md border border-red-900 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={!!confirmacao}
        titulo={confirmacao?.titulo ?? ""}
        descricao={confirmacao?.descricao}
        textoConfirmar={confirmacao?.textoConfirmar ?? "Confirmar"}
        onConfirmar={() => {
          confirmacao?.acao();
          setConfirmacao(null);
        }}
        onCancelar={() => setConfirmacao(null)}
      />
    </div>
  );
}
