// Datas comemorativas brasileiras relevantes pra buffet/festas e marcas em geral.
// Marca no calendário os dias "com data" pra o usuário decidir se faz um post de
// data comemorativa (template) ou outra coisa. Inclui datas FIXAS e MÓVEIS
// (Páscoa, Carnaval, Dia das Mães/Pais — calculadas por ano).

export type DataComemorativa = {
  nome: string;
  emoji: string;
  // Sugestão de saudação pra pré-preencher o post (vira o "tema").
  sugestao?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const chave = (ano: number, mes1a12: number, dia: number) => `${ano}-${pad(mes1a12)}-${pad(dia)}`;

// Domingo da Páscoa (algoritmo de Meeus/Butcher, calendário gregoriano).
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// n-ésimo dia-da-semana de um mês (dow: 0=dom..6=sáb). Ex: 2º domingo de maio =
// Dia das Mães; 4ª sexta de novembro = Black Friday.
function nesimoDiaSemana(ano: number, mes1a12: number, dow: number, n: number): Date {
  const primeiro = new Date(ano, mes1a12 - 1, 1);
  const offset = (dow - primeiro.getDay() + 7) % 7; // dias até o 1º "dow"
  return new Date(ano, mes1a12 - 1, 1 + offset + (n - 1) * 7);
}

function maisDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

// Monta o mapa de datas comemorativas do ano (chave "YYYY-MM-DD" -> DataComemorativa).
function datasDoAno(ano: number): Map<string, DataComemorativa> {
  const m = new Map<string, DataComemorativa>();
  const add = (data: Date, dc: DataComemorativa) =>
    m.set(chave(data.getFullYear(), data.getMonth() + 1, data.getDate()), dc);
  const addFixa = (mes1a12: number, dia: number, dc: DataComemorativa) =>
    m.set(chave(ano, mes1a12, dia), dc);

  // --- Fixas (curadas pra buffet/festa: feriados grandes + datas que rendem post) ---
  addFixa(1, 1, { nome: "Ano Novo", emoji: "🎆", sugestao: "Feliz Ano Novo" });
  addFixa(1, 6, { nome: "Dia de Reis", emoji: "👑", sugestao: "Dia de Reis" });
  addFixa(3, 8, { nome: "Dia da Mulher", emoji: "💜", sugestao: "Feliz Dia da Mulher" });
  addFixa(3, 15, { nome: "Dia do Consumidor", emoji: "🛒", sugestao: "Dia do Consumidor" });
  addFixa(3, 27, { nome: "Dia do Circo", emoji: "🎪", sugestao: "Dia do Circo" });
  addFixa(4, 2, { nome: "Dia do Livro Infantil", emoji: "📚", sugestao: "Dia do Livro Infantil" });
  addFixa(4, 19, { nome: "Dia do Índio", emoji: "🏹", sugestao: "Dia dos Povos Indígenas" });
  addFixa(4, 21, { nome: "Tiradentes", emoji: "🇧🇷", sugestao: "Tiradentes" });
  addFixa(5, 1, { nome: "Dia do Trabalho", emoji: "💪", sugestao: "Dia do Trabalhador" });
  addFixa(6, 12, { nome: "Dia dos Namorados", emoji: "❤️", sugestao: "Feliz Dia dos Namorados" });
  addFixa(6, 24, { nome: "São João / Festa Junina", emoji: "🌽", sugestao: "Arraiá / Festa Junina" });
  addFixa(7, 20, { nome: "Dia do Amigo", emoji: "🤝", sugestao: "Dia do Amigo" });
  addFixa(7, 26, { nome: "Dia dos Avós", emoji: "👵", sugestao: "Feliz Dia dos Avós" });
  addFixa(8, 11, { nome: "Dia do Estudante", emoji: "📚", sugestao: "Dia do Estudante" });
  addFixa(8, 22, { nome: "Dia do Folclore", emoji: "🪅", sugestao: "Dia do Folclore" });
  addFixa(9, 7, { nome: "Independência do Brasil", emoji: "🇧🇷", sugestao: "Independência do Brasil" });
  addFixa(9, 15, { nome: "Dia do Cliente", emoji: "🛍️", sugestao: "Dia do Cliente" });
  addFixa(9, 21, { nome: "Dia da Árvore", emoji: "🌳", sugestao: "Dia da Árvore" });
  addFixa(9, 23, { nome: "Dia do Sorvete", emoji: "🍦", sugestao: "Dia do Sorvete" });
  addFixa(10, 4, { nome: "Dia dos Animais", emoji: "🐶", sugestao: "Dia dos Animais" });
  addFixa(10, 12, { nome: "Dia das Crianças", emoji: "🧒", sugestao: "Feliz Dia das Crianças" });
  addFixa(10, 15, { nome: "Dia do Professor", emoji: "🍎", sugestao: "Feliz Dia do Professor" });
  addFixa(10, 31, { nome: "Halloween", emoji: "🎃", sugestao: "Halloween / Festa à Fantasia" });
  addFixa(11, 2, { nome: "Finados", emoji: "🕯️" });
  addFixa(11, 15, { nome: "Proclamação da República", emoji: "🇧🇷" });
  addFixa(11, 20, { nome: "Consciência Negra", emoji: "✊🏿", sugestao: "Dia da Consciência Negra" });
  addFixa(12, 25, { nome: "Natal", emoji: "🎄", sugestao: "Feliz Natal" });
  addFixa(12, 31, { nome: "Réveillon", emoji: "🎆", sugestao: "Feliz Ano Novo" });

  // --- Móveis (dependem do ano) ---
  const dom = pascoa(ano);
  add(maisDias(dom, -47), { nome: "Carnaval", emoji: "🎭", sugestao: "Carnaval" });
  add(dom, { nome: "Páscoa", emoji: "🐰", sugestao: "Feliz Páscoa" });
  add(nesimoDiaSemana(ano, 5, 0, 2), { nome: "Dia das Mães", emoji: "💐", sugestao: "Feliz Dia das Mães" });
  add(nesimoDiaSemana(ano, 8, 0, 2), { nome: "Dia dos Pais", emoji: "👔", sugestao: "Feliz Dia dos Pais" });
  add(nesimoDiaSemana(ano, 11, 5, 4), { nome: "Black Friday", emoji: "🛍️", sugestao: "Black Friday" });

  return m;
}

// Cache simples por ano (os cálculos são puros).
const cache = new Map<number, Map<string, DataComemorativa>>();

export function datasDoAnoCache(ano: number): Map<string, DataComemorativa> {
  let m = cache.get(ano);
  if (!m) {
    m = datasDoAno(ano);
    cache.set(ano, m);
  }
  return m;
}

// Consulta uma chave "YYYY-MM-DD" (mesmo formato usado no calendário).
export function dataComemorativaDe(chaveIso: string): DataComemorativa | undefined {
  const ano = Number(chaveIso.slice(0, 4));
  if (!ano) return undefined;
  return datasDoAnoCache(ano).get(chaveIso);
}

// Selo de DATA ("9 de Agosto") calculado do CALENDÁRIO, nunca chutado pela IA — que
// errava datas móveis (ex.: Dia dos Pais = 2º domingo de agosto). Só devolve quando o
// dia é uma data comemorativa conhecida; senão undefined (aí usa o selo que a IA sugeriu).
export function seloDataComemorativa(data: Date): string | undefined {
  const chaveIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
  if (!dataComemorativaDe(chaveIso)) return undefined;
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric" }).format(data);
  const mes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long" }).format(data);
  return `${dia} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
}
