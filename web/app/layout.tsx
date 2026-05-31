import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fonts worden MEEGEBUNDELD met de app (self-hosted via next/font), zodat elk
// apparaat exact hetzelfde lettertype toont. Voorheen stonden 'Inter' en
// 'JetBrains Mono' alleen als CSS-naam vermeld zonder ze te laden: desktops met
// Inter geinstalleerd toonden Inter, telefoons (zonder Inter) vielen terug op
// San Francisco -> ander font, ander gevoel.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: "Trader Agent · Paper Trading Dashboard",
  description: "Momentum Breakout — Paper Trading Dashboard v0.1",
  appleWebApp: {
    capable: true,
    title: "Momentum-1",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// BEWUST GEEN `export const viewport` hier. Next voegt dan standaard
// "initial-scale=1" toe aan de viewport-meta, en die pint de zoom op 100%:
// op een telefoon zie je dan maar ~390px van de 1280px-layout (ingezoomd op
// de linkerbovenhoek). iOS Safari negeert bovendien JS dat de meta achteraf
// aanpast. De enige betrouwbare oplossing is de meta server-side zelf zetten
// met ENKEL een vaste breedte (geen initial-scale), zodat Safari de volledige
// 1280px-desktoplayout passend terugschaalt naar de schermbreedte.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable" className={`${inter.variable} ${jbMono.variable}`}>
      <head>
        <meta name="viewport" content="width=1280, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
