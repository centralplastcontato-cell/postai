"use client";

// Aba CAMPANHAS do painel — o buffet cria ofertas (banners de recompra) que aparecem no fim
// de cada álbum pros pais. A campanha ATIVA mais recente é a que aparece. CRUD pelas actions
// de @/app/actions/campanhas. O número do WhatsApp vem da Marca (não se digita aqui).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarCampanha, editarCampanha, alternarCampanha, excluirCampanha } from "@/app/actions/campanhas";

export type CampanhaView = {
  id: string;
  selo: string;
  titulo: string;
  texto: string;
  ctaTexto: string;
  ctaTipo: string;
  ctaValor: string;
  ativa: boolean;
};

const VAZIO = { selo: "", titulo: "", texto: "", ctaTexto: "Quero saber mais", ctaTipo: "whatsapp", ctaValor: "" };

// Modelos prontos pra ajudar quem não sabe o que escrever — clica e o form já vem preenchido.
type Template = { id: string; label: string; valores: typeof VAZIO };
const TEMPLATES: Template[] = [
  {
    id: "recompra",
    label: "🎈 Próxima festa",
    valores: {
      selo: "Condição especial · 15 dias",
      titulo: "Já pensou na próxima festa? 🎈",
      texto: "Reserve a próxima festa nos próximos 15 dias e ganhe uma condição especial só pra família.",
      ctaTexto: "Quero saber mais",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Vim pelo álbum e quero saber da condição especial pra próxima festa 🎉",
    },
  },
  {
    id: "congelar",
    label: "🔒 Sem reajuste",
    valores: {
      selo: "Preço congelado + desconto",
      titulo: "Feche a festa do ano que vem sem reajuste! 🔒",
      texto: "Festa do próximo ano sempre tem reajuste. Fechando agora, você trava o preço de hoje, ainda ganha 10% de desconto e parcela em até 10x.",
      ctaTexto: "Quero garantir o preço",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Quero fechar a festa do ano que vem com o preço de hoje, o desconto e o parcelamento 🔒",
    },
  },
  {
    id: "indicacao",
    label: "🤝 Indique e ganhe",
    valores: {
      selo: "Indicação premiada",
      titulo: "Indique um amigo e ganhe! 🎁",
      texto: "Conhece alguém que vai fazer festa? Indique a gente — e vocês dois ganham um mimo especial.",
      ctaTexto: "Quero indicar",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Quero indicar um amigo e saber do mimo da indicação 🎁",
    },
  },
  {
    id: "ferias",
    label: "🌴 Agenda de férias",
    valores: {
      selo: "Agenda enchendo",
      titulo: "Garanta a festa das férias! 🌴",
      texto: "As datas de férias são as mais concorridas. Reserve a sua agora e não fique sem o melhor dia.",
      ctaTexto: "Ver datas disponíveis",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Quero ver as datas disponíveis pra festa nas férias 🌴",
    },
  },
  {
    id: "fidelidade",
    label: "💜 Cliente da casa",
    valores: {
      selo: "Desconto de cliente fiel",
      titulo: "Cliente da casa tem mimo! 💜",
      texto: "Você já é da família! Na sua próxima festa com a gente, tem uma condição especial de cliente fiel.",
      ctaTexto: "Quero meu desconto",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Sou cliente de vocês e quero a condição especial de cliente fiel 💜",
    },
  },
  {
    id: "data",
    label: "📅 Reserve a data",
    valores: {
      selo: "Datas voando",
      titulo: "As melhores datas voam! 📅",
      texto: "Já tem uma data em mente pra próxima comemoração? Garanta agora antes que ela seja reservada.",
      ctaTexto: "Reservar minha data",
      ctaTipo: "whatsapp",
      ctaValor: "Oi! Quero reservar uma data pra próxima festa 📅",
    },
  },
];

