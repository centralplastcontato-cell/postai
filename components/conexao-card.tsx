"use client";

import { useState, useEffect, useTransition, type ReactNode } from "react";
import { verificarConexaoMarca } from "@/app/actions/metricas";

type Info = {
  conectada: boolean;
  username?: string;
  seguidores?: number | null;
  posts?: number | null;
  tokenExpira?: string | null;
  temFacebook?: boolean;
  erro?: string;
};

// Cartão "Instagram / Meta": mostra @conta, seguidores, posts e status do token da
// marca, lendo da Meta ao montar e no botão "Verificar agora". Camada 1 das métricas.
export function ConexaoCard({ marcaId, temConexao }: { marcaId: string; temConexao: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [, startTransition] = useTransition();

  function verificar() {
    setCarregando(true);
    startTransition(async () => {
      const r = await verificarConexaoMarca(marcaId);
      setInfo(r.ok ? r : { conectada: false, erro: r.erro });
      setCarregando(false);
    });
  }
  useEffect(() => {
    if (temConexao) verificar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temConexao]);

  const conectada = info?.conectada ?? temConexao;
  const carregandoInicial = carregando && info == null;

  const cell = (rotulo: string, valor: ReactNode) => (
    <div className="rounded-lg border border-linha bg-preto px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{rotulo}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-white">{valor}</p>
    </div>
  );
  const num = (n?: number | null) => (carregandoInicial ? "…" : typeof n === "number" ? n.toLocaleString("pt-BR") : "—");

  return (
    <div className="rounded-xl border border-linha bg-preto-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">📊 Instagram / Meta{info?.temFacebook ? " + Facebook" : ""}</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${conectada ? "border-green-500/40 bg-green-500/15 text-green-300" : "border-amber-500/40 bg-amber-500/15 text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${conectada ? "bg-green-400" : "bg-amber-400"}`} /> {conectada ? "Conectado" : "Não conectado"}
        </span>
      </div>

      {!temConexao ? (
        <p className="text-sm text-muted">Esta marca ainda não tem o Instagram conectado. Vá em <strong className="text-white">⚙️ Configurações</strong> e conecte (IG User ID + token) pra ver os números aqui.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cell("Conta", info?.username ? `@${info.username}` : carregandoInicial ? "…" : "—")}
            {cell("Seguidores", num(info?.seguidores))}
            {cell("Posts", num(info?.posts))}
            {cell("Token", info?.tokenExpira ?? (carregandoInicial ? "…" : "ativo"))}
          </div>
          <p className="mt-3 text-xs text-muted">Carrosséis, posts e stories vão pra esta conta automaticamente (piloto, na hora agendada).</p>
          {info?.erro && <p className="mt-2 text-xs text-red-400">⚠ {info.erro}</p>}
          <button onClick={verificar} disabled={carregando} className="mt-3 rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">
            {carregando ? "Verificando…" : "↻ Verificar agora"}
          </button>
        </>
      )}
    </div>
  );
}
