import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/config";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const DESC =
  "Carrosséis, posts e stories criados por IA e postados sozinhos no Instagram do seu negócio. Você cuida do que importa, o Postaí cuida das redes.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://www.meupostai.com.br"),
  title: `${APP_NAME} — seu Instagram no piloto automático`,
  description: DESC,
  // A imagem do cartão (og:image) vem automática de app/opengraph-image.tsx.
  openGraph: {
    title: `${APP_NAME} — seu Instagram no piloto automático`,
    description: DESC,
    url: "/",
    siteName: APP_NAME,
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — seu Instagram no piloto automático`,
    description: DESC,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${oswald.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