export function CampanhasPainel({
  marcaId,
  temTelefone,
  campanhas,
}: {
  marcaId: string;
  temTelefone: boolean;
  campanhas: CampanhaView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);

  // A que está REALMENTE aparecendo nos álbuns = a ativa mais recente (lista vem por criadoEm desc).
  const idAparecendo = campanhas.find((c) => c.ativa)?.id ?? null;

  function set<K extends keyof typeof VAZIO>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!form.titulo.trim()) { setErro("Dê um título pra campanha."); return; }
    setSalvando(true);
    const r = editandoId ? await editarCampanha(editandoId, form) : await criarCampanha(marcaId, form);
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setForm(VAZIO);
    setEditandoId(null);
    router.refresh();
  }

  function editar(c: CampanhaView) {
    setForm({ selo: c.selo, titulo: c.titulo, texto: c.texto, ctaTexto: c.ctaTexto, ctaTipo: c.ctaTipo, ctaValor: c.ctaValor });
    setEditandoId(c.id);
    setErro(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelar() {
    setForm(VAZIO);
    setEditandoId(null);
    setErro(null);
  }
  function usarTemplate(t: Template) {
    setForm({ ...t.valores });
    setEditandoId(null);
    setErro(null);
  }

  async function alternar(c: CampanhaView) {
    await alternarCampanha(c.id, !c.ativa);
    router.refresh();
  }
  async function excluir(id: string) {
    await excluirCampanha(id);
    setConfirmarExcluir(null);
    router.refresh();
  }

  const whatsSemTelefone = form.ctaTipo === "whatsapp" && !temTelefone;

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">🎈 Campanhas</p>
        <p className="mt-1 text-xs text-muted">
          Crie ofertas que aparecem <strong className="text-white/80">no fim de cada álbum</strong>, no melhor momento — os pais acabaram de ver as fotos. A campanha <strong className="text-white/80">ativa</strong> aparece em todos os álbuns desta marca.
        </p>
      </div>

      {/* FORM criar/editar */}
      <form onSubmit={salvar} className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-white">{editandoId ? "✏️ Editar campanha" : "✨ Nova campanha"}</p>

        {!editandoId && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">💡 Comece por um modelo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => usarTemplate(t)}
                  className="rounded-full border border-linha bg-preto px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Selo (urgência)
            <input value={form.selo} onChange={(e) => set("selo", e.target.value)} placeholder="Condição especial · 15 dias" className="input-base" />
          </label>
          <label className="text-xs text-muted">Texto do botão
            <input value={form.ctaTexto} onChange={(e) => set("ctaTexto", e.target.value)} placeholder="Quero saber mais" className="input-base" />
          </label>
        </div>

        <label className="mt-3 block text-xs text-muted">Título <span className="text-red-400">*</span>
          <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Já pensou na próxima festa? 🎈" className="input-base" />
        </label>

        <label className="mt-3 block text-xs text-muted">Texto da oferta
          <textarea value={form.texto} onChange={(e) => set("texto", e.target.value)} rows={2} placeholder="Reserve a próxima festa nos próximos 15 dias e ganhe uma condição especial." className="input-base" />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">O botão leva pra
            <select value={form.ctaTipo} onChange={(e) => set("ctaTipo", e.target.value)} className="input-base">
              <option value="whatsapp">WhatsApp do buffet</option>
              <option value="link">Um link</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            {form.ctaTipo === "whatsapp" ? "Mensagem que já vem escrita (opcional)" : "Link de destino"}
            <input
              value={form.ctaValor}
              onChange={(e) => set("ctaValor", e.target.value)}
              placeholder={form.ctaTipo === "whatsapp" ? "Oi! Vim pelo álbum e quero a condição especial 🎉" : "https://..."}
              className="input-base"
            />
          </label>
        </div>

        {whatsSemTelefone && (
          <p className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
            ⚠️ Esta marca não tem telefone cadastrado — o botão de WhatsApp não vai aparecer. Adicione em <strong>Configurações</strong>.
          </p>
        )}

        {/* PREVIEW ao vivo do banner */}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Prévia no álbum</p>
        <div className="mt-2 overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 px-5 py-6 text-center">
          {form.selo && <span className="inline-block rounded-full bg-vermelho px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">{form.selo}</span>}
          <p className="mt-3 text-lg font-extrabold text-white">{form.titulo || "Título da oferta"}</p>
          {form.texto && <p className="mx-auto mt-1.5 max-w-sm text-xs text-white/70">{form.texto}</p>}
          <span className="mt-4 inline-block rounded-full bg-vermelho px-5 py-2 text-xs font-bold text-white">{form.ctaTexto || "Quero saber mais"} →</span>
        </div>

        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button type="submit" disabled={salvando} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">
            {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Criar campanha"}
          </button>
          {editandoId && (
            <button type="button" onClick={cancelar} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-muted transition hover:text-white">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* LISTA */}
      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-white">Suas campanhas</p>
        {campanhas.length === 0 ? (
          <div className="rounded-xl border border-linha bg-preto-card p-6 text-center text-sm text-muted">
            Nenhuma campanha ainda. Crie a primeira acima ✨
          </div>
        ) : (
          <div className="space-y-3">
            {campanhas.map((c) => (
              <div key={c.id} className="rounded-xl border border-linha bg-preto-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.ativa ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-linha bg-preto text-muted"}`}>
                        {c.ativa ? "Ativa" : "Inativa"}
                      </span>
                      {c.id === idAparecendo && (
                        <span className="rounded-full border border-vermelho/40 bg-vermelho/15 px-2.5 py-0.5 text-xs font-semibold text-white">📣 Aparecendo nos álbuns</span>
                      )}
                    </div>
                    <p className="mt-1.5 font-semibold text-white">{c.titulo}</p>
                    {c.selo && <p className="text-xs text-muted">{c.selo}</p>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => alternar(c)} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
                    {c.ativa ? "Desativar" : "Ativar"}
                  </button>
                  <button onClick={() => editar(c)} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
                    ✏️ Editar
                  </button>
                  {confirmarExcluir === c.id ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => excluir(c.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500">Excluir mesmo</button>
                      <button onClick={() => setConfirmarExcluir(null)} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-white">Cancelar</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmarExcluir(c.id)} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500/50">
                      🗑️ Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {campanhas.filter((c) => c.ativa).length > 1 && (
          <p className="mt-3 text-xs text-muted">💡 Você tem mais de uma campanha ativa — nos álbuns aparece só a <strong className="text-white/80">mais recente</strong> (📣). As outras ficam guardadas.</p>
        )}
      </div>
    </div>
  );
}
