import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FNM — Food Near Me",
  description: "A near-zero-input food decision engine. One confident pick, two backups, under 60 seconds.",
  manifest: "/manifest.webmanifest",
  // APPLE-TOUCH-ICON IS NOT OPTIONAL AND IT CANNOT BE SVG. Two facts about iOS
  // that between them hid this app's icon completely:
  //
  //   1. "Add to Home Screen" reads `apple-touch-icon` and nothing else — not
  //      the manifest, not `rel="icon"`. With none declared, iOS fell back to
  //      the first `rel="icon"`, which was the 32px favicon, and scaled it to
  //      180. That is why the home screen showed a blurry blaze instead of the
  //      husky: the wrong artwork at six times its size.
  //   2. iOS Safari does not render SVG for home-screen icons at all. Every
  //      icon here was SVG, so declaring one correctly still would not have
  //      worked. The PNGs are the fix, and they are what test/icon.test.ts
  //      guards.
  //
  // SVG stays first for `rel="icon"` — desktop browsers prefer it and it is
  // sharp at any zoom — with a PNG behind it for anything that cannot.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
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
