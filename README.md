# Postaí

SaaS de postagem automática no Instagram — carrosséis e posts de feed gerados por
IA, no tom de cada marca, postando sozinhos na agenda. **Multi-marca**: cada marca
tem sua identidade visual e sua própria conexão com a Meta.

Base técnica: Next.js 16 + Prisma (Postgres/Neon) + OpenAI + Vercel Blob + Meta Graph API.

---

## Rodar local (passo a passo)

### 1. Variáveis de ambiente
Copie `.env.example` para `.env` e preencha:

| Variável | De onde vem |
|----------|-------------|
| `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` | Banco novo no [Neon](https://neon.tech) (grátis) |
| `ADMIN_SENHA` | Você escolhe (senha do login `admin`) |
| `SESSION_SECRET` | String aleatória longa |
| `OPENAI_API_KEY` | Sua chave da OpenAI (pode reusar a do outro projeto) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (Storage no painel da Vercel) |
| `SITE_URL` | `http://localhost:3000` em dev; o domínio do deploy em produção |
| `CRON_SECRET` | String aleatória (protege o piloto automático) |

### 2. Criar as tabelas
```
npx prisma db push
```

### 3. Subir
```
npm run dev
```
Abra http://localhost:3000 → login com usuário `admin` e a `ADMIN_SENHA`.

---

## Conectar uma marca (ex: Castelo da Diversão)

1. No painel, **+ Criar marca** → "Castelo da Diversão".
2. Aba **Configurações**: preencha identidade (cor, telefone, descrição do negócio).
3. Em **Conexão com o Instagram**, cole:
   - **IG User ID** da conta
   - **Access Token** do Usuário do Sistema (com `instagram_content_publish`)
   - Clique **Testar conexão** → deve mostrar `✓ Conectado: @...`
4. Ajuste a **agenda** (dias de carrossel/feed + hora) e **Salvar**.
5. Aba **Redes Sociais**: clique num dia livre, gere um carrossel/feed e **Postar**.

> Para as SUAS marcas (Castelo, etc.), basta pendurar a conta no mesmo Usuário do
> Sistema da Meta e pegar o IG User ID — não precisa de App Review.

---

## Piloto automático

O cron (`/api/cron/postar`, ver `vercel.json`) roda 1x/dia e, para cada marca
conectada e ativa, posta o carrossel e o feed com data <= hoje.

> No plano Hobby da Vercel o cron roda só 1x/dia. Para postar em horários diferentes
> por marca, use a Vercel Pro ou um agendador externo (ex: cron-job.org) batendo no
> endpoint de hora em hora.
