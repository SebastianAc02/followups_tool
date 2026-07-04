import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500"] });

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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
