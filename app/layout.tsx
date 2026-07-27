import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FNM — Food Near Me",
  description: "A near-zero-input food decision engine. One confident pick, two backups, under 60 seconds.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#d95d39",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
