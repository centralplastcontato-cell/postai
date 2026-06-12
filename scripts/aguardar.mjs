import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const hora = () => new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
const fim = Date.now() + 28 * 60 * 1000; // monitora por ~28 min
let postou = false;
while (Date.now() < fim) {
  try {
    const c = await prisma.conteudo.findFirst({ where: { titulo: { contains: "Reservar" } }, select: { status: true } });
    if (c?.status === "postado") {
      console.log(`[${hora()}] 🎉 POSTOU! O carrossel virou 'postado' — o piloto automatico funcionou!`);
      postou = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 90000)); // checa a cada 1.5 min
}
if (!postou) console.log(`[${hora()}] Ainda 'a_postar' apos a janela — o cron das 12h nao conseguiu postar (Meta provavelmente ainda travada).`);
await prisma.$disconnect();
