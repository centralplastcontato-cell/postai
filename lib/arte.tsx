// Fundação visual das artes do Postaí: fontes, paleta e componentes reutilizáveis
// (bandeirinha, onda, confete, título multicolor, CTA WhatsApp, logo no balão).
// Usado pelos templates de feed e de carrossel (next/og — runtime nodejs).
import fs from "fs";
import path from "path";

// ---- Fontes ----
type Fonte = { name: string; data: Buffer; weight: 400 | 600; style: "normal" };
let _fontes: Fonte[] | null = null;

export function carregarFontes(): Fonte[] {
  if (_fontes) return _fontes;
  const dir = path.join(process.cwd(), "assets", "fonts");
  _fontes = [
    { name: "Fredoka", data: fs.readFileSync(path.join(dir, "fredoka.woff")), weight: 400, style: "normal" },
    { name: "Baloo", data: fs.readFileSync(path.join(dir, "baloo-sb.woff")), weight: 600, style: "normal" },
  ];
  return _fontes;
}

// ---- Cores ----
export const VERDE_WHATS = "#25D366";
export const PRETO = "#1c1c1c";
export const BRANCO = "#ffffff";

export function paletaDaMarca(paletaJson: string | null, corPrimaria: string): string[] {
  try {
    const arr = JSON.parse(paletaJson || "[]");
    const cores = Array.isArray(arr) ? arr.filter((c) => typeof c === "string") : [];
    if (cores.length >= 2) return cores;
  } catch {}
  return [corPrimaria, "#2196F3", "#FFEB3B", "#4CAF50", "#FF9800"];
}

// Contorno "cartoon" (várias sombras simulando stroke) pra título sobre qualquer fundo.
export const contorno = (cor = PRETO) =>
  `3px 3px 0 ${cor}, -3px 3px 0 ${cor}, 3px -3px 0 ${cor}, -3px -3px 0 ${cor}, 0 5px 0 ${cor}`;

// ---- Helpers ----
export const svgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// URL pública do logo (o gerador não renderiza data URI base64; busca por URL).
export const logoUrlMarca = (origin: string, marcaId: string) => `${origin}/api/marca-logo/${marcaId}`;

// Quebra um título em até 3 linhas e colore (1ª branca, demais com cores da paleta).
export function montarTituloColorido(titulo: string, paleta: string[]): { t: string; c: string }[] {
  const palavras = (titulo || "").trim().split(/\s+/).filter(Boolean);
  const n = palavras.length;
  const linhas: string[] = [];
  if (n <= 2) linhas.push(palavras.join(" "));
  else {
    const alvo = n <= 4 ? 2 : 3;
    const porLinha = Math.ceil(n / alvo);
    for (let i = 0; i < n; i += porLinha) linhas.push(palavras.slice(i, i + porLinha).join(" "));
  }
  const cores = [BRANCO, paleta[2] || paleta[0], paleta[1] || paleta[0]];
  return linhas.slice(0, 3).map((t, i) => ({ t: t.toUpperCase(), c: cores[i % cores.length] }));
}

// Escolhe uma cor de fundo vibrante e escura o suficiente pra texto branco.
export function escolherFundoFesta(paleta: string[], seed = 0): string {
  const escuras = paleta.filter((c) => luminancia(c) < 0.62);
  const lista = escuras.length ? escuras : paleta;
  return lista[Math.abs(seed) % lista.length] || "#2196F3";
}

