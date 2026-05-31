import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fonts worden nu MEEGEBUNDELD met de app (self-hosted via next/font), zodat
// elk apparaat exact hetzelfde lettertype toont. Voorheen stonden 'Inter' en
// 'JetBrains Mono' alleen als CSS-naam vermeld zonder ze te laden: desktops
// met Inter geinstalleerd toonden Inter, telefoons (zonder Inter) vielen terug
// op San Francisco -> ander font, ander gevoel. Dit lost dat op.
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

// Mobiel toont exact dezelfde desktop-UI: render op vaste desktopbreedte
// (1280px) en laat de browser het geheel terugschalen naar de schermbreedte,
// zodat het volledige dashboard past. Pinch-to-zoom blijft mogelijk.
export const viewport: Viewport = {
  width: "1280",
  viewportFit: "cover",
  themeColor: "#1a1a1a",
};

// Next injecteert standaard "initial-scale=1" naast onze width=1280. Die twee
// vechten: initial-scale=1 pint de zoom op 100% waardoor de telefoon ingezoomd
// op de linkerbovenhoek opent i.p.v. de hele 1280px-layout passend te tonen.
// We overschrijven de meta naar enkel "width=1280" zodat de browser het geheel
// netjes terugschaalt naar de schermbreedte (fit-to-width).
const fitViewport = `(function(){try{var m=document.querySelector('meta[name=viewport]');if(m){m.setAttribute('content','width=1280, viewport-fit=cover');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable" className={`${inter.variable} ${jbMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: fitViewport }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
