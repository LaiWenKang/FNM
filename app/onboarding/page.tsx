"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CALIBRATION_DECK } from "@/lib/calibration";
import { DIMS, Dim, FlavorVector } from "@/lib/flavor";
import BrandRow from "@/components/BrandRow";
import SwipeDeck from "@/components/SwipeDeck";
import TasteRadar from "@/components/TasteRadar";
import Togo from "@/components/Togo";
import { ONBOARDING_BEATS, togoLine } from "@/lib/togoLines";

// The cold-start swipe bootstrap: ~16 dish cards, yes/no, ~60 seconds.
// Each answer nudges the flavor vector server-side (POST /api/swipe).
//
// THE GESTURE NOW EXISTS (components/SwipeDeck.tsx), and the vector the deck
// draws is the REAL one: /api/swipe has always returned the updated vector in
// its response and this screen has always thrown it away. Same request, same
// contract — but now the profile visibly forms while you swipe, which is the
// entire emotional payoff of onboarding and was previously a 5px bar moving 6%.

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
  const [vector, setVector] = useState<FlavorVector | null>(null);
  const [reaction, setReaction] = useState<"yes" | "no" | null>(null);
  const reactTimer = useRef<number | null>(null);

  const card = CALIBRATION_DECK[index];
  const done = index >= CALIBRATION_DECK.length;

  async function answer(liked: boolean) {
    if (busy || done) return;
    setBusy(true);
    setExit(liked ? "yes" : "no");
    // He reacts within 120ms and holds before the next card lands:
    // yes → a 3px pull forward · no → one ear back and a short head shake.
    setReaction(liked ? "yes" : "no");
    if (reactTimer.current) window.clearTimeout(reactTimer.current);
    reactTimer.current = window.setTimeout(() => setReaction(null), 620);
    try {
      const [res] = await Promise.all([
        fetch("/api/swipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id, liked }),
        }),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      const json = (await res.json().catch(() => null)) as { vector?: FlavorVector } | null;
      if (json?.vector) setVector(json.vector);
    } finally {
      setBusy(false);
      setExit(null);
      const next = index + 1;
      setIndex(next);
      if (next >= CALIBRATION_DECK.length) {
        router.push("/recommend");
      }
    }
  }

  if (done) {
    return (
      <main>
        <div className="center compile">
          {/* THE HOWL — twice in a user's life, which is exactly why it lands —
              and the product's only exclamation mark. */}
          <Togo mood="howl" variant="bust" size={128} gid="cal" className="compile-togo togo-face" />
          {vector && <TasteRadar vector={vector} decorative gid="calr" size={168} className="compile-radar" />}
          <p className="compile-say togo-say">{togoLine("calibrated")}</p>
          <p className="compile-sub">Compiling your palate…</p>
        </div>
      </main>
    );
  }

  const axes = flavorAxes(card.flavor);
  const beat = ONBOARDING_BEATS[index] ?? null;

  return (
    <main className="onboard">
      <BrandRow label="Calibration" />

      {/* ONE CHROME ROW. The question comes before the answer, and the counter
          rides beside it instead of floating alone in the far corner. */}
      <div className="swipe-head">
        <p className="swipe-prompt">Would you eat this?</p>
        <span className="progress-head">
          {String(index + 1).padStart(2, "0")} / {CALIBRATION_DECK.length}
        </span>
      </div>

      <SwipeDeck
        card={card}
        index={index}
        total={CALIBRATION_DECK.length}
        axes={axes}
        busy={busy}
        exit={exit}
        vector={vector}
        reaction={reaction}
        beat={beat}
        onAnswer={(liked) => void answer(liked)}
      />

      {/* THE WAY OUT, which did not exist. Sixteen cards with no exit is a gate,
          and a gate in front of lunch contradicts the one promise this app
          makes. Every swipe already counts on its own — the profile is saved
          per card, not at the end — so leaving after four is not abandoning
          calibration, it is doing four cards' worth of it and eating.

          Deliberately quiet and deliberately below the deck: the cards are
          still the recommended path, and this is an exit, not a competing CTA. */}
      <Link className="hud-chip hud-link onboard-skip" href="/recommend">
        {index === 0 ? "Skip — just feed me" : `Stop here · ${index} in`}
      </Link>
    </main>
  );
}
