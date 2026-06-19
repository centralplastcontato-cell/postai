"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPublicacao,
  postarStory,
  regerarPublicacao,
  reagendarPublicacao,
  alternarAprovacao,
  excluirPublicacao,
  sugerirPromocao,
  editarPublicacao,
} from "@/app/actions/feed";
import { sugerirTemas } from "@/app/actions/marketing";
import { type Template } from "@/lib/feed-templates";
import { type PublicacaoView } from "./publicacoes-aba";
import { ConfirmDialog } from "./confirm-dialog";
import { CaixaPostando } from "./caixa-postando";
import { rotuloHora } from "@/lib/horarios";
import { CORES_EXTRAS } from "@/lib/cores-fundo";
import { SeloEngajamento } from "./selo-engajamento";
import { EtiquetaCategoria } from "./etiqueta-categoria";

// Templates que fazem sentido pro Story (vertical, chamativo). Promoção mostra o selo
// de oferta; os demais usam só título + texto. Tudo renderizado em 9:16.
const TEMPLATES_STORY: { v: string; nome: string; oferta?: boolean }[] = [
  { v: "promocao", nome: "🎉 Promoção", oferta: true },
  { v: "divulgacao", nome: "🏆 Divulgação" },
  { v: "data-comemorativa", nome: "🎈 Data comemorativa" },
  { v: "dica", nome: "💡 Dica" },
];