function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function formatarTelefone(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

// ---- SVGs ----
export function bandeirinhaSVG(cores: string[], w = 1080): string {
  const passos = 13;
  const stepW = w / passos;
  const tris = Array.from({ length: passos }, (_, i) => {
    const x = i * stepW;
    const cc = cores[i % cores.length];
    return `<polygon points="${x},34 ${x + stepW},34 ${x + stepW / 2},118" fill="${cc}" stroke="#ffffff" stroke-width="3"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="140" viewBox="0 0 ${w} 140"><path d="M0,34 Q${w / 2},58 ${w},34" stroke="#ffffff" stroke-width="5" fill="none"/>${tris}</svg>`;
}

// Onda usa traçado quadrático (Q) — o gerador não renderiza bem cúbicas (C).
export function ondaSVG(cor: string, w = 1080): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="240" viewBox="0 0 ${w} 240"><path d="M0,90 Q${w * 0.28},10 ${w * 0.55},80 Q${w * 0.8},140 ${w},70 L${w},240 L0,240 Z" fill="${cor}"/></svg>`;
}

const iconeWhatsSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="${VERDE_WHATS}"><path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02zM12.04 20.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.09 0 1.23.9 2.42 1.03 2.59.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>`;
const iconeWhatsBranco = iconeWhatsSVG.replace(`fill="${VERDE_WHATS}"`, 'fill="#ffffff"');

// ---- Componentes JSX (para next/og) ----

export function Bandeirinha({ cores, w = 1080 }: { cores: string[]; w?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUri(bandeirinhaSVG(cores, w))} width={w} height={140} style={{ position: "absolute", top: 0, left: 0 }} />;
}

export function OndaBase({ cor, w = 1080, top = 1110 }: { cor: string; w?: number; top?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUri(ondaSVG(cor, w))} width={w} height={240} style={{ position: "absolute", top, left: 0 }} />;
}

export function Confete({ cores }: { cores: string[] }) {
  const pcs = [
    { left: 120, top: 220, r: 18, s: 26 },
    { left: 900, top: 300, r: -22, s: 30 },
    { left: 760, top: 200, r: 12, s: 22 },
    { left: 200, top: 520, r: 30, s: 24 },
    { left: 980, top: 560, r: -14, s: 28 },
    { left: 80, top: 760, r: 18, s: 22 },
  ];
  return (
    <>
      {pcs.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: p.left, top: p.top, width: p.s, height: p.s, backgroundColor: cores[i % cores.length], borderRadius: 6, transform: `rotate(${p.r}deg)`, display: "flex" }} />
      ))}
    </>
  );
}

// Garante legibilidade: se a cor do texto "some" no fundo (contraste de luminância
// baixo, ex: verde sobre verde), troca por branco (fundo escuro) ou preto (claro).
// Razão de contraste estilo WCAG; abaixo de ~2 o texto fica ilegível mesmo grande.
export function corContraste(cor: string, fundo?: string): string {
  if (!fundo) return cor;
  const lc = luminancia(cor) + 0.05;
  const lf = luminancia(fundo) + 0.05;
  const razao = Math.max(lc, lf) / Math.min(lc, lf);
  if (razao >= 2) return cor;
  return luminancia(fundo) < 0.5 ? BRANCO : PRETO;
}

export function TituloMulticolor({ linhas, fontSize = 100, fundo }: { linhas: { t: string; c: string }[]; fontSize?: number; fundo?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Fredoka" }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: "flex", fontSize, color: corContraste(l.c, fundo), lineHeight: 1.0, textShadow: contorno(), letterSpacing: 1 }}>
          {l.t}
        </div>
      ))}
    </div>
  );
}

export function CtaWhatsApp({ telefone }: { telefone: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", backgroundColor: VERDE_WHATS, borderRadius: 999, padding: "18px 36px", boxShadow: "0 8px 0 rgba(0,0,0,0.22)" }}>
      <div style={{ display: "flex", width: 60, height: 60, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginRight: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUri(iconeWhatsSVG)} width={38} height={38} />
      </div>
      <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 50, color: PRETO }}>{formatarTelefone(telefone)}</div>
    </div>
  );
}

export function LogoBalao({ src, top = 150, right = 70, h = 100 }: { src: string; top?: number; right?: number; h?: number }) {
  const w = Math.round(h * 1.76);
  return (
    <div style={{ position: "absolute", top, right, display: "flex", backgroundColor: "#fff", borderRadius: 28, padding: "18px 26px", boxShadow: "0 8px 0 rgba(0,0,0,0.18)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={w} height={h} style={{ objectFit: "contain" }} />
    </div>
  );
}

// Logo "solto" (fundo transparente, sem balão) com sombra leve pra destacar do fundo.
export function LogoSolto({ src, top = 120, right = 72, h = 120 }: { src: string; top?: number; right?: number; h?: number }) {
  const w = Math.round(h * 1.76);
  return (
    <div style={{ position: "absolute", top, right, display: "flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={w} height={h} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.4))" }} />
    </div>
  );
}

export { iconeWhatsBranco };
