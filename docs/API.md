# API do Postaí — automação externa

Com ela, uma automação (n8n, Make, Zapier, script…) cria, consulta e cancela posts de **uma marca**. O post entra na mesma fila do piloto automático do painel. O piloto passa a cada ~10 min e publica o que já chegou no horário.

**Endereço base:** `https://www.meupostai.com.br/api/v1`

## Autenticação

Cada marca tem a sua chave. Ela é gerada no painel, dentro da marca, na aba **📱 Redes Sociais**, no cartão **🔌 Automação externa (API)**.

- A chave aparece **uma vez só**, na hora em que é gerada. O Postaí guarda apenas um "hash" dela.
- **Gerar nova chave** revoga a anterior na hora. **Revogar** desliga o acesso.

Envie a chave em todas as chamadas:

```
Authorization: Bearer pa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Criar post — `POST /api/v1/posts`

Pode ser enviado de dois jeitos:
- em **JSON**, com as mídias como links públicos;
- em **multipart/form-data**, com upload direto do arquivo.

| Campo | Obrigatório | Descrição |
|---|---|---|
| `formato` | sim | `feed`, `carrossel`, `story` ou `reels` |
| `horario` | sim | ISO 8601 **com fuso**, ex.: `2026-10-05T10:00:00-03:00`. Não pode estar no passado. |
| `midias` | sim | Lista de links (JSON) ou arquivos (multipart, repetindo o campo `midias`). **1** para feed/story/reels, **2 a 10** para carrossel. |
| `legenda` | não | Texto do post. Legenda + hashtags: até 2.200 caracteres. |
| `hashtags` | não | `"#a #b"` ou `["a", "b"]`. Até 30 no total, contando as que estão dentro da legenda. |
| `status` | não | `agendado` (o piloto publica sozinho) ou `aguardando_aprovacao` (fica no painel até você aprovar). **Padrão: `aguardando_aprovacao`.** |
| `external_id` | não, mas recomendado | Seu identificador do post, com até 200 caracteres. Reenviar o mesmo `external_id` **não duplica**: devolve o post que já existe. |
| `capa` | não | Só para `reels`: imagem de capa (link ou arquivo). Sem ela, o Instagram usa o quadro de 1,5 s. |

**Mídia:** o Postaí **baixa e guarda uma cópia** assim que recebe. Se o link de origem expirar depois, o post não quebra. O link precisa ser público (sem login).

**Upload direto:** a Vercel limita o corpo da chamada a ~4,5 MB. Para vídeos, envie **link**.

### O que é validado na entrada

Se algo estiver fora destas regras, o post é recusado com erro claro (veja "Erros" abaixo).

| Formato | Aceita |
|---|---|
| feed | 1 imagem (JPEG/PNG/WebP), proporção de 4:5 (0,8) a 1,91:1 |
| carrossel | 2 a 10 imagens, cada uma de 4:5 a 1,91:1. O Instagram corta todas na proporção da 1ª; o Postaí avisa se forem diferentes. |
| story | 1 imagem, ou 1 vídeo MP4/MOV de 3 a 60 s. O ideal é 9:16; fora disso, o Postaí aceita, mas avisa. |
| reels | 1 vídeo MP4/MOV de 3 s a 15 min, largura de até 1920 px, até 100 MB. O ideal é 9:16. |

- Imagens são convertidas para JPEG de até 1440 px de largura, o formato que o Instagram aceita.
- Avisos que não impedem o post (proporção não ideal, marca ainda sem Instagram conectado) voltam no campo `avisos`.

### Exemplo (JSON, com links)

```bash
curl -X POST https://www.meupostai.com.br/api/v1/posts \
  -H "Authorization: Bearer pa_SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "formato": "carrossel",
    "legenda": "A colheita de outubro chegou 🍎",
    "hashtags": ["valedacolheita", "colheita"],
    "horario": "2026-10-05T10:00:00-03:00",
    "status": "aguardando_aprovacao",
    "external_id": "2026-10-05-carrossel",
    "midias": ["https://exemplo.com/foto1.jpg", "https://exemplo.com/foto2.jpg"]
  }'
```

### Exemplo (upload direto)

```bash
curl -X POST https://www.meupostai.com.br/api/v1/posts \
  -H "Authorization: Bearer pa_SUA_CHAVE" \
  -F formato=feed -F "legenda=Bom dia!" -F horario=2026-10-05T10:00:00-03:00 \
  -F status=agendado -F external_id=2026-10-05-feed -F midias=@foto.jpg
