"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandRow from "@/components/BrandRow";
import MoodCard from "@/components/MoodCard";
import PlanBar from "@/components/PlanBar";
import TasteRadar from "@/components/TasteRadar";
import Togo from "@/components/Togo";
import { StoreIcon, TargetIcon } from "@/components/icons";
import { SEED_PLACES } from "@/lib/data/seed";
import { effectiveHour, formatHour, loadPlan, mealFor } from "@/lib/plan";
import { togoLine } from "@/lib/togoLines";

// HOME. Three structural fixes, not cosmetic ones:
//   · THE VOID — .hero no longer takes flex:1 and centres itself, so the screen
//     anchors to the top and the lower third carries real content.
//   · THE WATERMARK — the old .hero-radar sat at top:-52px/right:-34px, bled off
//     the edge, was clipped by body{overflow-x:hidden} and rendered as a partial
//     dark-orange polygon fragment. It read as a bug. Gone.
//   · THE SCREEN GRADUATES. Before calibration, a Togo bust half-cropped by the
//     edge pulls toward the calibrate pill. After it, that slot becomes a
//     properly inset radar watermark and he never appears there again.

const WATERMARK = { heat: 0.72, sweet: 0.45, soupy: 0.6, fried: 0.55, rich: 0.68, adventure: 0.5 };

function isOpen(openHour: number, closeHour: number, hour: number): boolean {
  return closeHour > openHour ? hour >= openHour && hour < closeHour : hour >= openHour || hour < closeHour;
}

export default function Home() {
  const [swipeCount, setSwipeCount] = useState<number | null>(null);
  const [place, setPlace] = useState<{ label: string; hour: number } | null>(null);

  useEffect(() => {
    const plan = loadPlan();
    setPlace({ label: plan.label, hour: effectiveHour(plan) });
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setSwipeCount(typeof d?.swipeCount === "number" ? d.swipeCount : 0))
      .catch(() => setSwipeCount(0));
  }, []);

  const calibrated = swipeCount !== null && swipeCount > 0;
  const hour = place?.hour ?? 12;
  const open = SEED_PLACES.filter((p) => isOpen(p.openHour, p.closeHour, hour));
  const closing = [...open].sort((a, b) => a.closeHour - b.closeHour)[0];

  return (
    <main className="home">
      <BrandRow />

      <section className="hero home-hero">
        {calibrated && (
          // Fully contained, inset, low — a watermark rather than a fragment.
          <TasteRadar vector={WATERMARK} decorative gid="wm" className="hero-watermark" />
        )}
        <h1>
          Stop asking
          <br />
          <span className="grad-text">&ldquo;what should we eat?&rdquo;</span>
        </h1>
        <p className="sub">
          One confident pick, two backups. Under <span className="data-num">60</span> seconds.
        </p>
      </section>

      <PlanBar />

      {/* THE CALIBRATE PROMPT sits ABOVE the main CTA, not below it. A 130px
          bust placed after the mood card fell past the fold on a 390×844
          screen: his head rendered behind the floating tab bar and the pill —
          the single most important first-run action — was off-screen entirely.
          A compact glass strip keeps him, his line and the pill all visible
          without scrolling. Once calibrated, gone. */}
      {swipeCount !== null && !calibrated && (
        <div className="guide mat mat-thin">
          <Togo mood="harnessed" size={40} gid="guide" className="guide-togo togo-face" />
          <div className="guide-copy">
            <p className="guide-say togo-say">{togoLine("emptyPalate")}</p>
          </div>
          <Link className="hud-chip hud-link guide-pill" href="/onboarding">
            <TargetIcon size={13} strokeWidth={2} />
            Calibrate
          </Link>
        </div>
      )}

      <MoodCard />

      {calibrated && (
        <Link className="hud-chip hud-link home-recal" href="/onboarding">
          <TargetIcon size={13} strokeWidth={2} />
          Recalibrate
        </Link>
      )}

      {/* THE TONIGHT STRIP — the old .home-foot was 10px ink-3 with
          letter-spacing:.1em, which rendered the least important text on the
          screen as the widest element in the layout. Same catalogue, stated as
          instruments, filling the dead lower third. */}
      <section className="tonight" aria-label="Catalogue status">
        <p className="tonight-head">
          <span className="dot" aria-hidden="true" />
          {place ? `${mealFor(hour)} in ${place.label}` : "Singapore CBD"}
        </p>
        <div className="tonight-grid">
          <div className="stat">
            <span className="stat-k">Open now</span>
            <span className="stat-v count" style={{ ["--score" as string]: open.length }} aria-hidden="true" />
            <span className="sr-only">{open.length}</span>
          </div>
          <div className="stat">
            <span className="stat-k">Indexed</span>
            <span
              className="stat-v count"
              style={{ ["--score" as string]: SEED_PLACES.length }}
              aria-hidden="true"
            />
            <span className="sr-only">{SEED_PLACES.length}</span>
          </div>
          <div className="stat wide">
            <span className="stat-k">Closes first</span>
            <span className="stat-v small">
              {closing ? `${closing.name.replace(/\s*\(.*\)$/, "")} · ${formatHour(closing.closeHour)}` : "—"}
            </span>
          </div>
        </div>
        <p className="tonight-foot">
          <StoreIcon size={13} strokeWidth={1.7} />
          Curated launch catalogue · Singapore CBD
        </p>
      </section>
    </main>
  );
}
