"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarFestaPublica } from "@/app/actions/festas";
import { type MarcaPublica } from "@/lib/festa-tipos";
import { InputDataBR } from "@/components/input-data-br";
import { lerFestasRecentes, type FestaRecente } from "@/lib/festas-recentes";

// Data de hoje (BRT) no formato yyyy-mm-dd pro <input type="date">.
function hojeBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

// LINK DE CRIAR (do buffet): só o formulário "Nova festa". Não lista nem dá acesso às festas
// existentes (isolamento). Ao criar, leva pro link PRÓPRIO da festa (/f/[festaToken]).
export function CriarFestaPublico({ tokenMarca, marca }: { tokenMarca: string; marca: MarcaPublica }) {
  const router = useRouter();
  const cor = marca.corPrimaria || "#7C3AED";

  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [pessoas, setPessoas] = useState<{ nome: string; idade: string }[]>([{ nome: "", idade: "" }]);
  const [tema, setTema] = useState("");
  const [instaAnfitriao, setInstaAnfitriao] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [recentes, setRecentes] = useState<FestaRecente[]>([]);

  useEffect(() => { setData(hojeBR()); }, []); // evita mismatch de hidratação no input date
  useEffect(() => { setRecentes(lerFestasRecentes()); }, []); // festas que este aparelho já começou

  function setPessoa(i: number, campo: "nome" | "idade", val: string) {
    setPessoas((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: val } : p)));
  }
  function addPessoa() {
    setPessoas((ps) => (ps.length >= 10 ? ps : [...ps, { nome: "", idade: "" }]));
  }
  function removePessoa(i: number) {
    setPessoas((ps) => ps.filter((_, idx) => idx !== i));
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const lista = pessoas
      .map((p) => ({ nome: p.nome.trim(), idade: p.idade.trim() ? parseInt(p.idade, 10) : null }))
      .filter((p) => p.nome);
    if (!lista.length) { setErro("Qual o nome do aniversariante?"); return; }
    setCriando(true);
    try {
      const r = await criarFestaPublica(tokenMarca, { dataISO: data || hojeBR(), aniversariantes: lista, tema, horario, instagramAnfitriao: instaAnfitriao });
      if (!r.ok) { setErro(r.erro); setCriando(false); return; }
      router.push(`/f/${r.festaToken}`); // vai pro link isolado da festa criada
    } catch {
      setErro("Algo deu errado ao criar a festa. Tente de novo.");
      setCriando(false);
    }
  }

  return (
    <div className="min-h-screen bg-preto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        {/* Cabeçalho da marca */}
        <div className="flex items-center gap-3">
          {marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoUrl} alt={marca.nome} className="h-12 w-12 shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white" style={{ backgroundColor: cor }}>
              {marca.nome.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-white">📸 Álbum da Festa</h1>
            <p className="truncate text-xs text-muted">{marca.nome}</p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-linha bg-preto-card p-3 text-sm leading-relaxed text-muted">
          Crie a festa abaixo. Depois, você vai pra um link <strong className="text-white/80">só dela</strong> pra subir as fotos durante o evento. 🎉
        </p>

        {recentes.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/10 p-3">
            <p className="text-xs font-semibold text-[#c7b2ff]">📋 Festas que você começou neste aparelho</p>
            <p className="mt-0.5 text-[11px] text-muted">Já começou uma festa? Toque pra voltar e continuar — não precisa criar de novo.</p>
            <div className="mt-2 space-y-1.5">
              {recentes.map((r) => (
                <a key={r.token} href={`/f/${r.token}`} className="flex items-center justify-between gap-2 rounded-lg border border-linha bg-preto-card px-3 py-2 text-sm text-white transition hover:border-[#7c3aed]">
                  <span className="truncate">🎂 {r.label}</span>
                  <span className="shrink-0 text-xs text-muted">{dataBR(r.dataISO)} →</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={criar} className="mt-4 rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
          <p className="text-sm font-semibold text-white">✨ Nova festa</p>

          <div className="mt-4 flex gap-3">
            <label className="block min-w-0 flex-1 text-xs font-medium text-muted">Data da festa
              <InputDataBR value={data} onChange={setData} className="mt-1" />
            </label>
            <label className="block w-28 shrink-0 text-xs font-medium text-muted">Horário
              <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} style={{ colorScheme: "dark" }} className="input-base mt-1 min-w-0" />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Aniversariante(s) e idade</p>
            <div className="mt-1 space-y-2">
              {pessoas.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p.nome}
                    onChange={(e) => setPessoa(i, "nome", e.target.value)}
                    placeholder={i === 0 ? "Nome (ex: Maria)" : "Outro aniversariante"}
                    autoFocus={i === 0}
                    className="input-base mt-0 flex-1"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={130}
                    value={p.idade}
                    onChange={(e) => setPessoa(i, "idade", e.target.value)}
                    placeholder="Idade"
                    className="input-base mt-0 w-20 shrink-0"
                  />
                  {pessoas.length > 1 && (
                    <button type="button" onClick={() => removePessoa(i)} aria-label="Remover aniversariante" className="shrink-0 rounded-lg border border-linha px-2.5 py-2 text-sm text-muted transition hover:border-red-500/50 hover:text-red-400">✕</button>
                  )}
                </div>
              ))}
            </div>
            {pessoas.length < 10 && (
              <button type="button" onClick={addPessoa} className="mt-2 text-xs font-semibold text-muted transition hover:text-white">+ Adicionar outro aniversariante</button>
            )}
          </div>

          <label className="mt-4 block text-xs font-medium text-muted">Tema da festa <span className="font-normal text-muted/70">(opcional)</span>
            <input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: Frozen, Super-heróis…" className="input-base mt-1" />
          </label>

          <label className="mt-4 block text-xs font-medium text-muted">📸 Instagram da família <span className="font-normal text-muted/70">(opcional — pra marcar no post)</span>
            <input type="text" value={instaAnfitriao} onChange={(e) => setInstaAnfitriao(e.target.value)} placeholder="@usuario_da_familia" autoCapitalize="none" autoCorrect="off" className="input-base mt-1" />
          </label>

          {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
          <button type="submit" disabled={criando} className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60" style={{ backgroundColor: cor }}>
            {criando ? "Criando…" : "Criar festa e ir pras fotos →"}
          </button>
        </form>

        <p className="mt-8 text-center text-[11px] text-muted">Postaí · Álbum da Festa</p>
      </div>
    </div>
  );
}
