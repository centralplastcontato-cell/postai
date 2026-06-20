"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarLinkFotos, revogarLinkFotos, excluirFesta } from "@/app/actions/festas";
import { type FestaView } from "@/lib/festa-tipos";
import { rotuloAniversariantes } from "@/lib/aniversariantes";
import { MOMENTOS_FESTA } from "@/lib/momentos-festa";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

type Confirmacao = { titulo: string; texto: string; rotulo: string; perigo?: boolean; acao: () => void | Promise<void> };

// Aba 📸 Festas do painel da marca. Dois tipos de link:
//  • LINK DE CRIAR (da marca): o gerente cria festas por ele (não vê as existentes).
//  • LINK DE CADA FESTA: isolado — quem tem ele só mexe naquela festa.
// As fotos também aparecem no Banco de imagens (categoria 🎉 Festa); aqui ficam por evento.
export function FestasPainel({ marcaId, linkBase, token: tokenInicial, festas }: {
  marcaId: string;
  linkBase: string;
  token: string;
  festas: FestaView[];
}) {
  const router = useRouter();
  const [token, setToken] = useState(tokenInicial);
  const [gerando, setGerando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set()); // festas expandidas (começam TODAS colapsadas)

  const linkCriar = token ? `${linkBase}/f/${token}` : "";

  function toggleFesta(id: string) {
    setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function gerar() {
    setErro(null);
    setGerando(true);
    try {
      const r = await gerarLinkFotos(marcaId);
      if (!r.ok) { setErro(r.erro); return; }
      setToken(r.token);
    } catch {
      setErro("Não consegui gerar o link agora. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  function gerarNovo() {
    setConfirmar({
      titulo: "Gerar um link de criar novo?",
      texto: "Isso desativa o link de criar atual — quem tiver o antigo não consegue mais criar festas. (Os links de festas já criadas continuam funcionando.)",
      rotulo: "Gerar link novo",
      acao: gerar,
    });
  }

  function pedirRevogar() {
    setConfirmar({
      titulo: "Desativar o link de criar?",
      texto: "Quem tiver o link atual deixa de conseguir criar festas. Os links de festas já criadas continuam funcionando. Você pode gerar um novo depois.",
      rotulo: "Desativar link",
      perigo: true,
      acao: async () => {
        setErro(null);
        try {
          const r = await revogarLinkFotos(marcaId);
          if (!r.ok) { setErro(r.erro); return; }
          setToken("");
        } catch {
          setErro("Não consegui desativar o link agora.");
        }
      },
    });
  }

  async function copiarLink(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie manualmente.");
    }
  }

  function pedirApagarFesta(f: FestaView) {
    setConfirmar({
      titulo: `Excluir a festa de ${rotuloAniversariantes(f.aniversariantes)}?`,
      texto: "As fotos continuam no Banco de imagens — só some o agrupamento por festa.",
      rotulo: "Excluir festa",
      perigo: true,
      acao: async () => {
        await excluirFesta(f.id);
        router.refresh();
      },
    });
  }

  return (
    <section className="space-y-5">
      {/* Modal de confirmação no padrão da plataforma (substitui o confirm() nativo) */}
      {confirmar && (
        <div onClick={() => setConfirmar(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
            <p className="text-sm font-semibold text-white">{confirmar.titulo}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{confirmar.texto}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white">Cancelar</button>
              <button
                type="button"
                onClick={async () => { const a = confirmar.acao; setConfirmar(null); await a(); }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${confirmar.perigo ? "bg-red-600 hover:bg-red-700" : "bg-vermelho hover:bg-vermelho-hover"}`}
              >
                {confirmar.rotulo}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cartão do LINK DE CRIAR */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🔗 Link pra criar festa</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Passe este link pro gerente do buffet. Ele abre no celular <strong className="text-white/80">sem login</strong>, cria a festa e ganha um <strong className="text-white/80">link só dela</strong> pra subir as fotos. Cada festa fica <strong className="text-white/80">isolada</strong> — um gerente não mexe na festa do outro. 🎉
        </p>

        {token ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={linkCriar} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[200px] flex-1 text-xs" />
              <button type="button" onClick={() => copiarLink(linkCriar, "criar")} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
                {copiadoId === "criar" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a href={linkCriar} target="_blank" rel="noopener noreferrer" className="text-muted underline transition hover:text-white">Abrir link</a>
              <button type="button" onClick={gerarNovo} className="text-muted underline transition hover:text-white">Gerar link novo</button>
              <button type="button" onClick={pedirRevogar} className="text-red-400 underline transition hover:text-red-300">Desativar link</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={gerar} disabled={gerando} className="mt-3 rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">
            {gerando ? "Gerando…" : "🔗 Gerar link pra criar festa"}
          </button>
        )}
        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
      </div>

      {/* Galeria por festa — cada uma com seu link próprio */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🎂 Festas registradas <span className="font-normal text-muted">({festas.length})</span></h3>
        {festas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">
            Nenhuma festa ainda. Gere o link de criar acima e mande pro gerente — as festas dele aparecem aqui. 🎉
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {festas.map((f) => {
              const linkFesta = `${linkBase}/f/${f.token}`;
              const aberta = abertas.has(f.id);
              return (
                <div key={f.id} className="rounded-lg border border-linha bg-preto p-3">
                  {/* Cabeçalho clicável: começa COLAPSADO; toca pra expandir/recolher */}
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => toggleFesta(f.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                      <span className="mt-0.5 shrink-0 text-xs text-muted">{aberta ? "▲" : "▼"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">🎂 {rotuloAniversariantes(f.aniversariantes)}{f.tema ? <span className="font-normal text-muted"> · {f.tema}</span> : null}</span>
                        <span className="block text-xs text-muted">{dataBR(f.dataISO)} · {f.fotos.length} {f.fotos.length === 1 ? "foto" : "fotos"} {f.finalizadaEm && <span className="font-semibold text-green-400">· ✓ Finalizada</span>}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => pedirApagarFesta(f)} title="Excluir festa" className="shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-900/30">✕ Excluir</button>
                  </div>

                  {aberta && (
                    <>
                      {/* Link próprio desta festa (pra mandar pro gerente responsável por ela) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input readOnly value={linkFesta} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[160px] flex-1 text-[11px]" />
                        <button type="button" onClick={() => copiarLink(linkFesta, f.id)} className="rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-vermelho hover:text-white">
                          {copiadoId === f.id ? "✓ Copiado" : "Copiar link"}
                        </button>
                      </div>

                      {/* Fotos agrupadas por momento — mostra ao dono o que foi (ou não) registrado */}
                      {f.fotos.length === 0 ? (
                        <p className="mt-3 text-center text-xs text-muted">Ainda sem fotos nesta festa.</p>
                      ) : MOMENTOS_FESTA.map((m) => {
                        const fotosM = f.fotos.filter((ft) => ft.momento === m.id);
                        if (!fotosM.length) return null;
                        return (
                          <div key={m.id} className="mt-3">
                            <p className="text-[11px] font-semibold text-muted">{m.emoji} {m.label} <span className="font-normal">· {fotosM.length}</span></p>
                            <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
                              {fotosM.map((foto) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={foto.id} src={foto.url} alt={m.label} className="aspect-square w-full rounded-md border border-linha object-cover" />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
