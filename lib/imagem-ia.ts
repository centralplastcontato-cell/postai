// Descreve uma foto via IA (VISÃO) — roda UMA vez, no upload. Best-effort (se falhar, fica
// vazia e cai no rodízio normal). A descrição depois casa a foto com o texto do post sem
// precisar pagar "visão" de novo. Mora aqui (lib comum, sem "use server") pra ser
// reaproveitada pelo upload do painel E pelo link público do Álbum da Festa.
//
// O prompt foi calibrado em teste às cegas (juízes olhando as fotos reais): descrição DENSA
// em fatos distintivos — tema nomeado só com evidência, personagens pelo nome, texto de
// painel transcrito, roupas/cores/objetos marcantes — e SEM enfeite de linguagem nem chute,
// que é o que faz a foto certa ser achada entre centenas na hora de montar o post.
// detail:"high" porque a evidência do tema costuma ser pequena na foto (camisa de time,
// personagem no topo do bolo, nome no painel) e no modo padrão a IA não enxergava.
const PROMPT_DESCRICAO = `Descreva esta foto do acervo de um buffet de festas infantis, pra um sistema que escolhe a foto certa pra cada post de Instagram. 1-2 frases (15 a 35 palavras), texto corrido, SÓ fatos visíveis. COMECE DIRETO pela cena (ex: "Entrada do aniversariante...", "Bolo de parabéns...", "Mesa decorada..."), nunca por "A imagem mostra".
Inclua, quando visível:
- a cena e o momento (mesa decorada, bolo, entrada do aniversariante, brinquedão, salão, comida servida...);
- o tema da festa APENAS com evidência clara — personagem, painel, camisa de time (diga qual time/seleção), fantasia — e nomeie o tema (super-heróis, Frozen, futebol/Brasil, safári...); sem evidência, não fale de tema;
- personagens e bichos PELO NOME (Homem-Aranha, guaxinim, raposa...); texto legível em painel/bolo/plaquinha, transcreva o trecho curto entre parênteses;
- roupas marcantes (camisa de time, fantasia, vestido de princesa), cores predominantes, objetos que diferenciam ESTA foto (bola, vela de idade, andares do bolo, tapete vermelho...).
NUNCA escreva: "ambiente/atmosfera" + adjetivo, "festivo", "alegre", "acolhedor", "ideal para", "sugere", "possivelmente", "parece". Não cite nomes de pessoas (nome escrito em painel de festa pode). Sem aspas em volta da resposta.`;

export async function descreverImagem(url: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !url) return "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_DESCRICAO },
              { type: "image_url", image_url: { url, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return ((data.choices?.[0]?.message?.content as string) ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 300);
  } catch {
    return "";
  }
}
