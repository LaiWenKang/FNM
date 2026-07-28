"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOODS } from "@/lib/mood";
import { BowlIcon } from "@/components/icons";

// One-tap "today" preferences. Selections are session-only: they ride along
// as query params and never modify the learned taste profile.

export default function MoodCard() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));
  }

  function go() {
    const q = selected.length ? `?mood=${selected.join(",")}` : "";
    router.push(`/recommend${q}`);
  }

  return (
    <div className="mood-card">
      <p className="eyebrow">Input</p>
      <p className="mood-title">Feeling anything today?</p>
      <div className="mood-chips">
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`chip ${selected.includes(m.id) ? "on" : ""}`}
            onClick={() => toggle(m.id)}
            type="button"
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>
      <button className="big-btn" onClick={go} type="button">
        <BowlIcon size={20} strokeWidth={2} />
        Eat now
        {selected.length > 0 && <span className="count-pill">{selected.length} picked</span>}
      </button>
    </div>
  );
}
