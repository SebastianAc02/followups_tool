import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Archivo_Black, Space_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Identidad del mockup "Orquesta CRM": Archivo Black (títulos) + Space Mono (cuerpo).
// Geist queda como --ff-sans dormido (escape hatch para tablas densas si el mono pesa).
const geistSans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--ff-serif", subsets: ["latin"], weight: ["400", "500"] });
const display = Archivo_Black({ variable: "--ff-display", subsets: ["latin"], weight: "400" });
const body = Space_Mono({ variable: "--ff-body", subsets: ["latin"], weight: ["400", "700"] });
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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${display.variable} ${body.variable} ${monoTag.variable}`}>
      <body>{children}</body>
    </html>
  );
}
