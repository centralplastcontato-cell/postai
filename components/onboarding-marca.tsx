"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { extrairCoresLogo, salvarIdentidadeMarca } from "@/app/actions/marcas";
import { adicionarImagemMarca } from "@/app/actions/imagens";
import { gerarItemSemana } from "@/app/actions/onboarding";

const TOTAL = 14; // 3 carrossel + 4 feed + 7 story (igual ao PLANO_SEMANA no servidor)
const MAX_FOTOS = 10;

// Mensagens que giram na tela de processamento (só pra ficar gostoso de ver).
const FRASES = [
  "Lendo a identidade do seu buffet… 🎨",
  "Escrevendo as legendas no tom da festa… ✍️",
  "Montando os carrosséis… 🎠",
  "Encaixando as suas fotos nas artes… 🖼️",
  "Preparando os stories do dia… 🟣",
  "Caprichando nos detalhes… ✨",
  "Quase lá, organizando o calendário… 🗓️",
];

export function OnboardingMarca({
  marcaId,
  nome,
  logoUrl: logoInicial,
  nFotos: nFotosInicial,
}: {
  marcaId: string;
  nome: string;
  logoUrl: string;
  nFotos: number;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"logo" | "fotos" | "processando">("logo");
  const [logoUrl, setLogoUrl] = useState(logoInicial);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const [coresOk, setCoresOk] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [subindoFoto, setSubindoFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(0);
  const [fraseIdx, setFraseIdx] = useState(0);

  const nFotos = nFotosInicial + fotos.length;

  async function handleLogo(file?: File) {
    if (!file) return;
    setErro(null);
    setSubindoLogo(true);
    setCoresOk(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload?tipo=logo", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Não consegui processar o logo.");
        return;
      }
      setLogoUrl(data.url);
      // Já lê as cores do logo e salva tudo de uma vez — o cliente não precisa fazer mais nada.
      const cores = await extrairCoresLogo(data.url);
      if (cores.ok) {
        await salvarIdentidadeMarca({ id: marcaId, logoUrl: data.url, corPrimaria: cores.corPrimaria, corFundo: cores.corFundo, paleta: JSON.stringify(cores.paleta) });
        setCoresOk(true);
      } else {
        await salvarIdentidadeMarca({ id: marcaId, logoUrl: data.url });
      }
    } catch {
      setErro("Não consegui subir o logo. Tente de novo.");
    } finally {
      setSubindoLogo(false);
    }
  }

  async function handleFotos(lista: FileList | null) {
    if (!lista || !lista.length) return;
    setErro(null);
    setSubindoFoto(true);
    try {
      const arr = Array.from(lista).slice(0, MAX_FOTOS - nFotos);
      for (const file of arr) {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
        const data = await resp.json();
        if (data.ok && data.url) {
          await adicionarImagemMarca({ marcaId, url: data.url });
          setFotos((f) => [...f, data.url]);
        }
      }
    } catch {
      setErro("Falha ao subir alguma foto. Tente de novo.");
    } finally {
      setSubindoFoto(false);
    }
  }

  async function gerarSemana() {
    setEtapa("processando");
    setErro(null);
    setFeito(0);
    for (let i = 0; i < TOTAL; i++) {
      setFraseIdx(Math.floor((i / TOTAL) * FRASES.length));
      try {
        await gerarItemSemana(marcaId, i);
      } catch {
        /* best-effort: um item que falha não derruba a semana */
      }
      setFeito(i + 1);
    }
    // Tudo pronto → calendário cheio.
    router.refresh();
    router.push(`/painel/marcas/${marcaId}`);
  }

  const pct = Math.round((feito / TOTAL) * 100);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-10">
      {/* ===== PROCESSANDO ===== */}
      {etapa === "processando" ? (
        <div className="rounded-3xl border border-linha bg-preto-card p-8 text-center">
          <div className="relative mx-auto h-28 w-28">
            <div aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed]/20" />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-4xl shadow-lg shadow-[#7c3aed]/40">🎨</div>
          </div>
          <h1 className="display mt-6 text-2xl text-white">Preparando a sua semana…</h1>
          <p className="mt-2 text-sm text-muted">{FRASES[Math.min(fraseIdx, FRASES.length - 1)]}</p>
          <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-preto">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{feito} de {TOTAL} artes prontas · {pct}%</p>
          <p className="mt-4 text-[11px] text-muted">Leva cerca de 1 minuto. Não feche esta tela. 🙏</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-linha bg-preto-card p-7">
          {/* cabeçalho */}
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1 text-xs font-semibold text-[#c7b2ff]">
            🎁 Vamos preparar o {nome}
          </span>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className={etapa === "logo" ? "font-bold text-white" : ""}>1. Logo</span>
            <span>›</span>
            <span className={etapa === "fotos" ? "font-bold text-white" : ""}>2. Fotos</span>
            <span>›</span>
            <span>3. Semana pronta</span>
          </div>

          {/* ===== PASSO LOGO ===== */}
          {etapa === "logo" && (
            <div className="mt-5">
              <h1 className="display text-2xl text-white">Suba o logo do seu buffet</h1>
              <p className="mt-2 text-sm text-muted">A IA lê as cores do logo sozinha e já deixa as artes com a sua identidade. Use um <strong className="text-white/80">PNG com fundo transparente</strong> pra ficar perfeito.</p>

              <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-linha bg-preto p-6">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-linha bg-preto-card">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted">sem logo</span>
                  )}
                </div>
                <label className="cursor-pointer rounded-lg bg-vermelho px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover">
                  {subindoLogo ? "Lendo o logo…" : logoUrl ? "Trocar logo" : "📤 Subir logo (PNG)"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={subindoLogo} onChange={(e) => handleLogo(e.target.files?.[0])} />
                </label>
                {coresOk && <p className="text-xs font-semibold text-green-400">🎨 Pronto! Peguei a cara da sua marca.</p>}
              </div>

              {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => setEtapa("fotos")} className="text-sm text-muted underline-offset-2 transition hover:text-white hover:underline">Pular por agora</button>
                <button onClick={() => setEtapa("fotos")} disabled={subindoLogo} className="rounded-xl bg-vermelho px-6 py-3 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">Continuar →</button>
              </div>
            </div>
          )}

          {/* ===== PASSO FOTOS ===== */}
          {etapa === "fotos" && (
            <div className="mt-5">
              <h1 className="display text-2xl text-white">Agora, até {MAX_FOTOS} fotos do buffet</h1>
              <p className="mt-2 text-sm text-muted">Espaço, brinquedos, mesa de doces, festas que já rolaram… É o que deixa as artes com a <strong className="text-white/80">cara de verdade</strong> do seu buffet.</p>

              <div className="mt-5 grid grid-cols-4 gap-2">
                {fotos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border border-linha object-cover" />
                ))}
                {nFotos < MAX_FOTOS && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-linha bg-preto text-center text-muted transition hover:border-vermelho">
                    <span className="text-2xl">{subindoFoto ? "⏳" : "＋"}</span>
                    <span className="text-[10px]">{subindoFoto ? "subindo…" : "add foto"}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={subindoFoto} onChange={(e) => handleFotos(e.target.files)} />
                  </label>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">{nFotos} de {MAX_FOTOS} fotos</p>

              {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button onClick={() => setEtapa("logo")} className="text-sm text-muted underline-offset-2 transition hover:text-white hover:underline">← Voltar</button>
                <button onClick={gerarSemana} disabled={subindoFoto} className="rounded-xl bg-vermelho px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition hover:bg-vermelho-hover disabled:opacity-50">
                  ✨ Gerar minha semana
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] text-muted">O Postaí vai montar <strong className="text-white/70">7 dias de posts + stories</strong> com a cara do seu buffet. Você ajusta o que quiser depois.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
