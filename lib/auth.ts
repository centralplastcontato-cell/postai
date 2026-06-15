import { cookies } from "next/headers";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const COOKIE = "postai-sess";
const MASTER = "master"; // sessão do admin mestre (ADMIN_SENHA)

// --- Cookie de sessão ASSINADO (HMAC) ---------------------------------------
// Guarda `<valor>.<assinatura>`; sem assinatura válida o cookie é rejeitado,
// então ninguém forja "master" na mão. Segredo: SESSION_SECRET (recomendado)
// ou cai pro ADMIN_SENHA. Fail-closed: sem segredo, ninguém autentica.
function segredoSessao(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_SENHA || "";
}

function assinar(valor: string): string {
  return createHmac("sha256", segredoSessao()).update(valor).digest("hex");
}

function selar(valor: string): string {
  return `${valor}.${assinar(valor)}`;
}

function abrir(raw: string): string | null {
  const seg = segredoSessao();
  if (!seg) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const valor = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(assinar(valor), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return valor;
}

export type Sessao = {
  id: string;
  nome: string;
  admin: boolean;
  plano?: string | null; // pacote do cliente (admin não usa)
  acessoAte?: Date | null; // validade do acesso do cliente
};

const SESSAO_MASTER: Sessao = { id: MASTER, nome: "Admin", admin: true };

export function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(senha, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return orig.length === test.length && timingSafeEqual(orig, test);
}

export async function abrirSessao(valor: string) {
  const c = await cookies();
  c.set(COOKIE, selar(valor), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function fecharSessao() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function sessaoAtual(): Promise<Sessao | null> {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  if (!raw) return null;
  const val = abrir(raw);
  if (!val) return null;
  if (val === MASTER) return SESSAO_MASTER;
  try {
    const u = await prisma.usuario.findUnique({ where: { id: val } });
    if (!u) return null;
    return { id: u.id, nome: u.nome, admin: u.admin, plano: u.plano, acessoAte: u.acessoAte };
  } catch {
    return null;
  }
}

// "Está logado no painel?"
export async function estaLogado(): Promise<boolean> {
  return (await sessaoAtual()) !== null;
}
