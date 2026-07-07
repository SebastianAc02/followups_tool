import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Archivo_Black, Space_Mono, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Cockpit de campañas (Fase 0): Newsreader (títulos, --ff-serif) + IBM Plex Sans
// (cuerpo, --ff-body) calcan los mockups V1-V7. Archivo Black (--ff-display) sigue
// vivo solo para el home dashboard (font-heading). Space Mono queda dormido como
// escape hatch -- swap de --ff-body es una linea en globals.css, ver docs/design-tokens.md.
const geistSans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--ff-serif", subsets: ["latin"], weight: ["400", "500"] });
const display = Archivo_Black({ variable: "--ff-display", subsets: ["latin"], weight: "400" });
const spaceMono = Space_Mono({ variable: "--ff-space-mono", subsets: ["latin"], weight: ["400", "700"] });
const body = IBM_Plex_Sans({ variable: "--ff-body", subsets: ["latin"], weight: ["400", "500", "600"] });
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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${display.variable} ${spaceMono.variable} ${body.variable} ${monoTag.variable}`}>
      <body>{children}</body>
    </html>
  );
}
