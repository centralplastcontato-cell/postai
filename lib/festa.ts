import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// Token do link de uma festa: "<slug-criança>-<código>" quando dá o nome (ex: "joaquim-x7k2p9r3mq4n"),
// ou só o código quando não dá (comportamento antigo). O código continua os MESMOS 96 bits
// aleatórios de sempre — é a parte SECRETA (inviável de adivinhar); o nome é só pra deixar o link
// bonito/reconhecível quando compartilhado (WhatsApp etc.), não afeta a segurança nem o "match"
// (é comparado como string inteira). Sem @unique no schema: o espaço aleatório torna colisão
// desprezível, e o backfill gera valores distintos.
export function gerarTokenFesta(nomeAniversariante?: string): string {
  const codigo = randomBytes(12).toString("base64url");
  const slug = slugify(nomeAniversariante || "");
  return slug ? `${slug}-${codigo}` : codigo;
}

// Slug url-safe de um texto livre (nome do buffet/criança): minúsculo, sem acento, kebab.
function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Código curto LEGÍVEL (sem i/l/o/0/1, pra não confundir) — a credencial secreta do link.
function codigoAlbum(n = 5): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
}

// Token BONITO do álbum pros pais: "<slug-buffet>-<slug-criança>-<código>" (ex:
// "castelo-da-diversao-enrico-x7k2p"). O slug é só identidade (dá confiança ao link); o
// código curto é o segredo (inviável de adivinhar). length sempre > 10 (casa em festaPorTokenAlbum).
export function gerarTokenAlbum(slugBuffet: string, nomeAniversariante: string): string {
  const partes = [slugify(slugBuffet), slugify(nomeAniversariante)].filter(Boolean);
  return `${partes.join("-")}-${codigoAlbum()}`;
}

// Diz se o token já está no formato bonito DESTE buffet (começa com o slug dele). Usado no
// backfill pra regenerar UMA vez os tokens antigos (aleatórios) — depois fica estável.
export function tokenAlbumBonito(token: string, slugBuffet: string): boolean {
  const slug = slugify(slugBuffet);
  return Boolean(slug) && (token || "").startsWith(slug + "-");
}

// Resolve a MARCA pelo token público de CRIAR festa (Marca.tokenFotos). Token vazio/curto
// NUNCA casa (senão uma marca com tokenFotos="" abriria pra qualquer um). É a fronteira de
// autorização do link de CRIAR — quem tem ele cria festas novas (não vê as existentes).
export async function marcaPorTokenFotos(token: string) {
  const t = (token || "").trim();
  if (t.length < 6) return null; // vazio/trivial nunca casa (tokenFotos="" tem length 0)
  try {
    return await prisma.marca.findFirst({
      where: { tokenFotos: t },
      select: { id: true, slug: true, nome: true, logoUrl: true, corPrimaria: true, corFundo: true },
    });
  } catch {
    return null;
  }
}

// Resolve a FESTA pelo token do ÁLBUM (tokenAlbum) — link PÚBLICO e SÓ-LEITURA pros pais.
// Traz só o necessário pra montar o álbum (inclui contatos da marca). Vazio/curto nunca casa.
// É SEPARADO de festaPorToken: quem tem só o álbum jamais cai na rota de edição (/f/[token]).
export async function festaPorTokenAlbum(token: string) {
  const t = (token || "").trim();
  if (t.length < 10) return null;
  try {
    return await prisma.festa.findFirst({
      where: { tokenAlbum: t },
      select: {
        id: true,
        marcaId: true,
        data: true,
        aniversariantes: true,
        tema: true,
        horario: true,
        finalizadaEm: true,
        autorizacao: true,
        mostrarAvaliacao: true,
        videoClipes: true, // todos os clipes do gerente (URLs)
        videoClipesPublico: true, // quais deles o gerente marcou pra aparecer aqui (subconjunto de videoClipes)
        marca: { select: { slug: true, nome: true, logoUrl: true, corPrimaria: true, telefone: true, site: true } },
      },
    });
  } catch {
    return null;
  }
}

// Resolve a FESTA (com dados da marca) pelo token do link DELA. É a fronteira de autorização
// do link isolado: quem tem ele só mexe nesta festa. Token vazio/curto nunca casa.
export async function festaPorToken(token: string) {
  const t = (token || "").trim();
  if (t.length < 10) return null;
  try {
    return await prisma.festa.findFirst({
      where: { token: t },
      select: {
        id: true,
        marcaId: true,
        tokenAlbum: true,
        data: true,
        aniversariantes: true,
        tema: true,
        gerente: true,
        instagramAnfitriao: true,
        horario: true,
        finalizadaEm: true,
        autorizacao: true,
        motivoNaoAutoriza: true,
        mostrarAvaliacao: true,
        videoClipes: true, // clipes de vídeo que o gerente sobe na festa (entram no Reels)
        videoClipesPublico: true, // quais desses clipes o gerente marcou pra TAMBÉM aparecer pros pais
        marca: { select: { nome: true, logoUrl: true, corPrimaria: true } },
      },
    });
  } catch {
    return null;
  }
}
