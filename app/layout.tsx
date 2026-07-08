import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Archivo_Black, Space_Mono, IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk, Inter, EB_Garamond, JetBrains_Mono } from "next/font/google";
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

// Conectores (rediseño): Space Grotesk (titulos) + Inter (cuerpo) del pad "Conectores
// Minimal". Scopeadas via --ff-grotesk / --ff-inter, solo las usa /conectores.
const grotesk = Space_Grotesk({ variable: "--ff-grotesk", subsets: ["latin"], weight: ["500", "600"] });
const inter = Inter({ variable: "--ff-inter", subsets: ["latin"], weight: ["400", "500", "600"] });

// Cockpit de toque (Toque 1/2/3, rediseño 2026-07-08): EB Garamond + JetBrains Mono
// calcan los mockups de "/Arc/toques ui". Scopeadas via --ff-toque-*, ver globals.css.
const toqueHeading = EB_Garamond({ variable: "--ff-toque-heading", subsets: ["latin"], weight: ["600"] });
const toqueMono = JetBrains_Mono({ variable: "--ff-toque-mono", subsets: ["latin"], weight: ["400"], style: ["normal", "italic"] });

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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${display.variable} ${spaceMono.variable} ${body.variable} ${monoTag.variable} ${grotesk.variable} ${inter.variable} ${toqueHeading.variable} ${toqueMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
