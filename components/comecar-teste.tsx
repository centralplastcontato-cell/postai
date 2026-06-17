"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarConta } from "@/app/actions/pagamento";
import { APP_NAME } from "@/lib/config";

// Cadastro do TESTE GRÁTIS: cria a conta (que já nasce em degustação de 7 dias) e leva direto
// pro painel — sem passar pelo pagamento. Quem quiser ativar de verdade clica no banner do painel.
export function ComecarTeste() {
  const router = useRouter();
  const [nomeBuffet, setNomeBuffet] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function comecar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nomeBuffet.trim()) { setErro("Como chama o seu buffet?"); return; }
    if (!telefone.trim()) { setErro("Informe um telefone de contato."); return; }
    setEnviando(true);
    try {
      const r = await criarConta({ email, senha, nomeBuffet, telefone, endereco });
      if (!r.ok) {
        setErro(r.erro);
        setEnviando(false);
        return;
      }
      router.push("/painel");
    } catch {
      setErro("Algo deu errado ao criar sua conta. Tente de novo em instantes.");
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-preto px-5">
      <form onSubmit={comecar} className="w-full max-w-sm rounded-2xl border border-linha bg-preto-card p-8">
        <Link href="/" className="mb-4 flex w-fit items-center gap-1 text-xs font-semibold text-muted transition hover:text-white">
          ← Voltar ao site
        </Link>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1 text-xs font-semibold text-[#c7b2ff]">
          🎁 Teste grátis · sem cartão
        </span>
        <h1 className="display mt-4 text-3xl text-white">
          Comece de graça<span className="text-vermelho">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Crie sua conta e veja a IA montar as artes do seu buffet na hora. Pra postar de verdade no Instagram, é só ativar um plano depois.
        </p>

        <input
          type="text"
          value={nomeBuffet}
          onChange={(e) => setNomeBuffet(e.target.value)}
          placeholder="Nome do seu buffet"
          autoFocus
          className="input-base mt-5"
        />
        <input
          type="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Telefone / WhatsApp de contato"
          autoComplete="tel"
          className="input-base mt-3"
        />
        <input
          type="text"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Endereço do buffet — cidade, bairro (opcional)"
          className="input-base mt-3"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Seu melhor e-mail"
          autoCapitalize="none"
          autoComplete="email"
          className="input-base mt-3"
        />

        <div className="relative mt-3">
          <input
            type={mostrarSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Crie uma senha (mín. 6)"
            autoComplete="new-password"
            className="input-base pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg text-muted hover:text-white"
          >
            {mostrarSenha ? "🙈" : "👁️"}
          </button>
        </div>

        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-5 w-full rounded-lg bg-vermelho px-6 py-3 font-semibold text-white transition hover:bg-vermelho-hover disabled:opacity-60"
        >
          {enviando ? "Criando sua conta…" : "Começar grátis →"}
        </button>

        <p className="mt-3 text-center text-[11px] text-muted">Sem cartão de crédito · cancele quando quiser</p>

        <div className="mt-5 border-t border-linha pt-5 text-center">
          <p className="text-sm text-muted">Já tem conta?</p>
          <Link href="/login" className="mt-2 inline-block w-full rounded-lg border border-vermelho/50 px-6 py-3 text-sm font-semibold text-white transition hover:bg-vermelho/10">
            Entrar no meu painel
          </Link>
        </div>
      </form>
    </div>
  );
}
