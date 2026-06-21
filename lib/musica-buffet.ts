// Música/jingle do buffet que toca no álbum pros pais. PONTE temporária: guardamos a URL por
// slug de marca aqui (igual o Google review) até virar um campo da Marca no painel. Hospedada
// no Vercel Blob (mesmo lugar das fotos). O Castelo já está com o jingle REAL do buffet.

const MUSICAS: Record<string, string> = {
  "castelo-da-diversao": "https://k5f6nms2aodada2o.public.blob.vercel-storage.com/musicas/castelo-da-diversao-zoao4c1jQXDn5q7pbcfqGVtMStvjQF.mp3",
};

export function musicaBuffet(slug: string): string | null {
  return MUSICAS[slug] || null;
}
