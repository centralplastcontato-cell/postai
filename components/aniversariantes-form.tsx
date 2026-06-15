"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarAniversariantes } from "@/app/actions/marketing";
import { sortearImagemBancoAction } from "@/app/actions/imagens";
import { CORES_EXTRAS } from "@/lib/cores-fundo";

type Item = { key: string; nome: string; idade: string; recado: string; fotoUrl: string; subindo: boolean };

function novoItem(): Item {
  return { key: Math.random().toString(36).slice(2), nome: "", idade: "", recado: "", fotoUrl: "", subindo: false };
}

function dataBR(iso: string): string {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// 🎂 Monta o carrossel "Aniversariantes da Semana": foto + nome + idade + recado de cada
// criança (upload OU foto do banco), 1 por slide. Cor, título da capa e legenda à escolha.
export function AniversariantesForm({
  marcaId,
  dataAlvo,
  onGerado,
}: {
  marcaId: string;
  dataAlvo: string | null;
  onGerado: (dia?: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [semana, setSemana] = useState("");
  const [tituloCapa, setTituloCapa] = useState("");
  const [legenda, setLegenda] = useState("");
  const [cor, setCor] = useState("");
  const [itens, setItens] = useState<Item[]>([novoItem()]);
  const [erro, setErro] = useState<string | null>(null);

  function upd(key: string, patch: Partial<Item>) {
    setItens((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function remove(key: string) {
    setItens((cur) => (cur.length > 1 ? cur.filter((it) => it.key !== key) : cur));
  }
  async function upload(key: string, file: File | undefined) {
    if (!file) return;
    upd(key, { subindo: true });
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload", { method: "POST", body: form });
      const data = await resp.json();
      if (data.ok) upd(key, { fotoUrl: data.url });
      else setErro(data.erro || "Falha no upload da foto.");
    } catch {
      setErro("Não consegui subir a foto. (O Blob Store está configurado?)");
    } finally {
      upd(key, { subindo: false });
    }
  }
  async function doBanco(key: string) {
    setErro(null);
    upd(key, { subindo: true });
    try {
      const r = await sortearImagemBancoAction(marcaId);
      if (r.ok) upd(key, { fotoUrl: r.url });
      else setErro(r.erro);
    } finally {
      upd(key, { subindo: false });
    }
  }
  function gerar() {
    setErro(null);
    if (!dataAlvo) {
      setErro("Clique num dia no calendário pra escolher quando postar (ex: domingo).");
      return;
    }
    const aniversariantes = itens
      .filter((i) => i.nome.trim() && i.fotoUrl)
      .map((i) => ({ nome: i.nome.trim(), idade: i.idade.trim(), recado: i.recado.trim() || undefined, fotoUrl: i.fotoUrl }));
    if (aniversariantes.length === 0) {
      setErro("Adicione ao menos um aniversariante com foto e nome.");
      return;
    }
    startTransition(async () => {
      const r = await criarAniversariantes({
        marcaId,
        data: dataAlvo,
        semana: semana.trim() || undefined,
        tituloCapa: tituloCapa.trim() || undefined,
        legenda: legenda.trim() || undefined,
        corFundo: cor || undefined,
        aniversariantes,
      });
      if (r.ok) {
        setItens([novoItem()]);
        setSemana("");
        setTituloCapa("");
        setLegenda("");
        onGerado(dataAlvo ?? undefined); // filtra a lista no dia gerado (não abre todos)
        router.refresh();
      } else setErro(r.erro);
    });
  }

  const prontos = itens.filter((i) => i.nome.trim() && i.fotoUrl).length;

  return (
    <div className="mt-3">
      <p className="mb-3 text-xs text-muted">Suba a foto de cada aniversariante + nome e idade (1 por slide) — vira um carrossel festivo, ótimo pra postar aos domingos. Sem IA aqui: você monta com as fotos reais.</p>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-muted">
          Título da capa <span className="text-muted/70">(opcional)</span>
          <input value={tituloCapa} onChange={(e) => setTituloCapa(e.target.value)} placeholder="Aniversariantes da Semana" className="input-base" />
        </label>
        <label className="flex-1 text-xs text-muted">
          Semana <span className="text-muted/70">(opcional — aparece na capa)</span>
          <input value={semana} onChange={(e) => setSemana(e.target.value)} placeholder="Ex: Semana de 08 a 14 de junho" className="input-base" />
        </label>
        <div className="text-xs text-muted">
          Dia do post
          <div className="mt-1 rounded-md border border-linha bg-preto px-3 py-2 text-sm">
            {dataAlvo ? <span className="font-semibold text-white">📅 {dataBR(dataAlvo)}</span> : <span className="text-muted">Clique num dia ↑</span>}
          </div>
        </div>
      </div>

      {/* Cor de fundo do carrossel inteiro */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">🎨 Cor de fundo</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCor("")} title="Usa a cor da marca" className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${cor === "" ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>🎲 Auto</button>
          {CORES_EXTRAS.map((c) => (
            <button key={c} type="button" onClick={() => setCor(c)} title={c} aria-label={`Cor ${c}`} className={`h-9 w-9 rounded-lg border-2 transition ${cor.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-white/40" : "border-linha hover:border-white/60"}`} style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {itens.map((it, i) => (
          <div key={it.key} className="flex flex-wrap items-start gap-3 rounded-lg border border-linha bg-preto p-2.5">
            <span className="pt-2 text-xs font-semibold text-muted">{i + 1}</span>

            {/* Foto: upload OU sortear do banco */}
            <div className="flex flex-col items-center gap-1">
              <label className="relative flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-linha bg-preto-card text-center text-[10px] text-muted transition hover:border-vermelho">
                {it.subindo ? (
                  "…"
                ) : it.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.fotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  "📤 Foto"
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(it.key, e.target.files?.[0])} />
              </label>
              <button type="button" onClick={() => doBanco(it.key)} disabled={it.subindo} title="Sortear foto do seu banco de imagens" className="rounded border border-linha px-1.5 py-0.5 text-[10px] text-muted transition hover:border-vermelho hover:text-white disabled:opacity-40">🎲 Banco</button>
            </div>

            <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <input value={it.nome} onChange={(e) => upd(it.key, { nome: e.target.value })} placeholder="Nome" className="input-base min-w-[8rem] flex-1" />
                <input value={it.idade} onChange={(e) => upd(it.key, { idade: e.target.value })} placeholder="Ex: 8 aninhos" className="input-base w-28" />
              </div>
              <input value={it.recado} onChange={(e) => upd(it.key, { recado: e.target.value })} placeholder="💬 Recado (opcional): Parabéns, princesa!" className="input-base" />
            </div>

            <button type="button" onClick={() => remove(it.key)} disabled={itens.length === 1} title="Remover" className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-30">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItens((cur) => [...cur, novoItem()])} className="rounded-lg border border-linha px-3 py-2 text-sm font-semibold text-white transition hover:border-vermelho">+ Adicionar aniversariante</button>
        <button onClick={gerar} disabled={isPending || prontos === 0} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-50">
          {isPending ? "Gerando…" : `🎂 Gerar carrossel${prontos ? ` (${prontos})` : ""}`}
        </button>
      </div>

      {/* Legenda editável (opcional) */}
      <label className="mt-3 block text-xs text-muted">
        Legenda <span className="text-muted/70">(opcional — vazio = gera automático com os nomes)</span>
        <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={3} placeholder="Deixe vazio pra gerar uma legenda festiva com os nomes, ou escreva a sua…" className="input-base resize-y" />
      </label>

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
    </div>
  );
}
