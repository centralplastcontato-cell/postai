"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarLinkFotos, revogarLinkFotos, excluirFesta } from "@/app/actions/festas";
import { type FestaView } from "@/components/album-festa-publico";
import { rotuloAniversariantes } from "@/lib/aniversariantes";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

type Confirmacao = { titulo: string; texto: string; rotulo: string; perigo?: boolean; acao: () => void | Promise<void> };

// Aba 📸 Festas do painel da marca. Mostra o LINK público (que o dono passa pro gerente do
// buffet) e a galeria das festas já registradas. As fotos das festas também aparecem no
// Banco de imagens (categoria 🎉 Festa) — aqui ficam organizadas por evento.
export function FestasPainel({ marcaId, linkBase, token: tokenInicial, festas }: {
  marcaId: string;
  linkBase: string;
  token: string;
  festas: FestaView[];
}) {
  const router = useRouter();
  const [token, setToken] = useState(tokenInicial);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);

  const link = token ? `${linkBase}/f/${token}` : "";

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
      titulo: "Gerar um link novo?",
      texto: "Isso desativa o link atual — quem tiver o link antigo não consegue mais subir fotos.",
      rotulo: "Gerar link novo",
      acao: gerar,
    });
  }

  function pedirRevogar() {
    setConfirmar({
      titulo: "Desativar o link?",
      texto: "Quem tiver o link atual deixa de conseguir subir fotos. Você pode gerar um novo depois.",
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

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro("Não consegui copiar. Selecione o link acima e copie manualmente.");
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

      {/* Cartão do link público */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🔗 Link de fotos da festa</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Passe este link pro gerente do buffet. Ele abre no celular <strong className="text-white/80">sem login</strong>, cria a festa e vai subindo as fotos durante o evento. Cada foto entra no Banco de imagens e abastece os posts. 🎉
        </p>

        {token ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()} className="input-base mt-0 min-w-[200px] flex-1 text-xs" />
              <button type="button" onClick={copiar} className="rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
                {copiado ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-muted underline transition hover:text-white">Abrir link</a>
              <button type="button" onClick={gerarNovo} className="text-muted underline transition hover:text-white">Gerar link novo</button>
              <button type="button" onClick={pedirRevogar} className="text-red-400 underline transition hover:text-red-300">Desativar link</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={gerar} disabled={gerando} className="mt-3 rounded-lg bg-vermelho px-4 py-2 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60">
            {gerando ? "Gerando…" : "🔗 Gerar link de fotos"}
          </button>
        )}
        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
      </div>

      {/* Galeria por festa */}
      <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">🎂 Festas registradas <span className="font-normal text-muted">({festas.length})</span></h3>
        {festas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-linha bg-preto p-6 text-center text-sm text-muted">
            Nenhuma festa ainda. Gere o link acima e mande pro gerente — as festas dele aparecem aqui. 🎉
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {festas.map((f) => (
              <div key={f.id} className="rounded-lg border border-linha bg-preto p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">🎂 {rotuloAniversariantes(f.aniversariantes)}{f.tema ? <span className="font-normal text-muted"> · {f.tema}</span> : null}</p>
                    <p className="text-xs text-muted">{dataBR(f.dataISO)} · {f.fotos.length} {f.fotos.length === 1 ? "foto" : "fotos"}</p>
                  </div>
                  <button type="button" onClick={() => pedirApagarFesta(f)} title="Excluir festa" className="shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-900/30">✕ Excluir</button>
                </div>
                {f.fotos.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {f.fotos.map((foto) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={foto.id} src={foto.url} alt="foto da festa" className="aspect-square w-full rounded-md border border-linha object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
