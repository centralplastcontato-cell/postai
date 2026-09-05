-- ─────────────────────────────────────────────────────────────────────────────
-- FREQUÊNCIA DO PILOTO AUTOMÁTICO (Postaí)
-- ─────────────────────────────────────────────────────────────────────────────
-- O piloto que posta os agendados NÃO é agendado pelo código do app. Ele é um job
-- do pg_cron no SUPABASE, chamado "postai-piloto", que chama /api/cron/postar.
-- Por padrão roda 1x por hora ('0 * * * *') — por isso um post marcado pras 11:20
-- só sai na passada seguinte (~12:00).
--
-- Pra o piloto conferir com MAIS frequência (ex: a cada 15 min), rode o comando
-- abaixo no Supabase → SQL Editor. Muda SÓ o horário do job; não mexe em mais nada.
-- É seguro e reversível (pra voltar ao de hora em hora, use '0 * * * *').

-- 1) (opcional) Ver os jobs e o nome exato:
--    select jobid, jobname, schedule, active from cron.job;

-- 2) Deixar de 10 em 10 minutos:
select cron.alter_job(
  (select jobid from cron.job where jobname = 'postai-piloto'),
  '*/10 * * * *'
);

-- 3) Conferir que pegou:
select jobid, jobname, schedule, active from cron.job where jobname = 'postai-piloto';

-- Outras opções de frequência (troque a linha do passo 2):
--   a cada 15 min      → '*/15 * * * *'
--   de 30 em 30 min    → '0,30 * * * *'
--   voltar 1x/h        → '0 * * * *'
