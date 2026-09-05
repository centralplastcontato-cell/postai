# Postaí — guia rápido do projeto

SaaS de postagem automática no Instagram (Next.js 16 + Prisma + Supabase + OpenAI + Vercel Blob + Meta Graph API). Multi-marca: cada Marca tem identidade visual e conexão própria com a Meta.

## ⚠️ Regras que salvam vidas

- **O banco local (.env) é O MESMO banco de PRODUÇÃO** (Supabase, ref weeddqlvhmcvqiflcvfi). Nada de `prisma db push` destrutivo, `deleteMany` solto ou testes que criem/apaguem dados reais sem confirmar antes.
- O projeto morava dentro do OneDrive e foi movido pra `C:\projetos\postai` em 08/07/2026, depois de o OneDrive corromper o cache do Turbopack 3× e chegar a apagar a pasta inteira (recuperada do GitHub). **Não voltar pro OneDrive.**
- README/comentários ainda citam Neon — DESATUALIZADO: o banco é Supabase (migrado).
- O usuário (Victor) é não-técnico e fala pt-BR: executar por ele e explicar simples, sem jargão.

- **`npm run build` local roda `prisma db push` no banco de PRODUÇÃO** (script `scripts/db-push.mjs`, é o que a Vercel roda no deploy). Sem mudança no schema é inofensivo, mas nunca rode build com schema alterado sem revisar antes.

## Rodar local

```
npm run dev   →  http://localhost:3000  (login: admin, senha = ADMIN_SENHA do .env)
```

Se o `.env` sumir: backup das variáveis com o Victor; `POSTGRES_PRISMA_URL` = a `POSTGRES_URL_NON_POOLING` com porta 6543 + `?pgbouncer=true&connection_limit=1`. O `vercel env pull` NÃO recupera (todas as envs estão como Sensitive na Vercel).

## Produção

- Deploy: push na `main` → Vercel (projeto victorprojetos/postai) → https://www.meupostai.com.br
- O piloto automático roda na NUVEM (pg_cron no Supabase, job `postai-piloto`, chama `/api/cron/postar` com `CRON_SECRET`) — não depende de máquina local. Batimento na tabela `Heartbeat`. A FREQUÊNCIA é setada no pg_cron do Supabase, não no `vercel.json` (que hoje NÃO tem `crons`); pra mudar, use `scripts/pg-cron-piloto.sql` no SQL Editor do Supabase. Em 05/09/2026 o job estava em `*/10 * * * *` (a cada 10 min) — um post agendado sai na passada seguinte ao horário (até ~10 min depois). Pra conferir: `select jobname, schedule from cron.job;`.
- Reels postados há +24h têm o MP4 arquivado (videoUrl="") — o card usa a capa da festa (`capaReel`).
