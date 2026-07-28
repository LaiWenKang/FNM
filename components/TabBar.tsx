"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Needle from "@/components/Needle";
import Togo from "@/components/Togo";
import { BowlIcon, PersonIcon, RadarGlyphIcon } from "@/components/icons";

// TAB BAR AS REAL CHROME.
//
// It used to carry a 180deg dark-at-the-bottom gradient, which makes a bar read
// as a solid pill rather than as chrome — the frosted surface was frosting
// nothing. Now: --mat-chrome, a top-bright / bottom-dark rim, and a real blur.
//
// The active state used to be a glowing orange rect (--accent-soft plus a 24px
// glow), which is a gaming trope, not iOS. Now: one capsule that SLIDES on
// --tab-i over --spring, plus a stroke→fill icon morph.
//
// TOGO'S HEAD BECOMES THE "YOU" ICON once signed in. Signing in visibly changes
// your tab bar, which is a small and extremely satisfying reward. The EAT bowl
// takes a 7px CYAN NEEDLE badge when a fresh pick is waiting — the monogram used
// as a system affordance rather than a generic dot. No full-body mascot ever
// lives in permanent chrome; absence here is what buys presence elsewhere.

export const FRESH_PICK_KEY = "fnm_fresh_pick";

/** One request per page load at most, shared by every mount. */
let accountPromise: Promise<boolean> | null = null;
function signedIn(): Promise<boolean> {
  if (!accountPromise) {
    accountPromise = fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => Boolean(d?.account?.signedIn))
      .catch(() => false);
  }
  return accountPromise;
}

const TABS = [
  { href: "/", label: "Eat" },
  { href: "/taste", label: "Taste" },
  { href: "/profile", label: "You" },
];

export default function TabBar() {
  const pathname = usePathname();
  const [account, setAccount] = useState(false);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    let live = true;
    void signedIn().then((v) => live && setAccount(v));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    try {
      setFresh(window.localStorage.getItem(FRESH_PICK_KEY) === "1");
    } catch {
      setFresh(false);
    }
  }, [pathname]);

  const activeIndex = TABS.findIndex((t) =>
    t.href === "/" ? pathname === "/" || pathname.startsWith("/recommend") : pathname.startsWith(t.href),
  );

  return (
    <nav
      className="tab-bar mat mat-chrome"
      aria-label="Main navigation"
      style={{ "--tab-i": Math.max(0, activeIndex) } as CSSProperties}
      data-off={activeIndex < 0 ? "1" : undefined}
    >
      <span className="tab-capsule" aria-hidden="true" />
      {TABS.map((tab, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="tab-icon">
              {tab.href === "/" && <BowlIcon />}
              {tab.href === "/taste" && <RadarGlyphIcon />}
              {tab.href === "/profile" &&
                (account ? (
                  <Togo mood="harnessed" size={22} gid="tb" className="tab-togo togo-face" />
                ) : (
                  <PersonIcon />
                ))}
              {/* Hide-Togo removes every face, so the YOU tab needs its generic
                  glyph back. CSS swaps them; neither costs a request. */}
              {tab.href === "/profile" && account && <PersonIcon className="tab-togo-fallback" />}
              {tab.href === "/" && fresh && (
                <span className="tab-badge" aria-label="A fresh pick is ready">
                  <Needle size={7} tone="data" gid="tbb" />
                </span>
              )}
            </span>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
