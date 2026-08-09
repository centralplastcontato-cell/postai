"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { salvarMarca, salvarIdentidadeMarca, excluirMarca, testarConexao, extrairCoresLogo, buscarPaginasFacebook } from "@/app/actions/marcas";
import { ConfirmDialog } from "./confirm-dialog";
import { rotuloHora, HORAS_RECOMENDADAS } from "@/lib/horarios";

export type MarcaView = {
  id: string;
  nome: string;
  corPrimaria: string;
  corFundo: string;
  capasArte?: string[]; // biblioteca de artes de capa (IA) da marca, pra reusar
  feedArtes?: string[]; // biblioteca de artes de fundo de feed (IA) da marca, pra reusar
  mascoteUrl?: string; // mascote oficial da marca (PNG transparente)
  mascotesArte?: string[]; // biblioteca de opções de mascote geradas pela IA
  paleta: string; // JSON array de hex
  logoTexto: string;
  logoUrl: string;
  site: string;
  telefone: string;
  igUserId: string;
  accessToken: string; // write-only: vem vazio do servidor; só é enviado quando o admin digita um novo
  temToken: boolean; // sinaliza que já existe um token salvo (sem expor o valor)
  fbPageId: string;
  diasCarrossel: string;
  diasFeed: string;
  horaPost: number;
  horaCarrossel: number;
  descricao: string;
  ativa: boolean;
  espelharStory: boolean;
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

// Header padronizado de cada seção: ícone num quadradinho + título + descrição + status opcional.
function SecaoHeader({ icone, titulo, sub, extra }: { icone: string; titulo: string; sub?: string; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-lg">{icone}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-white">{titulo}</h3>
        {sub && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

// Toggle (switch) estilizado — substitui o checkbox nativo, no tema escuro do app.
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${on ? "bg-vermelho" : "bg-zinc-700"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

// somenteIdentidade = formulário enxuto pro DONO (cliente/teste): só a seção de Identidade
// (nome, cores, logo, textos). Esconde conexão, agenda e exclusão — isso é só do admin.
export function MarcaForm({ marca, somenteIdentidade = false }: { marca: MarcaView; somenteIdentidade?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<MarcaView>(marca);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [paginasFB, setPaginasFB] = useState<{ id: string; nome: string }[] | null>(null);
  const [buscandoFB, setBuscandoFB] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const [lendoCores, setLendoCores] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

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
      // Dono (cliente/teste): salva SÓ a identidade pela action restrita. Admin: salva tudo.
      const r = somenteIdentidade
        ? await salvarIdentidadeMarca({
            id: f.id,
            nome: f.nome,
            corPrimaria: f.corPrimaria,
            corFundo: f.corFundo,
            paleta: f.paleta,
            logoTexto: f.logoTexto,
            logoUrl: f.logoUrl,
            site: f.site,
            telefone: f.telefone,
            descricao: f.descricao,
          })
        : await salvarMarca({
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
            accessToken: f.accessToken.trim() || undefined, // só envia se digitaram um novo (não apaga o salvo)
            diasCarrossel: f.diasCarrossel,
            diasFeed: f.diasFeed,
            horaPost: f.horaPost,
            horaCarrossel: f.horaCarrossel,
            descricao: f.descricao,
            ativa: f.ativa,
            espelharStory: f.espelharStory,
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
      const igUserId = f.igUserId.trim();
      const accessToken = f.accessToken.trim();
      const r = await testarConexao({ igUserId, accessToken });
      if (!r.ok) {
        setTeste(`✕ ${r.erro}`);
        return;
      }
      // Conexão válida: GRAVA na hora. Sem isso, se o usuário trocar de aba (o
      // formulário é desmontado pelo MarcaHub) o que ele colou se perde, e um
      // "Salvar" posterior gravaria os valores antigos do banco.
      const s = await salvarMarca({ id: f.id, igUserId, accessToken });
      if (s?.ok) {
        setF((cur) => ({ ...cur, igUserId, accessToken }));
        setTeste(`✓ Conectado e salvo: @${r.username}`);
        router.refresh();
      } else {
        setTeste(`✓ Conectado, mas não consegui salvar: ${s?.erro || "erro"}`);
      }
    } finally {
      setTestando(false);
    }
  }
  async function handleBuscarPaginas() {
    setFbMsg(null);
    setBuscandoFB(true);
    try {
      const r = await buscarPaginasFacebook(f.accessToken.trim());
      if (!r.ok) {
        setFbMsg(`✕ ${r.erro}`);
        setPaginasFB(null);
        return;
      }
      setPaginasFB(r.paginas);
      if (r.paginas.length === 0) setFbMsg("Nenhuma Página encontrada nesse token.");
    } finally {
      setBuscandoFB(false);
    }
  }
  async function escolherPagina(pageId: string, nome: string) {
    setFbMsg(null);
    const s = await salvarMarca({ id: f.id, fbPageId: pageId });
    if (s?.ok) {
      setF((cur) => ({ ...cur, fbPageId: pageId }));
      setPaginasFB(null);
      setFbMsg(`✓ Página conectada: ${nome}`);
      router.refresh();
    } else {
      setFbMsg(`✕ Não consegui salvar: ${s?.erro || "erro"}`);
    }
  }
  async function desconectarFacebook() {
    const s = await salvarMarca({ id: f.id, fbPageId: "" });
    if (s?.ok) {
      setF((cur) => ({ ...cur, fbPageId: "" }));
      setPaginasFB(null);
      setFbMsg("Facebook desconectado.");
      router.refresh();
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
      // Já lê as cores do logo AUTOMATICAMENTE (sem o usuário precisar clicar em "Ler cores").
      setLendoCores(true);
      const cores = await extrairCoresLogo(data.url);
      if (cores.ok) {
        set("corPrimaria", cores.corPrimaria);
        set("corFundo", cores.corFundo);
        set("paleta", JSON.stringify(cores.paleta));
        const n = cores.paleta.length;
        setAviso(`✓ Logo enviado e 🎨 ${n} ${n === 1 ? "cor lida" : "cores lidas"} do logo! Confira e clique em Salvar.`);
      } else {
        setAviso("✓ Logo enviado! Não consegui ler as cores agora — ajuste na mão ou tente “Ler cores com IA”.");
      }
      setLendoCores(false);
      setTimeout(() => setAviso(null), 7000);
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
        setAviso(`🎨 ${n} ${n === 1 ? "cor lida" : "cores lidas"} do logo! Principal ${r.corPrimaria}. Confira e clique em Salvar.`);
        setTimeout(() => setAviso(null), 8000);
      } else setErro(r.erro);
      setLendoCores(false);
    });
  }
  function handleExcluir() {
    setConfirmarExcluir(true);
  }
  function confirmarExclusao() {
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
        <SecaoHeader icone="🎨" titulo="Identidade da marca" sub="Logo, cores e textos que aparecem nas artes dos posts." />

        {/* Preview ao vivo: como a marca aparece na faixa das artes (atualiza enquanto você edita) */}
        <div className="mb-4 overflow-hidden rounded-xl border border-linha">
          <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: f.corFundo || "#0E0E0E" }}>
            {f.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.logoUrl} alt="" className="h-10 max-w-[120px] object-contain" />
            ) : (
              <span className="text-[10px] text-white/50">sem logo</span>
            )}
            <span className="font-titulo truncate text-lg font-extrabold tracking-wide" style={{ color: f.corPrimaria }}>{f.logoTexto || f.nome || "SUA MARCA"}</span>
          </div>
          {paleta.length > 0 && <div className="flex h-2">{paleta.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}</div>}
          <div className="flex items-center justify-between gap-2 bg-preto px-4 py-1.5 text-[10px] text-muted">
            <span className="truncate">🌐 {f.site || "seu-site.com.br"}</span>
            <span className="truncate">📱 {f.telefone || "seu telefone"}</span>
          </div>
        </div>

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
          <div className="text-xs text-muted">Cor principal
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={f.corPrimaria} onChange={(e) => set("corPrimaria", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-linha bg-transparent p-0.5" />
              <span className="rounded bg-preto px-2 py-1 text-[11px] uppercase text-white/70">{f.corPrimaria}</span>
            </div>
          </div>
          <div className="text-xs text-muted">Cor de fundo
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={f.corFundo} onChange={(e) => set("corFundo", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-linha bg-transparent p-0.5" />
              <span className="rounded bg-preto px-2 py-1 text-[11px] uppercase text-white/70">{f.corFundo}</span>
            </div>
          </div>
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
          <label className="text-xs text-muted">Telefone/WhatsApp (aparece no convite dos posts)<input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(15) 99999-9999" className={inp} /></label>
        </div>
        <label className="mt-3 block text-xs text-muted">Sobre o negócio (a IA usa pra escrever no tom certo)
          <textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} placeholder="Ex: Buffet infantil em Sorocaba. Festas temáticas, brinquedos, monitores. Público: famílias com crianças de 1 a 10 anos." className={inp} />
        </label>
      </section>

      {!somenteIdentidade && (
        <>
      {/* Conexão Instagram */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <SecaoHeader
          icone="📸"
          titulo="Conexão com o Instagram"
          sub="Cole o IG User ID e o token (com permissão de publicar). Ao testar com sucesso, a conexão é salva na hora — não precisa o Salvar de baixo."
          extra={
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${f.temToken || f.igUserId ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400"}`}>
              {f.temToken || f.igUserId ? "✓ Conectado" : "Não conectado"}
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-3">
          <label className="text-xs text-muted">IG User ID<input value={f.igUserId} onChange={(e) => set("igUserId", e.target.value)} placeholder="17841400000000000" autoComplete="off" className={inp} /></label>
          <label className="text-xs text-muted">Access Token
            <input value={f.accessToken} onChange={(e) => set("accessToken", e.target.value)} placeholder={f.temToken ? "•••• já conectado — cole um novo só pra trocar" : "EAA..."} autoComplete="off" className={inp} />
            {f.temToken && !f.accessToken && <span className="mt-1 block text-[11px] text-green-400/80">✓ Token já configurado (guardado em segurança no servidor — não aparece aqui).</span>}
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={handleTestar} disabled={testando} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">{testando ? "Testando…" : "Testar e salvar conexão"}</button>
          {teste && <span className={`text-sm ${teste.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{teste}</span>}
        </div>
      </section>

      {/* Conexão Facebook (opcional) — se conectar a Página, posta também no Facebook */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <SecaoHeader
          icone="📘"
          titulo="Conexão com o Facebook (opcional)"
          sub="Conecte a Página do Facebook pra publicar nos dois ao mesmo tempo. Usa o mesmo token do Instagram (permissão pages_manage_posts no app Meta)."
          extra={f.fbPageId ? <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-green-400">✓ Conectado</span> : null}
        />

        {f.fbPageId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300">✓ Página conectada (ID: {f.fbPageId})</span>
            <button onClick={desconectarFacebook} className="rounded-md border border-linha px-3 py-1 text-xs text-muted transition hover:border-vermelho hover:text-white">Desconectar</button>
          </div>
        ) : (
          <button onClick={handleBuscarPaginas} disabled={buscandoFB || !f.accessToken.trim()} title={!f.accessToken.trim() ? "Conecte o Instagram (token) primeiro" : undefined} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">{buscandoFB ? "Buscando…" : "🔎 Buscar minhas Páginas"}</button>
        )}

        {paginasFB && paginasFB.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">Escolha a Página desta marca:</p>
            <div className="flex flex-wrap gap-2">
              {paginasFB.map((p) => (
                <button key={p.id} onClick={() => escolherPagina(p.id, p.nome)} className="rounded-lg border border-linha px-3 py-1.5 text-xs font-semibold text-white transition hover:border-vermelho hover:bg-preto">{p.nome}</button>
              ))}
            </div>
          </div>
        )}
        {fbMsg && <p className={`mt-2 text-sm ${fbMsg.startsWith("✓") ? "text-green-400" : fbMsg.startsWith("✕") ? "text-red-400" : "text-muted"}`}>{fbMsg}</p>}
      </section>

      {/* Agenda */}
      <section className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
        <SecaoHeader icone="⏰" titulo="Agenda automática" sub="Em quais dias e horários o piloto posta sozinho." />
        <p className="mb-1 text-xs text-muted">🖼️ Dias de carrossel</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIAS.map((d) => <button key={d.n} type="button" onClick={() => toggleDia("diasCarrossel", d.n)} className={diaBtn(diasCar.includes(d.n))}>{d.l}</button>)}
        </div>
        <p className="mb-1 text-xs text-muted">📱 Dias de feed</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIAS.map((d) => <button key={d.n} type="button" onClick={() => toggleDia("diasFeed", d.n)} className={diaBtn(diasFeed.includes(d.n))}>{d.l}</button>)}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">🖼️ Hora do carrossel (BRT)
            <select value={f.horaCarrossel} onChange={(e) => set("horaCarrossel", Number(e.target.value))} className="input-base">
              {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
            </select>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...HORAS_RECOMENDADAS].map((h) => (
                <button key={h} type="button" onClick={() => set("horaCarrossel", h)} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${f.horaCarrossel === h ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>⭐ {String(h).padStart(2, "0")}h</button>
              ))}
            </div>
          </label>
          <label className="text-xs text-muted">📱 Hora do feed (BRT)
            <select value={f.horaPost} onChange={(e) => set("horaPost", Number(e.target.value))} className="input-base">
              {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{rotuloHora(h)}</option>)}
            </select>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...HORAS_RECOMENDADAS].map((h) => (
                <button key={h} type="button" onClick={() => set("horaPost", h)} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${f.horaPost === h ? "border-vermelho bg-vermelho/15 text-white" : "border-linha text-muted hover:text-white"}`}>⭐ {String(h).padStart(2, "0")}h</button>
              ))}
            </div>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">⭐ = melhores horários pro público de buffet (manhã, almoço e noite). Muda só os <strong className="text-white/70">próximos</strong> posts — o que já está agendado fica como está.</p>
        <p className="mt-1.5 text-[11px] text-muted">⏰ O piloto automático posta cada um na sua hora (de hora em hora). Ative o despertador no Supabase pra valer.</p>
        <div className="mt-4 space-y-3 border-t border-linha pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">🚀 Piloto automático ativo</span>
            <Toggle on={f.ativa} onChange={(v) => set("ativa", v)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">🟣 Espelhar todo post no Story <span className="block text-xs font-normal text-muted">cada post do feed também sobe como Story (dá pra ajustar post a post)</span></span>
            <Toggle on={f.espelharStory} onChange={(v) => set("espelharStory", v)} />
          </div>
        </div>
      </section>
        </>
      )}

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleSalvar} disabled={isPending} className="rounded-lg bg-vermelho px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-50">{isPending ? "Salvando…" : salvo ? "✓ Salvo!" : "Salvar"}</button>
        {!somenteIdentidade && (
          <button onClick={handleExcluir} disabled={isPending} className="rounded-lg border border-red-900 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-950/40 disabled:opacity-50">Excluir marca</button>
        )}
      </div>

      <ConfirmDialog
        aberto={confirmarExcluir}
        titulo={`Excluir a marca "${f.nome}"?`}
        descricao="Todo o conteúdo dela (carrosséis e publicações) será apagado. Não dá pra desfazer."
        textoConfirmar="Excluir marca"
        onConfirmar={() => {
          confirmarExclusao();
          setConfirmarExcluir(false);
        }}
        onCancelar={() => setConfirmarExcluir(false)}
        ocupado={isPending}
      />
    </div>
  );
}
