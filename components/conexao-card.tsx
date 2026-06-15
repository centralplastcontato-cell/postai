"use client";

import { useState, useEffect, useTransition, type ReactNode } from "react";
import { verificarConexaoMarca } from "@/app/actions/metricas";

type TokenInfo = { estado: "nunca" | "valido" | "expirado" | "desconhecido"; dias: number | null; dataBR: string | null };
type Info = {
  conectada: boolean;
  username?: string;
  seguidores?: number | null;
  posts?: number | null;
  token?: TokenInfo;
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

  // Cartão do Token: "não expira" (System User), "vence em X dias" (com cor por urgência)
  // ou "vencido". O dia que conecta cliente com token de 60 dias, isso avisa antes de quebrar.
  function tokenCell() {
    const t = info?.token;
    let valor = carregandoInicial ? "…" : "ativo";
    let cor = "text-white";
    let sub: string | null = null;
    if (t?.estado === "nunca") {
      valor = "não expira";
    } else if (t?.estado === "valido" && typeof t.dias === "number") {
      valor = `vence em ${t.dias} ${t.dias === 1 ? "dia" : "dias"}`;
      cor = t.dias <= 7 ? "text-red-400" : t.dias <= 30 ? "text-amber-300" : "text-white";
      sub = t.dataBR;
    } else if (t?.estado === "expirado") {
      valor = "vencido";
      cor = "text-red-400";
      sub = "reconecte";
    }
    return (
      <div className="rounded-lg border border-linha bg-preto px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted">Token</p>
        <p className={`mt-0.5 truncate text-lg font-bold ${cor}`}>{valor}</p>
        {sub && <p className="text-[10px] text-muted">{sub}</p>}
      </div>
    );
  }

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
            {tokenCell()}
          </div>
          {info?.token?.estado === "expirado" && (
            <p className="mt-2 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">⚠ O token do Instagram <strong>venceu</strong> — reconecte em ⚙️ Configurações pra o piloto voltar a postar.</p>
          )}
          {info?.token?.estado === "valido" && typeof info.token.dias === "number" && info.token.dias <= 14 && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">⏳ O token vence em <strong>{info.token.dias} {info.token.dias === 1 ? "dia" : "dias"}</strong> — reconecte em ⚙️ Configurações antes disso pra não interromper o piloto.</p>
          )}
          <p className="mt-3 text-xs text-muted">Carrosséis, posts e stories vão pra esta conta automaticamente — a Bia posta na hora agendada. 💜</p>
          {info?.erro && <p className="mt-2 text-xs text-red-400">⚠ {info.erro}</p>}
          <button onClick={verificar} disabled={carregando} className="mt-3 rounded-lg border border-linha px-4 py-2 text-sm font-semibold text-white transition hover:border-vermelho disabled:opacity-50">
            {carregando ? "Verificando…" : "↻ Verificar agora"}
          </button>
        </>
      )}
    </div>
  );
}
