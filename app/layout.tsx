import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FNM — Food Near Me",
  description: "A near-zero-input food decision engine. One confident pick, two backups, under 60 seconds.",
  manifest: "/manifest.webmanifest",
  // Variant C — the bare mark — is the favicon, because his logo happens to be
  // an arrow, the single most legible form at 16px.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070B" },
    { media: "(prefers-color-scheme: light)", color: "#F3F1EE" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-togo="on" suppressHydrationWarning>
      <head>
        {/* HIDE TOGO, applied before first paint. Offering the exit is what
            makes him read as confident rather than imposed — but the exit has to
            be silent, not a flash of face followed by its removal. The bare
            NEEDLE marks are untouched by it: they are brand, not voice. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.togo=localStorage.getItem('fnm_togo_hidden')==='1'?'off':'on'}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <TabBar />
      </body>
    </html>
  );
}
