// Sincroniza o schema do Prisma com o banco ANTES do build (aplica colunas novas etc.).
// Roda a cada deploy na Vercel. O banco (Supabase) às vezes oscila/demora pra aceitar conexão,
// e uma falha aqui derrubava o deploy inteiro (email de falha da Vercel). Este wrapper RETENTA
// algumas vezes: se for só o banco "acordando", ele espera e segue; se for um problema real
// (ex: mudança destrutiva que o Prisma recusa), ainda falha em todas as tentativas — como deve.
import { execSync } from "node:child_process";

const MAX = 3;

async function main() {
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    try {
      execSync("prisma db push --skip-generate", { stdio: "inherit" });
      return; // ok
    } catch {
      if (tentativa === MAX) {
        throw new Error(`prisma db push falhou após ${MAX} tentativas.`);
      }
      const espera = tentativa * 5; // 5s, depois 10s
      console.warn(`[db-push] falhou (tentativa ${tentativa}/${MAX}). Provável oscilação do banco — retentando em ${espera}s…`);
      await new Promise((r) => setTimeout(r, espera * 1000));
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
