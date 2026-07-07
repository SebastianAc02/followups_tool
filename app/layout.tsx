import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--ff-serif", subsets: ["latin"], weight: ["400", "500"] });
const display = Space_Grotesk({ variable: "--ff-display", subsets: ["latin"], weight: ["500", "600"] });
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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${display.variable} ${monoTag.variable}`}>
      <body>{children}</body>
    </html>
  );
}
