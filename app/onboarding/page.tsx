"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SWIPE_CARDS } from "@/lib/data/seed";

// The cold-start swipe bootstrap: ~16 dish cards, yes/no, ~60 seconds.
// Each answer nudges the flavor vector server-side (POST /api/swipe).

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const card = SWIPE_CARDS[index];
  const done = index >= SWIPE_CARDS.length;

  async function answer(liked: boolean) {
    if (busy || done) return;
    setBusy(true);
    try {
      await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, liked }),
      });
    } finally {
      setBusy(false);
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
        <div className="center">Got it — building your first pick…</div>
      </main>
    );
  }

  return (
    <main>
      <div className="brand">
        FNM <span>·</span> your taste
      </div>
      <div className="progress">
        <div style={{ width: `${(index / SWIPE_CARDS.length) * 100}%` }} />
      </div>
      <div className="hero">
        <div className="swipe-card">
          <span className="emoji">{card.emoji}</span>
          <span className="label">{card.label}</span>
        </div>
        <div className="swipe-actions">
          <button onClick={() => answer(false)} disabled={busy} aria-label="Not for me">
            👎
          </button>
          <button className="yes" onClick={() => answer(true)} disabled={busy} aria-label="Yes please">
            😋
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {index + 1} of {SWIPE_CARDS.length} — would you eat this?
        </p>
      </div>
    </main>
  );
}