// Temas prontos pra Story (clique preenche o campo Tema). Curtos, com urgência/novidade
// — o que funciona bem no Story de um buffet infantil.
const MODELOS_STORY: { rotulo: string; tema: string }[] = [
  { rotulo: "🔥 Última vaga", tema: "a última data disponível do mês pra fechar a festa agora" },
  { rotulo: "⚡ Promo relâmpago", tema: "uma promoção relâmpago válida só hoje pra fechar a festa" },
  { rotulo: "📸 Bastidor da festa", tema: "o clima/bastidor de uma festa acontecendo no nosso espaço" },
  { rotulo: "⏰ Agenda enchendo", tema: "aviso de que as datas estão acabando, corra pra garantir a sua" },
  { rotulo: "🎈 Novidade do espaço", tema: "uma novidade ou atração nova do nosso buffet" },
  { rotulo: "💬 Chama no WhatsApp", tema: "convite direto pra chamar no WhatsApp e tirar dúvidas da festa" },
  { rotulo: "📋 Dica rápida", tema: "uma dica rápida e útil pra quem vai organizar uma festa infantil" },
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
  // Gerador colapsável CONTEXTUAL: recolhido quando o dia (ou a lista) já tem story; aberto
  // quando vazio. Re-sincroniza ao trocar de dia. Dá pra abrir/fechar na mão (▾/▸).
  const temStoriesNoContexto = (dataAlvo ? stories.filter((s) => chaveDiaSP(s.data) === dataAlvo) : stories).length > 0;
  const [geradorAberto, setGeradorAberto] = useState(!temStoriesNoContexto);
  useEffect(() => {
    setGeradorAberto(!(dataAlvo ? stories.filter((s) => chaveDiaSP(s.data) === dataAlvo) : stories).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAlvo]);
  const gerador = { aberto: geradorAberto, alternar: () => setGeradorAberto((a) => !a) };
  const [isPending, startTransition] = useTransition();
  const [tema, setTema] = useState("");
  const [template, setTemplate] = useState("promocao");
  const [oferta, setOferta] = useState("");
  const [validade, setValidade] = useState("");
  const [hora, setHora] = useState(horaPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);
  const [postando, setPostando] = useState(false);
  const [postandoId, setPostandoId] = useState<string | null>(null);
  const [postarAlvo, setPostarAlvo] = useState<PublicacaoView | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<PublicacaoView | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [imgExpandida, setImgExpandida] = useState<string | null>(null);
  const [temasIA, setTemasIA] = useState<string[]>([]);
  const [sugerindo, setSugerindo] = useState(false);
  const [sugerindoOferta, setSugerindoOferta] = useState(false);
  const [estilo, setEstilo] = useState<"colorida" | "foto" | "faixa">("colorida");
  const [cor, setCor] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edTitulo, setEdTitulo] = useState("");
  const [edLegenda, setEdLegenda] = useState("");
  const [edOferta, setEdOferta] = useState("");
  const [edValidade, setEdValidade] = useState("");

  const ehPromo = TEMPLATES_STORY.find((t) => t.v === template)?.oferta;
  const filtrados = dataAlvo ? stories.filter((s) => chaveDiaSP(s.data) === dataAlvo) : stories;

  // ?v= por story (fura cache da arte quando o conteúdo muda).
  const verStory = (s: PublicacaoView) => `/api/story/${s.id}?v=${hashCurto(`${s.titulo}|${s.texto}|${s.imagemUrl ?? ""}|${s.extra ?? ""}`)}`;

  function handleGerar() {
    setErro(null);
    setAviso(null);
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
        corFundo: estilo === "colorida" ? (cor || undefined) : undefined,
        comFoto: estilo === "foto" || estilo === "faixa",
        estiloStory: estilo,
      });
      if (r.ok) {
        setTema("");
        setOferta("");
        setValidade("");
        if (r.aviso) setAviso(r.aviso);
        onGerado(r.dia ?? dataAlvo ?? undefined);
        router.refresh();
      } else setErro(r.erro);
    });
  }

  function handleSugerirTemas() {
    setErro(null);
    setSugerindo(true);
    startTransition(async () => {
      const r = await sugerirTemas(marcaId);
      if (r.ok) setTemasIA(r.temas);
      else setErro(r.erro);
      setSugerindo(false);
    });
  }
  function handleSugerirOferta() {
    setErro(null);
    setSugerindoOferta(true);
    startTransition(async () => {
      const r = await sugerirPromocao(marcaId, tema);
      if (r.ok) {
        setOferta(r.oferta);
        setValidade(r.validade);
      } else setErro(r.erro);
      setSugerindoOferta(false);
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
  function handleEditar(s: PublicacaoView) {
    setErro(null);
    setEditandoId(s.id);
    setEdTitulo(s.titulo);
    setEdLegenda(s.legenda);
    let ex: { oferta?: string; validade?: string } = {};
    try { ex = JSON.parse(s.extra || "{}"); } catch {}
    setEdOferta(ex.oferta ?? "");
    setEdValidade(ex.validade ?? "");
  }
  function handleSalvarEdicao(s: PublicacaoView) {
    setProc(s.id);
    startTransition(async () => {
      // Repassa a cor de fundo antiga pra editar texto NÃO randomizar a cor do Story.
      let ex: { corFundo?: string; corFundoTravada?: string } = {};
      try { ex = JSON.parse(s.extra || "{}"); } catch {}
      const r = await editarPublicacao({
        id: s.id,
        titulo: edTitulo,
        legenda: edLegenda,
        oferta: edOferta,
        validade: edValidade,
        corFundo: ex.corFundoTravada || ex.corFundo || undefined,
      });
      if (!r.ok) setErro(r.erro);
      else setEditandoId(null);
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
      try {
        const r = await excluirPublicacao(s.id);
        if (!r.ok) setErro(r.erro);
      } catch {
        setErro("Não consegui excluir agora (o banco demorou). Tente de novo.");
      }
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
        <button type="button" onClick={gerador.alternar} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="text-sm font-semibold text-white">🟣 Gerar Story com IA <span className="font-normal text-muted">— formato vertical (9:16), tela cheia</span></span>
          <span className="shrink-0 rounded-md border border-linha px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-vermelho hover:text-white">{gerador.aberto ? "▾ recolher" : "▸ expandir"}</span>
        </button>
        {gerador.aberto && (<>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEMPLATES_STORY.map((t) => (
            <button key={t.v} type="button" onClick={() => setTemplate(t.v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${template === t.v ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>
              {t.nome}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">💡 Temas prontos (clique pra preencher)</p>
          <div className="flex flex-wrap gap-2">
            {MODELOS_STORY.map((m) => (
              <button key={m.rotulo} type="button" onClick={() => setTema(m.tema)} className="rounded-full border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">{m.rotulo}</button>
            ))}
          </div>
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
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
            </select>
          </label>
          <button onClick={handleGerar} disabled={isPending || !tema.trim()} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">
            {isPending ? "Gerando…" : "Gerar Story"}
          </button>
        </div>
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Estilo:</span>
            <button type="button" onClick={() => setEstilo("colorida")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${estilo === "colorida" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>🎨 Colorida</button>
            <button type="button" onClick={() => setEstilo("foto")} title="Usa uma foto real do seu banco como fundo (tela cheia)" className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${estilo === "foto" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>📷 Foto real</button>
            <button type="button" onClick={() => setEstilo("faixa")} title="Foto real com uma faixa diagonal trazendo o título" className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${estilo === "faixa" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>📐 Faixa</button>
          </div>
          {estilo === "colorida" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-muted">Cor:</span>
              <button type="button" onClick={() => setCor("")} title="Cor automática da marca" className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${cor === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>🎲 Auto</button>
              {CORES_EXTRAS.map((c) => (
                <button key={c} type="button" onClick={() => setCor(c)} title={c} aria-label={`Cor ${c}`} className={`h-9 w-9 rounded-lg border-2 transition ${cor.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          {(estilo === "foto" || estilo === "faixa") && <p className="mt-2 text-[11px] text-muted">📷 Usa uma foto real do seu <strong className="text-white/80">banco de imagens</strong> como fundo. Sem fotos no banco, geramos um fundo artístico de IA — adicione fotos em <strong className="text-white/80">📸 Imagens</strong> pra usar o seu espaço real.</p>}
        </div>
        {ehPromo && (
          <div className="mt-3">
            <button type="button" onClick={handleSugerirOferta} disabled={sugerindoOferta} className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wider text-amber-300 transition hover:text-amber-200 disabled:opacity-50">
              {sugerindoOferta ? "✨ Pensando…" : "✨ Sugerir oferta com IA"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex-1 text-xs text-muted">
                Oferta em destaque <span className="text-muted/70">(opcional)</span>
                <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex: 10 CRIANÇAS GRÁTIS" className="input-base" />
              </label>
              <label className="flex-1 text-xs text-muted">
                Validade <span className="text-muted/70">(opcional)</span>
                <input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex: 30/06" className="input-base" />
              </label>
            </div>
          </div>
        )}
        <div className="mt-3">
          <button type="button" onClick={handleSugerirTemas} disabled={sugerindo} className="flex items-center gap-1 text-xs uppercase tracking-wider text-amber-300 transition hover:text-amber-200 disabled:opacity-50">
            {sugerindo ? "💡 Pensando…" : "💡 Sugerir temas com IA"}
          </button>
          {temasIA.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {temasIA.map((t) => (
                <button key={t} type="button" onClick={() => setTema(t)} className="rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1 text-xs text-amber-200 transition hover:border-amber-400 hover:text-white">{t}</button>
              ))}
            </div>
          )}
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
        {aviso && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">💡 {aviso}</p>}
        <p className="mt-2 text-[11px] text-muted">O Story some sozinho em 24h no Instagram — perfeito pra novidades e urgência.</p>
        </>)}
      </div>

      {stories.length > 0 && (
        <div className="mb-3 text-xs text-muted">{filtrados.length} {filtrados.length === 1 ? "story" : "stories"}{dataAlvo ? " nesse dia" : ""}</div>
      )}

      {stories.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum Story ainda. Escolha um modelo e um tema acima e clique em Gerar Story.</p>
      ) : filtrados.length === 0 ? (
        <p className="mb-8 rounded-xl border border-dashed border-linha bg-preto-card p-8 text-center text-sm text-muted">Nenhum Story nesse dia. <button type="button" onClick={() => onLimparDia?.()} className="font-semibold text-orange-300 underline">Ver todos</button> ou gere um acima.</p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((s) => {
            const postado = s.status === "postado";
            const ocupado = isPending || proc === s.id || postando;
            return (
              <div key={s.id} className="flex flex-col rounded-xl border border-linha bg-preto-card p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{dataBR(s.data)}</span>
                  <span title={postado && s.postadoEm ? `Publicado em ${dataHoraBR(s.postadoEm)}` : undefined} className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${postado ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>{postado ? "✓ Postado" : "● A postar"}</span>
                </div>
                {!postado ? (
                  <select value={horaSP(s.data)} onChange={(e) => handleReagendar(s.id, Number(e.target.value))} disabled={ocupado} title="Hora da postagem" className="mb-2 w-fit rounded-md border border-linha bg-preto px-2 py-1 text-[11px] text-white transition hover:border-vermelho disabled:opacity-40">
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>🕐 {rotuloHora(h)}</option>)}
                  </select>
                ) : (
                  s.postadoEm && <p className="mb-2 text-[11px] text-green-400/80">📢 Publicado {dataHoraBR(s.postadoEm)}</p>
                )}
                <div className="relative">
                  <button type="button" onClick={() => setImgExpandida(verStory(s))} title="Ampliar" className="block w-full overflow-hidden rounded-lg border border-linha transition hover:border-vermelho">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={verStory(s)} alt={s.titulo} className="aspect-[9/16] w-full object-cover" />
                  </button>
                  {postandoId === s.id && <CaixaPostando redes="no Instagram (Story)" />}
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-white">{s.titulo}</p>
                {s.categoriaIntencao && <div className="mt-1.5"><EtiquetaCategoria categoria={s.categoriaIntencao} /></div>}
                {postado && <SeloEngajamento p={s} ehStory />}

                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => handleAprovar(s)} disabled={ocupado} title="Revisão interna" className={`rounded px-1.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${s.aprovado ? "bg-green-600 text-white" : "border border-linha text-muted hover:text-white"}`}>{s.aprovado ? "✓" : "Aprovar"}</button>
                  {!postado && <button onClick={() => handleEditar(s)} disabled={ocupado} title="Editar texto (sem IA)" className="rounded border border-linha px-1.5 py-1 text-[11px] text-muted transition hover:border-sky-500 hover:text-white disabled:opacity-40">✏️</button>}
                  {s.tema && <button onClick={() => handleRegerar(s)} disabled={ocupado} title="Regerar texto (com IA)" className="rounded border border-linha px-1.5 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">↻</button>}
                  <button onClick={() => copiar(s)} className="rounded border border-linha px-1.5 py-1 text-[11px] text-muted transition hover:border-vermelho hover:text-white">{copiadoId === s.id ? "✓" : "Copiar"}</button>
                  {!postado && <button onClick={() => setPostarAlvo(s)} disabled={postando} className="rounded bg-[#C13584] px-1.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">📲 Story</button>}
                  <button onClick={() => setExcluirAlvo(s)} disabled={ocupado} title="Excluir" className="rounded border border-red-900 px-1.5 py-1 text-[11px] text-red-400 transition hover:bg-red-950/40 disabled:opacity-40">🗑</button>
                </div>
                {editandoId === s.id && (
                  <div className="mt-2 space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/5 p-2">
                    <input value={edTitulo} onChange={(e) => setEdTitulo(e.target.value)} placeholder="Título" className="input-base" />
                    {s.template === "promocao" && (
                      <div className="flex gap-2">
                        <input value={edOferta} onChange={(e) => setEdOferta(e.target.value)} placeholder="Oferta" className="input-base" />
                        <input value={edValidade} onChange={(e) => setEdValidade(e.target.value)} placeholder="Validade" className="input-base" />
                      </div>
                    )}
                    <textarea value={edLegenda} onChange={(e) => setEdLegenda(e.target.value)} rows={3} placeholder="Legenda" className="input-base" />
                    <div className="flex gap-2">
                      <button onClick={() => handleSalvarEdicao(s)} disabled={ocupado} className="rounded bg-vermelho px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">💾 Salvar</button>
                      <button onClick={() => setEditandoId(null)} className="rounded border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">Cancelar</button>
                    </div>
                  </div>
                )}
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
