// TESTE E2E do vídeo COM LEGENDAS (roda depois do deploy). Cria um VideoTematico de teste,
// pede a copy pra Bia, dispara o motor real e espera o MP4. NÃO agenda, NÃO posta.
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { GoogleAuth } from "google-auth-library";

const env = readFileSync("c:/projetos/POSTAÍ/.env", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\r\n]+)"?`, "m")) || [])[1] || "";
const MOTOR = get("VIDEO_ENGINE_URL").replace(/\/$/, "");
const CALLBACK = get("VIDEO_CALLBACK_URL");
const TOKEN = get("VIDEO_CALLBACK_SECRET");
const SA = get("GOOGLE_SA_KEY_B64");
const KEY = get("OPENAI_API_KEY");
const BASE = new URL(CALLBACK).origin;

const prisma = new PrismaClient();
const limpar = process.argv.includes("--limpar") ? process.argv[process.argv.indexOf("--limpar") + 1] : null;
if (limpar) {
  const v = await prisma.videoTematico.findUnique({ where: { id: limpar }, select: { videoUrl: true } });
  await prisma.videoTematico.delete({ where: { id: limpar } }).catch(() => {});
  if (v?.videoUrl?.startsWith("http")) { const { del } = await import("@vercel/blob"); await del(v.videoUrl).catch(() => {}); }
  console.log("teste removido:", limpar);
  await prisma.$disconnect(); process.exit(0);
}

const marca = await prisma.marca.findFirst({ where: { nome: { contains: "Castelo" } }, select: { id: true, nome: true, slug: true, logoUrl: true, corPrimaria: true } });
const ok = new Set((await prisma.festa.findMany({ where: { marcaId: marca.id, autorizacao: "autorizada" }, select: { id: true } })).map((f) => f.id));
const cands = (await prisma.imagemMarca.findMany({
  where: { marcaId: marca.id, descricao: { contains: "brinquedão", mode: "insensitive" } },
  orderBy: { usos: "asc" }, take: 30, select: { id: true, url: true, descricao: true, festaId: true },
})).filter((f) => !f.festaId || ok.has(f.festaId)).slice(0, 6);
console.log(`Fotos do teste: ${cands.length}`);

const v = await prisma.videoTematico.create({
  data: {
    marcaId: marca.id,
    titulo: "TESTE Legendas",
    videoFotos: JSON.stringify(cands.map((f) => f.id)),
    videoCapa: cands[0].id,
    videoTextoFinal: "Vem conhecer o Castelo!",
  },
});
console.log("VideoTematico:", v.id);

// A Bia escreve a copy (mesma chamada da action, aqui simulada)
const doSlideshow = cands.slice(1);
const lista = doSlideshow.map((f, i) => `${i + 1}. ${f.descricao}`).join("\n");
const resp = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-4.1", response_format: { type: "json_object" }, temperature: 0.85,
    messages: [
      { role: "system", content: `Você é a social media do buffet infantil "${marca.nome}". Você escreve a COPY de um Reels sobre "Brinquedos" — frases curtas que aparecem POR CIMA das fotos, uma por quadro.\nREGRAS:\n- Fale COM o pai/mãe ("seu filho", "sua festa"), vendendo o BENEFÍCIO — não descreva a foto.\n- Cada frase nasce da FOTO daquele quadro.\n- Frases CURTAS: 3 a 8 palavras.\n- A copy tem ARCO: gancho, benefícios, convite.` },
      { role: "user", content: `Fotos do vídeo, na ordem:\n${lista}\n\nEscolha 3 fotos-chave (espalhadas) e escreva a frase de cada uma.\nResponda só com JSON: {"legendas":[{"foto":número,"frase":"..."}]}` },
    ],
  }),
});
const j = JSON.parse((await resp.json()).choices[0].message.content);
const textos = {};
for (const it of j.legendas ?? []) {
  const i = Number(it.foto);
  if (i >= 1 && i <= doSlideshow.length && it.frase) textos[doSlideshow[i - 1].id] = it.frase.trim();
}
await prisma.videoTematico.update({ where: { id: v.id }, data: { videoTextos: JSON.stringify(textos) } });
console.log("\nCopy da Bia:");
Object.values(textos).forEach((t) => console.log(`  → "${t}"`));

// Monta as URLs dos quadros (como a action faz) e dispara o motor
const ids = cands.map((f) => f.id);
const idsSlideshow = ids.filter((id) => id !== v.videoCapa);
const versao = "t" + Date.now().toString(36);
const quadros = idsSlideshow.map((id) => `${BASE}/api/quadro-tema/${v.id}/${ids.indexOf(id) + 1}.jpg?v=${versao}`);
console.log("\nConferindo os quadros em produção…");
for (const q of quadros.slice(0, 2)) {
  const r = await fetch(q, { method: "HEAD" });
  console.log(`  HTTP ${r.status} | ${r.headers.get("content-type")} | ${Math.round(Number(r.headers.get("content-length") || 0) / 1024)}kb`);
}

const auth = new GoogleAuth({ credentials: JSON.parse(Buffer.from(SA, "base64").toString("utf8")) });
const client = await auth.getIdTokenClient(MOTOR);
const r = await client.request({
  url: `${MOTOR}/montar`, method: "POST", headers: { "Content-Type": "application/json" },
  data: {
    fotos: quadros,
    capaUrl: cands[0].url,
    moldura: "nenhuma",
    corMoldura: marca.corPrimaria,
    logoUrl: marca.logoUrl,
    textoCapa: "Brinquedos",
    tituloFinal: "Vem conhecer o Castelo!",
    subFinal: "",
    nomeArquivo: `${marca.slug}-tema-legendas`,
    festaId: v.id,
    callbackUrl: CALLBACK,
    callbackToken: TOKEN,
  },
  timeout: 30000,
});
console.log("\nMotor:", JSON.stringify(r.data));
console.log("Esperando o MP4 (até 5 min)…");
let final = null;
for (let i = 0; i < 30; i++) {
  await new Promise((res) => setTimeout(res, 10000));
  const a = await prisma.videoTematico.findUnique({ where: { id: v.id }, select: { videoUrl: true } });
  if (a && a.videoUrl !== "gerando") { final = a.videoUrl; break; }
  process.stdout.write(".");
}
console.log("");
if (final?.startsWith("http")) console.log(`✅ MP4: ${final}\n\nLimpar: node scripts/e2e-legendas.mjs --limpar ${v.id}`);
else console.log("❌ falhou ou demorou. id:", v.id, "| estado:", JSON.stringify(final));
await prisma.$disconnect();
