"use client";

import { useState } from "react";
import { excluirMarca } from "@/app/actions/marcas";

// Exclusão de marca em DUAS telas: 1) aviso de que apaga tudo; 2) a SENHA de quem está logado
// (conferida no servidor — sem ela nada é apagado). Usado no card da marca e nas Configurações.
export function ModalExcluirMarca({ id, nome, onFechar, onExcluida }: { id: string; nome: string; onFechar: () => void; onExcluida: () => void }) {
  const [etapa, setEtapa] = useState<"aviso" | "senha">("aviso");
  const [senha, setSenha] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const trava = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  async function excluir(e: React.SyntheticEvent) {
    trava(e);
    if (!senha) { setErro("Digite a sua senha."); return; }
    setExcluindo(true);
    setErro(null);
    try {
      const r = await excluirMarca(id, senha);
      if (!r.ok) { setErro(r.erro); setExcluindo(false); setSenha(""); return; }
      onExcluida();
    } catch {
      setErro("Não consegui excluir agora. Tente de novo.");
      setExcluindo(false);
    }
  }

  return (
    <div onClick={(e) => { trava(e); if (!excluindo) onFechar(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      {/* o modal pode estar DENTRO do link do card: todo clique trava a navegação */}
      <div onClick={trava} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-5">
        {etapa === "aviso" ? (
          <>
            <p className="text-sm font-semibold text-white">Excluir a marca “{nome}”?</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Isso apaga <strong className="text-red-300">TUDO</strong> dela — fotos, festas, carrosséis, publicações, stories e métricas. <strong className="text-white/80">Não dá pra desfazer.</strong>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={(e) => { trava(e); onFechar(); }} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white">Cancelar</button>
              <button type="button" onClick={(e) => { trava(e); setEtapa("senha"); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">Excluir tudo</button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm font-semibold text-white">🔒 Confirme com a sua senha</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Pra apagar <strong className="text-white/80">“{nome}”</strong> de vez, digite a senha que você usa pra entrar no painel.
            </p>
            <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") excluir(e); }} placeholder="Sua senha" autoComplete="current-password" className="input-base mt-3 w-full" />
            {erro && <p className="mt-2 text-sm text-vermelho">{erro}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={(e) => { trava(e); onFechar(); }} disabled={excluindo} className="rounded-lg border border-linha px-4 py-2 text-sm text-muted transition hover:text-white disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={excluir} disabled={excluindo || !senha} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">{excluindo ? "Excluindo…" : "Excluir de vez"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
