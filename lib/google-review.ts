// Link de avaliação no Google que o álbum usa. PONTE temporária: guardamos o Place ID por slug
// de marca aqui no código até virar um campo da Marca no painel. Com Place ID, o botão abre
// DIRETO na tela de 5 estrelas; sem ele, cai numa busca pelo nome (ainda leva o pai a avaliar).

const PLACE_IDS: Record<string, string> = {
  "castelo-da-diversao": "ChIJE5old9n1xZQRuvcPCXZ-yR0",
};

export function linkAvaliacaoGoogle(slug: string, nome: string): string {
  const placeId = PLACE_IDS[slug];
  if (placeId) return `https://search.google.com/local/writereview?placeid=${placeId}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${nome} avaliações`)}`;
}
