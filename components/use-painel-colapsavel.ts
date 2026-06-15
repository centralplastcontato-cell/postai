"use client";

import { useEffect, useState } from "react";

// Painel que recolhe/expande e LEMBRA a escolha (localStorage) — usado nos geradores
// de Carrossel, Publicação e Story pra não ocuparem a tela toda quando não estão em uso.
export function usePainelColapsavel(chave: string) {
  const [aberto, setAberto] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`postai:painel:${chave}`);
      if (v !== null) setAberto(v === "1");
    } catch {}
  }, [chave]);
  const alternar = () =>
    setAberto((a) => {
      const n = !a;
      try { localStorage.setItem(`postai:painel:${chave}`, n ? "1" : "0"); } catch {}
      return n;
    });
  return { aberto, alternar };
}
