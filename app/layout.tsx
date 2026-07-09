import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Sistema de diseño único (Fix 6, 2026-07-08): una sola serif de títulos
// (Newsreader, --ff-serif), una sola sans de cuerpo (IBM Plex Sans, --ff-body)
// y una sola mono (IBM Plex Mono, --ff-mono-tag). Todos los roles semánticos
// (--font-heading, --font-toque-heading, --font-mono, --font-toque-mono, etc.)
// apuntan a estas tres familias en app/globals.css -- ver docs/design-tokens.md.
const serif = Newsreader({ variable: "--ff-serif", subsets: ["latin"], weight: ["400", "500"] });
const body = IBM_Plex_Sans({ variable: "--ff-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const monoTag = IBM_Plex_Mono({ variable: "--ff-mono-tag", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Follow-ups OnePay",
  description: "Cockpit de follow-ups comerciales",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${serif.variable} ${body.variable} ${monoTag.variable}`}>
      <body>{children}</body>
    </html>
  );
}
