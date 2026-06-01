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
    title: "Momentum",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// Echte responsive weergave: device-width + initial-scale=1. Op desktop rendert
// de 3-koloms shell, op telefoon (<=768px) de mobiel-eigen gestapelde app. We
// schalen NIETS terug — geen 1280px-truc meer. Pinch-to-zoom blijft mogelijk
// (geen maximum-scale) voor toegankelijkheid.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1e1e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable" className={`${inter.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
