import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trader Agent · Paper Trading Dashboard",
  description: "Momentum Breakout — Paper Trading Dashboard v0.1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable">
      <body>{children}</body>
    </html>
  );
}
