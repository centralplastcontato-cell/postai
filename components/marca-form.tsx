"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarMarca, excluirMarca, testarConexao, extrairCoresLogo } from "@/app/actions/marcas";

export type MarcaView = {
  id: string;
  nome: string;
  corPrimaria: string;
  corFundo: string;
  paleta: string; // JSON array de hex
  logoTexto: string;
  logoUrl: string;
  site: string;
  telefone: string;
  igUserId: string;
  accessToken: string;
  diasCarrossel: string;
  diasFeed: string;
  horaPost: number;
  descricao: string;
  ativa: boolean;
};

const DIAS = [
  { n: 0, l: "Dom" },
  { n: 1, l: "Seg" },
  { n: 2, l: "Ter" },
  { n: 3, l: "Qua" },
  { n: 4, l: "Qui" },
  { n: 5, l: "Sex" },
  { n: 6, l: "Sáb" },
];

function parseDias(s: string): number[] {
  return s.split(",").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
}

export function MarcaForm({ marca }: { marca: MarcaView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<MarcaView>(marca);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const [lendoCores, setLendoCores] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const diasCar = parseDias(f.diasCarrossel);
  const diasFeed = parseDias(f.diasFeed);
  const paleta: string[] = (() => {
    try {
      const a = JSON.parse(f.paleta || "[]");
      return Array.isArray(a) ? a.filter((c) => typeof c === "string") : [];
    } catch {
      return [];
    }
  })();

  function set<K extends keyof MarcaView>(k: K, v: MarcaView[K]) {
    setF((cur) => ({ ...cur, [k]: v }));
    setSalvo(false);
  }
  function toggleDia(campo: "diasCarrossel" | "diasFeed", n: number) {
    const atual = parseDias(f[campo]);
    const novo = atual.includes(n) ? atual.filter((x) => x !== n) : [...atual, n].sort();
    set(campo, novo.join(","));
  }

  function handleSalvar() {
    setErro(null);
    startTransition(async () => {
      const r = await salvarMarca({
        id: f.id,
        nome: f.nome,
        corPrimaria: f.corPrimaria,
        corFundo: f.corFundo,
        paleta: f.paleta,
        logoTexto: f.logoTexto,
        logoUrl: f.logoUrl,
        site: f.site,
        telefone: f.telefone,
        igUserId: f.igUserId,
        accessToken: f.accessToken,
        diasCarrossel: f.diasCarrossel,
        diasFeed: f.diasFeed,
        horaPost: f.horaPost,
        descricao: f.descricao,
        ativa: f.ativa,
      });
      if (r?.ok) {
        setSalvo(true);
        router.refresh();
      } else setErro(r?.erro || "Não consegui salvar.");
    });
  }
  async function handleTestar() {
    setTeste(null);
    setTestando(true);
    try {
      const r = await testarConexao({ igUserId: f.igUserId, accessToken: f.accessToken });
      setTeste(r.ok ? `✓ Conectado: @${r.username}` : `✕ ${r.erro}`);
    } finally {
      setTestando(false);
    }
  }
  async function handleUploadLogo(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setSubindoLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/marketing/upload?tipo=logo", { method: "POST", body: form });
      const data = await resp.json();
      if (!data.ok) {
        setErro(data.erro || "Falha no upload do logo.");
        return;
      }
      set("logoUrl", data.url);
      setAviso("✓ Logo enviado (fundo removido)! Agora clique em “Ler cores com IA”.");
      setTimeout(() => setAviso(null), 5000);
    } catch {
      setErro("Não consegui subir o logo. (O Blob Store já está configurado?)");
    } finally {
      setSubindoLogo(false);
    }
  }
  function handleLerCores() {
    if (!f.logoUrl) {
      setErro("Suba o logo primeiro.");
      return;
    }
    setErro(null);
    setAviso(null);
    setLendoCores(true);
    startTransition(async () => {
      const r = await extrairCoresLogo(f.logoUrl);
      if (r.ok) {
        set("corPrimaria", r.corPrimaria);
        set("corFundo", r.corFundo);
        set("paleta", JSON.stringify(r.paleta));
        const n = r.paleta.length;
        setAviso(`🎨 ${n} ${n === 1 ? "cor lida" : "cores lidas"} do logo! Principal ${r.corPrimaria}. A régua das artes vai ficar multicolor. Confira e clique em Salvar.`);
        setTimeout(() => setAviso(null), 8000);
      } else setErro(r.erro);
      setLendoCores(false);
    });
  }
  function handleExcluir() {
    if (!confirm(`Excluir a marca "${f.nome}" e todo o conteúdo dela? Não dá pra desfazer.`)) return;
    startTransition(async () => {
      const r = await excluirMarca(f.id);
      if (r.ok) router.push("/painel");
      else setErro(r.erro);
    });
  }

  const inp = "input-base";
  const diaBtn = (ativo: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-semibold transition ${ativo ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Identidade */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Identidade</h3>

        {/* Logo: sobe a imagem, a IA lê as cores e o logo aparece na arte */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-linha bg-preto p-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-linha" style={{ backgroundColor: f.corFundo || "#0E0E0E" }}>
            {f.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted">sem logo</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho">
              {subindoLogo ? "Subindo…" : f.logoUrl ? "Trocar logo" : "📤 Subir logo (PNG)"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleUploadLogo(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={handleLerCores} disabled={!f.logoUrl || lendoCores} className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:border-amber-400 disabled:opacity-40">
              {lendoCores ? "🎨 Lendo…" : "🎨 Ler cores com IA"}
            </button>
            {f.logoUrl && (
              <button type="button" onClick={() => set("logoUrl", "")} className="rounded-md border border-linha px-3 py-1.5 text-xs text-muted transition hover:text-white">Remover</button>
            )}
          </div>
          <p className="w-full text-[11px] text-muted">Use <strong className="text-white/80">PNG com fundo transparente</strong> — se tiver fundo (cinza, branco), ele vira um quadradão na arte e atrapalha a IA a ler as cores. A IA monta a paleta do logo e ele aparece na faixa das artes.</p>
          {aviso && (
            <p className="w-full rounded-md border border-green-700 bg-green-950/40 px-3 py-2 text-xs text-green-300">{aviso}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Nome<input value={f.nome} onChange={(e) => set("nome", e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted">Texto da faixa (na arte)<input value={f.logoTexto} onChange={(e) => set("logoTexto", e.target.value)} placeholder="CASTELO DA DIVERSÃO" className={inp} /></label>
          <label className="text-xs text-muted">Cor principal<input type="color" value={f.corPrimaria} onChange={(e) => set("corPrimaria", e.target.value)} className="input-compact" /></label>
          <label className="text-xs text-muted">Cor de fundo<input type="color" value={f.corFundo} onChange={(e) => set("corFundo", e.target.value)} className="input-compact" /></label>
          {paleta.length > 0 && (
            <div className="text-xs text-muted sm:col-span-2">
              Paleta da marca (régua multicolor das artes)
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {paleta.map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 rounded-md border border-linha bg-preto px-2 py-1">
                    <span className="h-4 w-4 rounded-sm border border-white/10" style={{ backgroundColor: c }} />
                    <span className="text-[10px] uppercase text-white/70">{c}</span>
                  </span>
                ))}
                <button type="button" onClick={() => set("paleta", "[]")} className="text-[10px] text-muted underline transition hover:text-white">limpar</button>
              </div>
            </div>
          )}
          <label className="text-xs text-muted">Site (rodapé da arte)<input value={f.site} onChange={(e) => set("site", e.target.value)} placeholder="castelodadiversao.com.br" className={inp} /></label>
          <label className="text-xs text-muted">Telefone/WhatsApp (CTA)<input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(15) 99999-9999" className={inp} /></label>
        </div>
        <label className="mt-3 block text-xs text-muted">Sobre o negócio (a IA usa pra escrever no tom certo)
          <textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} placeholder="Ex: Buffet infantil em Sorocaba. Festas temáticas, brinquedos, monitores. Público: famílias com crianças de 1 a 10 anos." className={inp} />
        </label>
      </section>

      {/* Conexão Instagram */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="mb-1 text-sm font-semibold text-white">Conexão com o Instagram</h3>
        <p className="mb-3 text-xs text-muted">Cole o IG User ID e o token do Usuário do Sistema desta conta (com permissão de publicar).</p>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-xs text-muted">IG User ID<input value={f.igUserId} onChange={(e) => set("igUserId", e.target.value)} placeholder="17841400000000000" className={inp} /></label>
          <label className="text-xs text-muted">Access Token<input value={f.accessToken} onChange={(e) => set("accessToken", e.target.value)} placeholder="EAA..." className={inp} /></label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={handleTestar} disabled={testando} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">{testando ? "Testando…" : "Testar conexão"}</button>
          {teste && <span className={`text-sm ${teste.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{teste}</span>}
        </div>
      </section>

      {/* Agenda */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Agenda automática</h3>
        <p className="mb-1 text-xs text-muted">🖼️ Dias de carrossel</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIAS.map((d) => <button key={d.n} type="button" onClick={() => toggleDia("diasCarrossel", d.n)} className={diaBtn(diasCar.includes(d.n))}>{d.l}</button>)}
        </div>
        <p className="mb-1 text-xs text-muted">📱 Dias de feed</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIAS.map((d) => <button key={d.n} type="button" onClick={() => toggleDia("diasFeed", d.n)} className={diaBtn(diasFeed.includes(d.n))}>{d.l}</button>)}
        </div>
        <label className="text-xs text-muted">Hora de postar (BRT)
          <select value={f.horaPost} onChange={(e) => set("horaPost", Number(e.target.value))} className="input-base">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={f.ativa} onChange={(e) => set("ativa", e.target.checked)} /> Piloto automático ativo
        </label>
      </section>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleSalvar} disabled={isPending} className="rounded-lg bg-vermelho px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{isPending ? "Salvando…" : salvo ? "✓ Salvo!" : "Salvar"}</button>
        <button onClick={handleExcluir} disabled={isPending} className="rounded-lg border border-red-900 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-950/40 disabled:opacity-50">Excluir marca</button>
      </div>
    </div>
  );
}
