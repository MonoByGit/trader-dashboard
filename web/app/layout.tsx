import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

// Normale mobiele viewport (device-width). De desktop-UI wordt op mobiel als
// geheel verkleind via een CSS transform in globals.css (calc(100vw / 1280px)),
// niet via een viewport-truc — Next forceert daar altijd initial-scale=1 bij,
// wat de zoom op iOS op 100% pinde.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1a1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable" className={`${inter.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
