import type { Metadata, Viewport } from "next";
import "./globals.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1a1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable">
      <body>{children}</body>
    </html>
  );
}
