"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarMarca, excluirMarca, testarConexao } from "@/app/actions/marcas";

export type MarcaView = {
  id: string;
  nome: string;
  corPrimaria: string;
  corFundo: string;
  logoTexto: string;
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

  const diasCar = parseDias(f.diasCarrossel);
  const diasFeed = parseDias(f.diasFeed);

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
        logoTexto: f.logoTexto,
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
  function handleExcluir() {
    if (!confirm(`Excluir a marca "${f.nome}" e todo o conteúdo dela? Não dá pra desfazer.`)) return;
    startTransition(async () => {
      const r = await excluirMarca(f.id);
      if (r.ok) router.push("/painel");
      else setErro(r.erro);
    });
  }

  const inp = "mt-1 w-full rounded-md border border-linha bg-preto px-3 py-2 text-sm text-white placeholder:text-muted/60 focus:border-vermelho focus:outline-none";
  const diaBtn = (ativo: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-semibold transition ${ativo ? "bg-vermelho text-white" : "border border-linha text-muted hover:text-white"}`;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Identidade */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Identidade</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Nome<input value={f.nome} onChange={(e) => set("nome", e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted">Texto da faixa (na arte)<input value={f.logoTexto} onChange={(e) => set("logoTexto", e.target.value)} placeholder="CASTELO DA DIVERSÃO" className={inp} /></label>
          <label className="text-xs text-muted">Cor principal<input type="color" value={f.corPrimaria} onChange={(e) => set("corPrimaria", e.target.value)} className="mt-1 h-10 w-full rounded-md border border-linha bg-preto" /></label>
          <label className="text-xs text-muted">Cor de fundo<input type="color" value={f.corFundo} onChange={(e) => set("corFundo", e.target.value)} className="mt-1 h-10 w-full rounded-md border border-linha bg-preto" /></label>
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
          <select value={f.horaPost} onChange={(e) => set("horaPost", Number(e.target.value))} className="mt-1 block rounded-md border border-linha bg-preto px-2 py-2 text-sm text-white focus:border-vermelho focus:outline-none">
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
