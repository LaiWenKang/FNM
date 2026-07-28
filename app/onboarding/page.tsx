"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SWIPE_CARDS } from "@/lib/data/seed";
import { DIMS, Dim, FlavorVector } from "@/lib/flavor";
import BrandRow from "@/components/BrandRow";
import { CheckIcon, XIcon } from "@/components/icons";

// The cold-start swipe bootstrap: ~16 dish cards, yes/no, ~60 seconds.
// Each answer nudges the flavor vector server-side (POST /api/swipe).

const AXIS_LABELS: Record<Dim, string> = {
  heat: "HEAT",
  sweet: "SWEET",
  soupy: "SOUPY",
  fried: "CRISP",
  rich: "RICH",
  adventure: "NOVEL",
};

/** Mono micro-row of the card's dominant flavor axes, e.g. "HEAT + · RICH +". */
function flavorAxes(flavor: FlavorVector): string {
  return DIMS.map((d) => ({ d, dev: flavor[d] - 0.5 }))
    .filter((x) => Math.abs(x.dev) >= 0.2)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, 3)
    .map((x) => `${AXIS_LABELS[x.d]} ${x.dev > 0 ? "+" : "−"}`)
    .join(" · ");
}

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [exit, setExit] = useState<"yes" | "no" | null>(null);

  const card = SWIPE_CARDS[index];
  const done = index >= SWIPE_CARDS.length;

  async function answer(liked: boolean) {
    if (busy || done) return;
    setBusy(true);
    setExit(liked ? "yes" : "no");
    try {
      await Promise.all([
        fetch("/api/swipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id, liked }),
        }),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
    } finally {
      setBusy(false);
      setExit(null);
      const next = index + 1;
      setIndex(next);
      if (next >= SWIPE_CARDS.length) {
        router.push("/recommend");
      }
    }
  }

  if (done) {
    return (
      <main>
        <div className="center compile">
          <div className="compile-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Compiling your palate…</p>
        </div>
      </main>
    );
  }

  const axes = flavorAxes(card.flavor);

  return (
    <main>
      <BrandRow label="Calibration" />
      <div className="progress-head">
        {String(index + 1).padStart(2, "0")} / {SWIPE_CARDS.length}
      </div>
      <div className="progress">
        <div style={{ width: `${((index + 1) / SWIPE_CARDS.length) * 100}%` }} />
      </div>
      <div className="hero">
        <div className="swipe-stack">
          <div
            key={card.id}
            className={`swipe-card${exit === "yes" ? " exit-yes" : exit === "no" ? " exit-no" : ""}`}
          >
            <span className="emoji">{card.emoji}</span>
            <span className="label">{card.label}</span>
            {axes && <p className="swipe-axes">{axes}</p>}
          </div>
        </div>
        <div className="swipe-actions">
          <button className="no" onClick={() => answer(false)} disabled={busy} aria-label="Not for me">
            <XIcon size={26} strokeWidth={2} />
          </button>
          <button className="yes" onClick={() => answer(true)} disabled={busy} aria-label="Yes please">
            <CheckIcon size={28} strokeWidth={2.2} />
          </button>
        </div>
        <p className="swipe-prompt">Would you eat this?</p>
      </div>
    </main>
  );
}