```

### Resposta

`201` quando o post é criado. `200` quando o `external_id` já existia (aí vem `"criado": false` e o mesmo post).

```json
{
  "ok": true,
  "criado": true,
  "post": {
    "id": "cmurfrd5h00077dg9sqg04s3x",
    "external_id": "2026-10-05-carrossel",
    "formato": "carrossel",
    "status": "aguardando_aprovacao",
    "horario": "2026-10-05T13:00:00.000Z",
    "legenda": "A colheita de outubro chegou 🍎",
    "hashtags": "#valedacolheita #colheita",
    "midias": ["https://…blob.vercel-storage.com/api/…/1.jpg", "…/2.jpg"],
    "capa": null,
    "motivo_falha": null,
    "link_instagram": null,
    "publicado_em": null,
    "criado_em": "2026-10-02T20:48:57.941Z"
  },
  "avisos": []
}
```

## Consultar — `GET /api/v1/posts/{id}`

Também é possível consultar com `GET /api/v1/posts?external_id=...`, útil se a criação deu timeout e você não recebeu o `id`. A resposta traz o mesmo `post` mostrado acima.

| `status` | Significado |
|---|---|
| `aguardando_aprovacao` | Esperando você aprovar no painel (✓ Aprovar / ✕ Recusar). Se for recusado, o GET passa a dar 404. |
| `agendado` | Na fila. O piloto publica na primeira passada depois do `horario`. |
| `processando` | Vídeo enviado ao Instagram, ainda em processamento (Reels e Story de vídeo). |
| `publicado` | Publicado. `link_instagram` traz o link do post e `publicado_em`, a hora. |
| `falhou` | A última tentativa falhou e `motivo_falha` diz por quê. O piloto **tenta de novo a cada passada**; para desistir, cancele. |

## Cancelar — `DELETE /api/v1/posts/{id}`

Cancela enquanto o post **não foi publicado**: apaga o post e as mídias copiadas. Se já foi publicado (ou está sendo publicado naquele instante), responde `409`.

```bash
curl -X DELETE https://www.meupostai.com.br/api/v1/posts/cmurfrd5h00077dg9sqg04s3x \
  -H "Authorization: Bearer pa_SUA_CHAVE"
```

## Erros

Toda resposta de erro vem com `ok: false`, uma mensagem em `erro` e a lista `erros` com campo, código e mensagem de cada problema:

```json
{
  "ok": false,
  "erro": "midias[0]: imagem 1080x1920 (0.56:1) fora do aceito no feed: de 4:5 (0.80, retrato) a 1.91:1 (paisagem).",
  "erros": [{ "campo": "midias[0]", "codigo": "PROPORCAO", "mensagem": "…" }]
}
```

| HTTP | Quando |
|---|---|
| 400 | Campos inválidos: `FORMATO_INVALIDO`, `HORARIO_INVALIDO`, `HORARIO_PASSADO`, `STATUS_INVALIDO`, `QUANTIDADE_MIDIAS`, `LEGENDA_LONGA`, `HASHTAGS_DEMAIS`, `CAPA_SO_REELS`, `CORPO_INVALIDO` |
| 401 | Chave ausente, errada ou revogada |
| 403 | Marca desativada, acesso vencido ou plano sem Story (`PLANO_SEM_STORY`) |
| 404 | Post não existe nesta marca (`NAO_ENCONTRADO`) |
| 409 | Limite de posts de feed por dia do plano (`LIMITE_DO_PLANO`), ou cancelar algo já publicado (`JA_PUBLICADO`) |
| 422 | Problema na mídia: `MIDIA_URL_INVALIDA`, `MIDIA_INACESSIVEL`, `MIDIA_GRANDE`, `TIPO_MIDIA`, `PROPORCAO`, `DURACAO_VIDEO`, `RESOLUCAO_VIDEO`, `VIDEO_INVALIDO` |
| 502 / 503 | Falha temporária de armazenamento ou banco. Pode reenviar com o mesmo `external_id`. |

## Limites

- Usar a API não tem custo extra.
- Vale o limite de posts de **feed** (feed + carrossel) por dia do plano do dono da marca. Story e Reels não contam nesse limite. Marcas sem plano (as do próprio Postaí) não têm limite.
- O piloto publica **1 post de cada tipo por marca a cada passada (~10 min)**. Vários posts no mesmo horário saem em passadas seguidas.
