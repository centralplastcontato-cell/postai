// Descreve uma foto em 1 frase curta via IA (VISÃO) — roda UMA vez, no upload. Best-effort
// (se falhar, fica vazia e cai no rodízio normal). A descrição depois casa a foto com o
// texto do post sem precisar pagar "visão" de novo. Mora aqui (lib comum, sem "use server")
// pra ser reaproveitada pelo upload do painel E pelo link público do Álbum da Festa.
export async function descreverImagem(url: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !url) return "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 60,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Descreva em 1 frase CURTA (até 8 palavras) o que aparece nesta foto de um buffet infantil, focando no que ajuda a escolher a foto certa pra um post (ex: 'Mesa de doces colorida', 'Crianças no pula-pula', 'Salgados na bandeja', 'Salão decorado com balões'). Só a descrição, sem aspas." },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return ((data.choices?.[0]?.message?.content as string) ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 120);
  } catch {
    return "";
  }
}
