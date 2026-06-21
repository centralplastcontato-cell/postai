import type { ReactNode } from "react";

// Ícones SVG por tema do Álbum da Festa. Chave = nome canônico do tema (lib/temas-festa).
// Desenhados em branco (currentColor) pra aparecer no hero colorido. SEMPRE genéricos — nunca
// a marca/personagem oficial (direitos): "orelhas redondas" evoca o ratinho sem ser o Mickey,
// "bandeira de corrida" evoca Hot Wheels, etc. Tema sem ícone aqui cai no emoji (fallback).

const ICONES: Record<string, ReactNode> = {
  // Ratinho fofo (orelhas + cabeça) — evoca Mickey & Minnie sem a silhueta oficial.
  "Mickey & Minnie": (
    <>
      <circle cx="6.5" cy="7" r="4.3" />
      <circle cx="17.5" cy="7" r="4.3" />
      <circle cx="12" cy="14.5" r="6.6" />
    </>
  ),
  Princesas: (
    <>
      <path d="M4 19V10l3.4 2.8L12 7l4.6 5.8L20 10v9z" />
      <circle cx="4" cy="9" r="1.5" />
      <circle cx="12" cy="5.6" r="1.6" />
      <circle cx="20" cy="9" r="1.5" />
    </>
  ),
  "Hot Wheels": (
    <>
      <rect x="3.4" y="3" width="1.9" height="18" rx="0.95" />
      <path d="M6 4h13v9H6z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="6" y="4" width="3.25" height="3" />
      <rect x="12.5" y="4" width="3.25" height="3" />
      <rect x="9.25" y="7" width="3.25" height="3" />
      <rect x="15.75" y="7" width="3.25" height="3" />
      <rect x="6" y="10" width="3.25" height="3" />
      <rect x="12.5" y="10" width="3.25" height="3" />
    </>
  ),
  "Super-heróis": <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  Futebol: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.4l3.4 2.5-1.3 4h-4.2L8.6 9.9z" />
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M12 3.2v2.1M5.2 9.7l1.9 1.4M18.8 9.7l-1.9 1.4M8.4 19l1.1-1.9M15.6 19l-1.1-1.9" />
      </g>
    </>
  ),
  Espaço: (
    <>
      <path d="M12 2c2.7 1.9 4.2 4.8 4.2 8.3V13H7.8v-2.7C7.8 6.8 9.3 3.9 12 2z" />
      <path d="M7.8 11.6L5.3 15l2.5-.7zM16.2 11.6l2.5 3.4-2.5-.7z" />
      <path d="M9.7 15.5h4.6L12 20.5z" />
    </>
  ),
  "Jardim Encantado": (
    <>
      <circle cx="12" cy="6.2" r="3.1" />
      <circle cx="18" cy="10.6" r="3.1" />
      <circle cx="15.7" cy="17.6" r="3.1" />
      <circle cx="8.3" cy="17.6" r="3.1" />
      <circle cx="6" cy="10.6" r="3.1" />
    </>
  ),
  "Super Mario": (
    <>
      <path d="M12 3a8.5 8.5 0 0 1 8.5 8.5H3.5A8.5 8.5 0 0 1 12 3z" />
      <path d="M9 12h6v5a3 3 0 0 1-6 0z" />
    </>
  ),
  Barbie: <path d="M12 20.5S4.5 16 4.5 10.6A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7.5 2.2C19.5 16 12 20.5 12 20.5z" />,
  "Patrulha Canina": (
    <>
      <circle cx="6.8" cy="9.5" r="1.9" />
      <circle cx="11" cy="7.6" r="2.1" />
      <circle cx="15.2" cy="9.5" r="1.9" />
      <path d="M11 11.5c-2.8 0-4.7 1.9-4.7 3.9C6.3 17 8 18 11 18s4.7-1 4.7-2.6c0-2-1.9-3.9-4.7-3.9z" />
    </>
  ),
  Frozen: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M4.2 7.5l15.6 9" />
      <path d="M19.8 7.5L4.2 16.5" />
      <path d="M12 6.6l2.3-1.7M12 6.6L9.7 4.9M12 17.4l2.3 1.7M12 17.4L9.7 19.1" />
      <path d="M5.7 8.5l-.5 2.6M5.7 8.5l2.5.6M18.3 15.5l.5-2.6M18.3 15.5l-2.5-.6" />
      <path d="M5.2 15.5l2.5-.6M5.2 15.5l.5 2.6M18.8 8.5l-2.5.6M18.8 8.5l-.5-2.6" />
    </g>
  ),
};

export function IconeTema({ nome, emoji, className = "" }: { nome: string; emoji: string; className?: string }) {
  const svg = ICONES[nome];
  if (!svg) return <span className={className} aria-hidden>{emoji}</span>;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={`inline-block ${className}`}>
      {svg}
    </svg>
  );
}
