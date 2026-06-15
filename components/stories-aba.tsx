"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPublicacao,
  postarStory,
  regerarPublicacao,
  reagendarPublicacao,
  alternarAprovacao,
  excluirPublicacao,
} from "@/app/actions/feed";
import { type Template } from "@/lib/feed-templates";
import { type PublicacaoView } from "./publicacoes-aba";
import { ConfirmDialog } from "./confirm-dialog";
import { CaixaPostando } from "./caixa-postando";

// Templates que fazem sentido pro Story (vertical, chamativo). Promoção mostra o selo
// de oferta; os demais usam só título + texto. Tudo renderizado em 9:16.
const TEMPLATES_STORY: { v: string; nome: string; oferta?: boolean }[] = [
  { v: "promocao", nome: "🎉 Promoção", oferta: true },
  { v: "divulgacao", nome: "🏆 Divulgação" },
  { v: "data-comemorativa", nome: "🎈 Data comemorativa" },
  { v: "dica", nome: "💡 Dica" },
];

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short" });
}
function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  const dm = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).replace(".", "");
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dm} às ${hm}`;
}
function horaSP(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso));
  return parseInt(h, 10) || 0;
}
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function chaveDiaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function StoriesAba({
  marcaId,
  stories,
  dataAlvo,
  horaPadrao,
  onGerado,
  onLimparDia,
}: {
  marcaId: string;
  stories: PublicacaoView[];
  dataAlvo: string | null;
  horaPadrao: number;
  onGerado: (dia?: string) => void;
  onLimparDia?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tema, setTema] = useState("");
  const [template, setTemplate] = useState("promocao");
  const [oferta, setOferta] = useState("");
  const [validade, setValidade] = useState("");
  const [hora, setHora] = useState(horaPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);
  const [postando, setPostando] = useState(false);
  const [postandoId, setPostandoId] = useState<string | null>(null);
  const [postarAlvo, setPostarAlvo] = useState<PublicacaoView | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<PublicacaoView | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);

  const ehPromo = TEMPLATES_STORY.find((t) => t.v === template)?.oferta;
  const filtrados = dataAlvo ? stories.filter((s) => chaveDiaSP(s.data) === dataAlvo) : stories;

  // ?v= por story (fura cache da arte quando o conteúdo muda).
  const verStory = (s: PublicacaoView) => `/api/story/${s.id}?v=${hashCurto(`${s.titulo}|${s.texto}|${s.imagemUrl ?? ""}|${s.extra ?? ""}`)}`;

  function handleGerar() {
    setErro(null);
    if (!dataAlvo) {
      setErro("Clique num dia no calendário pra escolher a data do Story.");
      return;
    }
    startTransition(async () => {
      const r = await gerarPublicacao({
        marcaId,
        template: template as Template,
        tema,
        data: dataAlvo,
        hora,
        formato: "story",
        oferta: ehPromo ? oferta : undefined,
        validade: ehPromo ? validade : undefined,
      });
      if (r.ok) {
        setTema("");
        setOferta("");
        setValidade("");
        onGerado(r.dia ?? dataAlvo ?? undefined);
        router.refresh();
      } else setErro(r.erro);
    });
  }

  function handleReagendar(id: string, h: number) {
    setErro(null);
    setProc(id);
    startTransition(async () => {
      const r = await reagendarPublicacao(id, h);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function handleAprovar(s: PublicacaoView) {
    setProc(s.id);
    startTransition(async () => {
      await alternarAprovacao(s.id);
      router.refresh();
      setProc(null);
    });
  }
  function handleRegerar(s: PublicacaoView) {
    setErro(null);
    setProc(s.id);
    startTransition(async () => {
      const r = await regerarPublicacao(s.id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  async function confirmarPostar(s: PublicacaoView) {
    setErro(null);
    setPostando(true);
    setPostandoId(s.id);
    try {
      const r = await postarStory(s.id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    } finally {
      setPostando(false);
      setPostandoId(null);
    }
  }
  function confirmarExcluir(s: PublicacaoView) {
    setProc(s.id);
    startTransition(async () => {
      const r = await excluirPublicacao(s.id);
      if (!r.ok) setErro(r.erro);
      router.refresh();
      setProc(null);
    });
  }
  function copiar(s: PublicacaoView) {
    navigator.clipboard.writeText(`${s.legenda}\n\n${s.hashtags}`);
    setCopiadoId(s.id);
    setTimeout(() => setCopiadoId((c) => (c === s.id ? null : c)), 1500);
  }

  return (
    <div>
      {imgExpandida && (
        <div onClick={() => setImgExpandida(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgExpandida} alt="Story" className="h-auto max-h-[90vh] w-auto rounded-lg border border-linha" />
          <button onClick={() => setImgExpandida(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-preto-card px-3 py-1 text-lg text-white transition hover:bg-vermelho">✕</button>
        </div>
      )}

      {/* Gerar Story */}
      <div className="mb-8 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="mb-1 text-sm font-semibold text-white">🟣 Gerar Story com IA <span className="font-normal text-muted">— formato vertical (9:16), tela cheia</span></p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEMPLATES_STORY.map((t) => (
            <button key={t.v} type="button" onClick={() => setTemplate(t.v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${template === t.v ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>
              {t.nome}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs text-muted">
            Tema
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: vagas de julho abertas" className="input-base" />
          </label>
          <div className="text-xs text-muted">
            Dia
            <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
              {dataAlvo ? <span className="font-semibold text-white">📅 {dataBR(`${dataAlvo}T12:00:00-03:00`)}</span> : <span className="text-muted">Clique num dia ↑</span>}
            </div>
          </div>
          <label className="text-xs text-muted">
            Hora <span className="text-muted/70">(BRT)</span>
            <select value={hora} onChange={(e) => setHora(Number(e.target.value))} className="input-base">
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </label>
          <button onClick={handleGerar} disabled={isPending || !tema.trim()} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar Story"}
          </button>
        </div>
        {ehPromo && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-xs text-muted">
              Oferta em destaque <span className="text-muted/70">(opcional)</span>
              <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex: 10 CRIANÇAS GRÁTIS" className="input-base" />
            </label>
            <label className="flex-1 text-xs text-muted">
              Validade <span className="text-muted/70">(opcional)</span>
              <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: 30/06" className="input-base" />
            </label>
          </div>
        )}
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
        <p className="mt-2 text-[11px] text-muted">O Story some sozinho em 24h no Instagram — perfeito pra novidades e urgência.</p>
      </div>

      {stories.length > 0 && (
        <div className="mb-3 text-xs text-muted">{filtrados.length} {filtrados.length === 1 ? "story" : "stories"}{dataAlvo ? " nesse dia" : ""}</div>
      )}

      {stories.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum Story ainda. Escolha um modelo e um tema acima e clique em Gerar Story.</p>
      ) : filtrados.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum Story nesse dia. <button type="button" onClick={() => onLimparDia?.()} className="font-semibold text-orange-300 underline">Ver todos</button> ou gere um acima.</p>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtrados.map((s) => {
            const postado = s.status === "postado";
            const ocupado = isPending || proc === s.id || postando;
            return (
              <div key={s.id} className="flex flex-col rounded-xl border border-linha bg-preto-card p-2.5">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted">{dataBR(s.data)}</span>
                    {!postado && (
                      <select value={horaSP(s.data)} onChange={(e) => handleReagendar(s.id, Number(e.target.value))} disabled={ocupado} title="Hora da postagem" className="rounded border border-linha bg-preto px-1 py-0.5 text-[10px] text-white transition hover:border-vermelho disabled:opacity-40">
                        {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>🕐 {String(h).padStart(2, "0")}h</option>)}
                      </select>
                    )}
                  </div>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "Postado" : "A postar"}</span>
                </div>
                <div className="relative">
                  <button type="button" onClick={() => setImgExpandida(verStory(s))} title="Ampliar" className="block w-full overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={verStory(s)} alt={s.titulo} className="aspect-[9/16] w-full object-cover" />
                  </button>
                  {postandoId === s.id && <CaixaPostando redes="no Instagram (Story)" />}
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-white">{s.titulo}</p>
                {postado && s.postadoEm && <p className="mt-1 text-[10px] text-green-400/80">📢 {dataHoraBR(s.postadoEm)}</p>}

                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => handleAprovar(s)} disabled={ocupado} title="Revisão interna" className={`rounded px-1.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${s.aprovado ? "bg-green-600 text-white" : "border border-linha text-muted hover:text-white"}`}>{s.aprovado ? "✓" : "Aprovar"}</button>
                  {s.tema && <button onClick={() => handleRegerar(s)} disabled={ocupado} title="Regerar texto" className="rounded border border-linha px-1.5 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻</button>}
                  <button onClick={() => copiar(s)} className="rounded border border-linha px-1.5 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white">{copiadoId === s.id ? "✓" : "Copiar"}</button>
                  {!postado && <button onClick={() => setPostarAlvo(s)} disabled={postando} className="rounded bg-[#C13584] px-1.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📲 Story</button>}
                  <button onClick={() => setExcluirAlvo(s)} disabled={ocupado} title="Excluir" className="rounded border border-red-900 px-1.5 py-1 text-[11px] text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={!!postarAlvo}
        titulo="Postar no seu Story do Instagram agora?"
        descricao={postarAlvo ? `"${postarAlvo.titulo}" vai pro seu Story de verdade (some em 24h).` : undefined}
        textoConfirmar="Postar Story"
        onConfirmar={() => {
          if (postarAlvo) confirmarPostar(postarAlvo);
          setPostarAlvo(null);
        }}
        onCancelar={() => setPostarAlvo(null)}
      />

      <ConfirmDialog
        aberto={!!excluirAlvo}
        titulo="Excluir este Story?"
        descricao={excluirAlvo ? `"${excluirAlvo.titulo}" será apagado daqui.` : undefined}
        textoConfirmar="Excluir"
        onConfirmar={() => {
          if (excluirAlvo) confirmarExcluir(excluirAlvo);
          setExcluirAlvo(null);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />
    </div>
  );
}
