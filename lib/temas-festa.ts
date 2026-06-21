// Visual TEMÁTICO do Álbum da Festa: cada tema popular de festa infantil ganha sua paleta,
// emojis e um padrãozinho de fundo — pra a página vestir a cara da festa (Hot Wheels com ar
// de corrida, Frozen azul-gelo, Princesa rosa+coroa...). Casa por palavra-chave no texto que
// o gerente digitou (tolera erro de digitação, ex: "hotweels"). Se não reconhece, usa a cor
// da MARCA. Módulo PURO (sem prisma) — serve cliente e servidor.

export type Padrao = "checkered" | "stripes" | "dots";
export type TemaVisual = {
  nome: string; // rótulo canônico, já bonito ("Hot Wheels")
  cores: [string, string, string]; // gradiente do hero
  acento: string; // cor sólida (texto dos botões brancos, destaques) — boa sobre branco
  emojis: string[]; // confete do hero
  icone: string; // emoji que acompanha o título e a pílula do tema
  padrao?: Padrao; // faixa decorativa na base do hero
  reconhecido: boolean; // false = caiu no fallback da cor da marca
};

// Clareia um hex (#rrggbb) somando amt a cada canal — pro gradiente do fallback.
export function clarear(hex: string, amt = 40): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return hex || "#7C3AED";
  const n = parseInt(m[1], 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r}, ${g}, ${b})`;
}

function normaliza(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

type Def = { chaves: string[]; cfg: Omit<TemaVisual, "reconhecido"> };

const TEMAS: Def[] = [
  {
    chaves: ["hot wheels", "hotwheels", "hot weels", "hotweels", "carrinho", "carro", "corrida", "wheels", "formula 1", "f1"],
    cfg: { nome: "Hot Wheels", cores: ["#D62828", "#F77F00", "#1A1A1A"], acento: "#D62828", icone: "🏁", emojis: ["🏎️", "🏁", "🔥", "🏆", "⚡"], padrao: "checkered" },
  },
  {
    chaves: ["frozen", "gelo", "neve", "elsa", "olaf", "rainha do gelo"],
    cfg: { nome: "Frozen", cores: ["#2E6FB0", "#4FA3DD", "#7FCBEF"], acento: "#2E6FB0", icone: "❄️", emojis: ["❄️", "⛄", "✨", "🩵", "👑"] },
  },
  {
    chaves: ["princesa", "princesas", "realeza", "castelo", "coroa", "reino"],
    cfg: { nome: "Princesas", cores: ["#C2185B", "#E84393", "#F8A5C2"], acento: "#C2185B", icone: "👑", emojis: ["👑", "✨", "🌷", "💖", "🏰"] },
  },
  {
    chaves: ["super heroi", "super-heroi", "superheroi", "heroi", "herois", "vingadores", "avengers", "marvel", "homem aranha", "spider", "batman", "superman", "homem de ferro"],
    cfg: { nome: "Super-heróis", cores: ["#1D4ED8", "#DC2626", "#F59E0B"], acento: "#1D4ED8", icone: "⚡", emojis: ["⚡", "💥", "🦸", "🌟", "🛡️"] },
  },
  {
    chaves: ["unicornio", "arco iris", "arco-iris", "rainbow", "magia", "magico"],
    cfg: { nome: "Unicórnio", cores: ["#8E44AD", "#E84393", "#F39C12"], acento: "#8E44AD", icone: "🦄", emojis: ["🦄", "🌈", "✨", "💖", "☁️"], padrao: "dots" },
  },
  {
    chaves: ["safari", "selva", "floresta", "animais", "zoo", "jungle", "bichos"],
    cfg: { nome: "Safari", cores: ["#2E7D32", "#7CB342", "#C0CA33"], acento: "#2E7D32", icone: "🦁", emojis: ["🦁", "🐘", "🌿", "🐒", "🦒"] },
  },
  {
    chaves: ["dinossauro", "dino", "jurassic", "rex", "trex"],
    cfg: { nome: "Dinossauros", cores: ["#1B5E20", "#558B2F", "#8D6E63"], acento: "#2E7D32", icone: "🦕", emojis: ["🦕", "🦖", "🌋", "🌿", "🦴"] },
  },
  {
    chaves: ["futebol", "bola", "copa", "time", "campo", "gol"],
    cfg: { nome: "Futebol", cores: ["#1B7A3D", "#2ECC71", "#145A32"], acento: "#1B7A3D", icone: "⚽", emojis: ["⚽", "🥅", "🏆", "👟", "🟢"], padrao: "stripes" },
  },
  {
    chaves: ["sereia", "fundo do mar", "oceano", "mar", "praia", "sub aquatico", "aquatico"],
    cfg: { nome: "Fundo do Mar", cores: ["#00838F", "#26C6DA", "#80DEEA"], acento: "#00838F", icone: "🧜‍♀️", emojis: ["🧜‍♀️", "🐚", "🌊", "🐠", "⭐"] },
  },
  {
    chaves: ["espaco", "astronauta", "foguete", "galaxia", "planeta", "nasa", "estrela", "universo"],
    cfg: { nome: "Espaço", cores: ["#1A237E", "#3949AB", "#7E57C2"], acento: "#3949AB", icone: "🚀", emojis: ["🚀", "🪐", "⭐", "🌙", "👨‍🚀"], padrao: "dots" },
  },
  {
    chaves: ["circo", "palhaco", "picadeiro"],
    cfg: { nome: "Circo", cores: ["#C62828", "#F9A825", "#1565C0"], acento: "#C62828", icone: "🎪", emojis: ["🎪", "🤡", "🎟️", "🎈", "🦁"], padrao: "stripes" },
  },
  {
    chaves: ["fazendinha", "fazenda", "sitio", "galinha", "rural", "roca"],
    cfg: { nome: "Fazendinha", cores: ["#6D4C41", "#8D6E63", "#AED581"], acento: "#6D4C41", icone: "🐮", emojis: ["🐮", "🐔", "🐷", "🌽", "🚜"] },
  },
  {
    chaves: ["patrulha canina", "paw patrol", "patrulha", "paw"],
    cfg: { nome: "Patrulha Canina", cores: ["#1565C0", "#E53935", "#FDD835"], acento: "#1565C0", icone: "🐶", emojis: ["🐶", "🚒", "🦴", "🐾", "⭐"] },
  },
  {
    chaves: ["mickey", "minnie", "mouse", "rato", "ratinho"],
    cfg: { nome: "Mickey & Minnie", cores: ["#1A1A1A", "#E53935", "#FDD835"], acento: "#E53935", icone: "🎀", emojis: ["🎀", "⭐", "❤️", "🎈", "🎉"], padrao: "dots" },
  },
  {
    chaves: ["borboleta", "jardim", "flores", "floral", "primavera", "joaninha"],
    cfg: { nome: "Jardim Encantado", cores: ["#AD1457", "#EC407A", "#9CCC65"], acento: "#AD1457", icone: "🦋", emojis: ["🦋", "🌸", "🌼", "🐝", "🌷"] },
  },
  {
    chaves: ["mario", "super mario", "luigi", "bros", "cogumelo"],
    cfg: { nome: "Super Mario", cores: ["#D32F2F", "#1976D2", "#FBC02D"], acento: "#D32F2F", icone: "🍄", emojis: ["🍄", "⭐", "🪙", "🐢", "🔥"] },
  },
  {
    chaves: ["sonic"],
    cfg: { nome: "Sonic", cores: ["#1565C0", "#1E88E5", "#FDD835"], acento: "#1565C0", icone: "💨", emojis: ["💨", "💍", "⭐", "⚡", "🦔"] },
  },
  {
    chaves: ["barbie", "boneca"],
    cfg: { nome: "Barbie", cores: ["#D81B60", "#EC407A", "#F48FB1"], acento: "#D81B60", icone: "💖", emojis: ["💖", "👛", "✨", "🌸", "👠"], padrao: "dots" },
  },
];

// Resolve o visual pro tema digitado. `corMarca` é o fallback quando nada casa.
export function temaVisual(tema: string, corMarca?: string): TemaVisual {
  const t = normaliza(tema);
  if (t) {
    for (const { chaves, cfg } of TEMAS) {
      if (chaves.some((k) => t.includes(k))) return { ...cfg, reconhecido: true };
    }
  }
  const base = corMarca || "#7C3AED";
  return {
    nome: tema || "Festa",
    cores: [base, clarear(base, 35), clarear(base, 75)],
    acento: base,
    emojis: ["🎈", "🎉", "✨", "⭐", "🎊"],
    icone: "🎉",
    reconhecido: false,
  };
}

// CSS da faixa decorativa na base do hero, por padrão.
export function padraoStyle(p: Padrao): { background: string } {
  if (p === "checkered") return { background: "repeating-conic-gradient(#111 0% 25%, #fff 0% 50%) 0 0 / 22px 22px" };
  if (p === "stripes") return { background: "repeating-linear-gradient(45deg, rgba(0,0,0,.28) 0 11px, rgba(255,255,255,.28) 11px 22px)" };
  return { background: "radial-gradient(circle, rgba(255,255,255,.75) 2px, transparent 2.5px) 0 0 / 16px 16px" };
}
