"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { estaLogado } from "@/lib/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function slugUnico(base: string): Promise<string> {
  const raiz = slugify(base) || "marca";
  let slug = raiz;
  let i = 2;
  while (await prisma.marca.findUnique({ where: { slug } })) {
    slug = `${raiz}-${i++}`;
  }
  return slug;
}

// Cria uma marca nova (mínimo: nome). Redireciona pra tela dela.
export async function criarMarca(formData: FormData) {
  if (!(await estaLogado())) return;
  const nome = String(formData.get("nome") || "").trim();
  if (!nome) return;
  const slug = await slugUnico(nome);
  const m = await prisma.marca.create({
    data: { nome, slug, logoTexto: nome.toUpperCase() },
  });
  revalidatePath("/painel");
  redirect(`/painel/marcas/${m.id}`);
}

type DadosMarca = {
  id: string;
  nome?: string;
  corPrimaria?: string;
  corFundo?: string;
  paleta?: string;
  logoTexto?: string;
  logoUrl?: string;
  site?: string;
  telefone?: string;
  igUserId?: string;
  accessToken?: string;
  diasCarrossel?: string;
  diasFeed?: string;
  horaPost?: number;
  horaCarrossel?: number;
  descricao?: string;
  ativa?: boolean;
};

export async function salvarMarca(input: DadosMarca) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const { id, ...resto } = input;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resto)) {
    if (v !== undefined) data[k] = v;
  }
  await prisma.marca.update({ where: { id }, data });
  revalidatePath(`/painel/marcas/${id}`);
  revalidatePath("/painel");
  return { ok: true as const };
}

export async function excluirMarca(id: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  await prisma.marca.delete({ where: { id } });
  revalidatePath("/painel");
  return { ok: true as const };
}

// Lê o logotipo (visão do GPT-4o) e devolve a paleta de cores vivas da marca,
// a cor principal (a mais marcante) e uma cor de fundo escura que combine.
export async function extrairCoresLogo(logoUrl: string) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  if (!logoUrl) return { ok: false as const, erro: "Suba o logo primeiro." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false as const, erro: "OPENAI_API_KEY não configurada." };
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              'Você analisa o logotipo de uma marca e devolve as cores dela pra usar em artes de Instagram. ' +
              'Responda SÓ com JSON: {"paleta":["#RRGGBB", ...],"corPrimaria":"#RRGGBB","corFundo":"#RRGGBB"}. ' +
              'paleta = as cores VIVAS e marcantes do logo (o desenho e as letras), de 2 a 5 cores, da mais proeminente pra menos. ' +
              'IGNORE completamente o fundo da imagem e qualquer cor neutra (cinza, branco, bege, preto, marrom) — só cores vibrantes da marca. ' +
              'Se o logo for de uma cor só, devolva 1 cor na paleta. ' +
              'corPrimaria = a cor mais marcante e viva da paleta (NUNCA uma neutra, NUNCA preto). ' +
              'corFundo = uma cor MUITO escura (tipo #0F0F0F, #1A1A1A ou #2D2D2D), mas NÃO puro preto (#000000), que combine com a paleta pra servir de fundo das artes. ' +
              'Regra crítica: NUNCA devolva #000000. NUNCA devolva cores neutras. SEMPRE cores vibrantes na paleta. ' +
              'Use sempre hex de 6 dígitos.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Quais são as cores dessa marca?" },
              { type: "image_url", image_url: { url: logoUrl } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    const j = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      paleta?: unknown;
      corPrimaria?: string;
      corFundo?: string;
    };
    const hex = (s?: unknown) => (typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null);
    const paleta = (Array.isArray(j.paleta) ? j.paleta : [])
      .map((c) => hex(c))
      .filter((c): c is string => c !== null)
      .slice(0, 5);
    // corPrimaria: a que a IA escolheu, ou a 1ª da paleta como reserva.
    const corPrimaria = hex(j.corPrimaria) || paleta[0] || null;
    const corFundo = hex(j.corFundo);
    if (!corPrimaria) throw new Error("Não consegui ler a cor.");
    // Garante que a paleta tenha pelo menos a cor principal.
    const paletaFinal = paleta.length ? paleta : [corPrimaria];
    return {
      ok: true as const,
      corPrimaria,
      corFundo: corFundo || "#0E0E0E",
      paleta: paletaFinal,
    };
  } catch (e) {
    console.error("Erro ao extrair cores do logo:", e);
    return { ok: false as const, erro: "Não consegui ler as cores do logo agora." };
  }
}

// Testa a conexão com o Instagram da marca (lê o @ e valida o token na Meta).
export async function testarConexao(input: { igUserId: string; accessToken: string }) {
  if (!(await estaLogado())) return { ok: false as const, erro: "Sem permissão." };
  const { igUserId, accessToken } = input;
  if (!igUserId || !accessToken) {
    return { ok: false as const, erro: "Preencha o IG User ID e o token primeiro." };
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      { cache: "no-store" }
    );
    const j = (await r.json()) as {
      username?: string;
      name?: string;
      error?: { message?: string };
    };
    if (j.error?.message) return { ok: false as const, erro: j.error.message };
    if (!j.username) return { ok: false as const, erro: "Não consegui ler a conta. Confira os dados." };
    return { ok: true as const, username: j.username, nome: j.name ?? "" };
  } catch (e) {
    return {
      ok: false as const,
      erro: e instanceof Error ? e.message : "Falha ao falar com a Meta.",
    };
  }
}
