"use client";

import { useEffect, useState } from "react";
import { cuisineLabel } from "@/lib/cuisine";
import Togo from "@/components/Togo";
import { togoLine } from "@/lib/togoLines";

// ═══ THE ONLY QUESTION ASKED AFTER THE MEAL ═══════════════════════════════
//
// Everything else this app learns from is a PREDICTION. A calibration swipe
// says what you think you like. A pick says what looked best at 12:15 among
// three options. Neither of them knows how the food actually was — the app
// watched you walk in and then never asked what happened.
//
// So this is the highest-quality signal available to it, and it costs one tap.
//
// THREE ANSWERS, NOT FIVE STARS. A star rating asks you to grade a restaurant,
// which is a review — work done for strangers. These three ask what you would
// do next time, which is the only thing the app can act on and the only thing
// you actually know. "Again" is not 5/5; it is a decision.
//
// IT NEVER NAGS. One meal, one ask, dismissible, and it does not come back for
// that meal whether you answer or not. An app that pesters people for training
// data has started serving itself.

interface Pending {
  placeId: string;
  cuisine: string;
  at: number;
}

const CHOICES: { verdict: "again" | "fine" | "no"; label: string }[] = [
  { verdict: "again", label: "Again" },
  { verdict: "fine", label: "It was fine" },
  { verdict: "no", label: "Not again" },
];

export default function HowWasIt() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/pick")
      .then((r) => r.json())
      .then((d) => setPending(d?.pending ?? null))
      // A failure here means no prompt, which is the correct silent outcome —
      // this is an optional question, never something that can break the page.
      .catch(() => setPending(null));
  }, []);

  async function answer(verdict: "again" | "fine" | "no") {
    if (!pending || busy) return;
    setBusy(true);
    // Dismissed immediately rather than on the response. The answer is already
    // given from the diner's point of view, and making them watch a spinner
    // for a one-tap courtesy is how a one-tap courtesy stops being one.
    setDone(true);
    await fetch("/api/pick", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: pending.placeId, verdict }),
    }).catch(() => {});
  }

  if (!pending || done) return null;

  return (
    <section className="howwasit mat mat-thin" aria-label="Rate your last meal">
      <Togo mood="hedging" size={40} gid="hwi" className="guide-togo togo-face" />
      <div className="hwi-copy">
        <p className="hwi-say togo-say">{togoLine("howWasIt")}</p>
        <p className="hwi-sub">
          You had <span className="data-num">{cuisineLabel(pending.cuisine)}</span>. Would you go
          back?
        </p>
      </div>
      <div className="hwi-row">
        {CHOICES.map((c) => (
          <button
            key={c.verdict}
            type="button"
            className={`hwi-btn${c.verdict === "again" ? " hwi-yes" : ""}`}
            disabled={busy}
            onClick={() => void answer(c.verdict)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* An explicit way out. Without one the only escape is to answer, which
          turns an optional question into a toll gate. */}
      <button type="button" className="hwi-skip" onClick={() => setDone(true)}>
        Skip
      </button>
    </section>
  );
}
