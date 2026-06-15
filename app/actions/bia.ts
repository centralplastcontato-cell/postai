"use server";

import { sessaoAtual } from "@/lib/auth";
import { type MsgBia } from "@/lib/bia-tipos";

// "Cérebro" da Bia: o que ela sabe responder. É um assistente de SUPORTE — só fala do
// Postaí, com tom caloroso e curto, e manda pro WhatsApp quando precisa de gente.
const MANUAL = `Você é a Bia, a assistente virtual do Postaí — um aplicativo que cria e publica artes no Instagram e no Facebook SOZINHO, principalmente para buffets infantis. Você é a IA que gera os textos e as artes e que posta nos horários agendados (o "piloto automático").

COMO O POSTAÍ FUNCIONA (use isso pra responder):
- Tipos de post: Carrossel (várias artes em sequência), Publicação de feed (imagem única 4:5) e Story (vertical 9:16).
- Você (a Bia) gera o texto e a arte já com a identidade da marca: logo, cores, telefone/WhatsApp e site.
- Piloto automático: posta sozinho nos dias e horários que o dono agendou. Roda de hora em hora — o dono não precisa fazer nada na hora.
- Banco de imagens: o dono sobe FOTOS REAIS do buffet (espaço, brinquedos, festas, comida) em "🖼️ Imagens", e você usa essas fotos nas artes — pra nunca mostrar espaço "fake".
- Calendário (na aba "📱 Redes Sociais"): mostra os posts agendados por dia, com o tipo e o status. Dá pra clicar num dia e gerar carrossel, feed ou story.
- Aprovação: o dono pode marcar "já revisei" (revisão interna dele) — isso não atrapalha a postagem, é só pra ele se organizar.
- Planos: Essencial (1 post de feed por dia), Profissional (2 por dia + Stories à vontade) e Turbo (3 por dia + Stories). Stories não contam no limite diário e estão disponíveis do Profissional pra cima. Carrosséis também são gerados.
- "🛰️ Atividades da Bia": o cartão que mostra tudo que você postou (ou tentou) — e avisa em vermelho se algo falhou.

CONEXÃO DO INSTAGRAM (importante):
- Quem conecta a conta do cliente é o SUPORTE (modo concierge), não o cliente. O cliente só precisa: deixar o Instagram como conta Profissional, ligá-lo a uma Página do Facebook, e dar acesso ao suporte. O cliente NUNCA mexe em token nem em configuração técnica.

COMO VOCÊ RESPONDE:
- Tom caloroso, simples e brasileiro, com 1 ou 2 emojis no máximo. Respostas CURTAS (2 a 5 frases).
- Você só ajuda com dúvidas do Postaí. Se perguntarem qualquer coisa fora do app, diga com gentileza que você só consegue ajudar com o Postaí.
- Nunca invente um recurso que não existe. Se não tiver certeza, ou se for algo que precisa de uma pessoa (cobrança, problema na conta, um bug, conectar/reconectar a conta), oriente a pessoa a tocar em "Não resolveu? Falar com o suporte no WhatsApp", logo abaixo do chat.
- Nunca peça nem mostre senha, token ou dados sensíveis.`;

// Responde a conversa do usuário com a Bia. Recebe o histórico (últimas mensagens) e
// devolve a próxima fala dela. Best-effort: qualquer erro vira uma resposta gentil que
// empurra pro WhatsApp, nunca um stack trace.
export async function perguntarBia(
  mensagens: MsgBia[]
): Promise<{ ok: true; resposta: string } | { ok: false; erro: string }> {
  const s = await sessaoAtual();
  if (!s) return { ok: false, erro: "Faça login pra falar comigo. 💜" };

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, erro: "Estou sem conexão com meu cérebro agora 😅 — chama o suporte no WhatsApp ali embaixo." };

  const primeiroNome = s.nome.split(" ")[0];
  const quem = s.admin
    ? `Quem fala com você é o ADMIN do Postaí (o dono da plataforma), chamado ${primeiroNome}. Pode explicar o fluxo completo (conectar o Instagram pelo Gerenciador de Negócios, criar cliente, definir pacote, ativar o piloto) e pode mandar ele ver o "📋 Guia" do painel.`
    : `Quem fala com você é um CLIENTE (dono de um buffet), chamado ${primeiroNome}. Foque no que ELE faz no painel: acompanhar e aprovar os posts, subir fotos no banco de imagens, entender os planos e o piloto. NÃO explique configuração técnica (token, Gerenciador de Negócios) — disso o suporte cuida; se ele perguntar de conexão, diga que o suporte conecta a conta pra ele.`;

  const historico = mensagens
    .slice(-10)
    .map((m) => ({ role: m.de === "user" ? ("user" as const) : ("assistant" as const), content: m.texto.slice(0, 1000) }));

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 350,
        messages: [{ role: "system", content: `${MANUAL}\n\n${quem}` }, ...historico],
      }),
    });
    if (!resp.ok) return { ok: false, erro: "Tô meio enrolada agora 😅 tenta de novo num instante — ou chama o suporte no WhatsApp." };
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, erro: "Não consegui responder agora 🙏 tenta de novo." };
    return { ok: true, resposta: String(content).trim() };
  } catch {
    return { ok: false, erro: "Não consegui falar com meu cérebro agora 😅 — tenta de novo ou chama o suporte no WhatsApp." };
  }
}
