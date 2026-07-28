"use client";

import { useRouter } from "next/navigation";
import { loadPlan, effectiveHour } from "@/lib/plan";
import { useState } from "react";
import { MOODS } from "@/lib/mood";
import { MOOD_LINES, togoLine } from "@/lib/togoLines";
import Glyph from "@/components/Glyph";
import Togo, { TogoMood } from "@/components/Togo";
import { BowlIcon, PersonIcon } from "@/components/icons";

// One-tap "today" preferences. Selections are session-only: they ride along
// as query params and never modify the learned taste profile.
//
// TOGO BRACES AGAINST THE TOP-RIGHT of this card, half-clipped by its boundary
// so he reads as physically braced against it, with the ember TUGLINE running
// down and across TO THE PRIMARY CTA. That resolves the ember-competition
// problem structurally: his one warm element is an ARROW TO the button, not a
// rival for it.
//
// He is also the live reaction surface these chips have never had — until now
// the only feedback for tapping one was a fill state.

/** His pose per chip. Bound to the choice, never decorative. */
const CHIP_MOOD: Record<string, { mood: TogoMood; tilt?: boolean }> = {
  spicy: { mood: "reading" },
  light: { mood: "locked" },
  soupy: { mood: "harnessed" },
  comfort: { mood: "locked" },
  cheap: { mood: "hedging" },
  nearby: { mood: "reading" },
  surprise: { mood: "hedging", tilt: true },
};

export default function MoodCard() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id];
      setLast(next.includes(id) ? id : null);
      return next;
    });
  }

  function go() {
    const q = selected.length ? `?mood=${selected.join(",")}` : "";
    router.push(`/recommend${q}`);
  }

  /* EAT TOGETHER. The group opens from the SAME card as the solo pick, seeded
     with the same place and time the plan bar is already showing, so "us" is
     one tap off "me" rather than a separate mode you have to go and find. */
  async function together() {
    setMaking(true);
    const plan = loadPlan();
    const r = await fetch("/api/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: plan.lat,
        lng: plan.lng,
        label: plan.label,
        hour: effectiveHour(plan),
      }),
    })
      .then((x) => x.json())
      .catch(() => null);
    if (r?.code) router.push(`/g/${r.code}`);
    else setMaking(false);
  }

  const pose = last ? CHIP_MOOD[last] : null;

  return (
    <div className="mood-card mat mat-regular" style={{ ["--card-i" as string]: 1 }}>
      <div className="mood-head">
        <div>
          {/* "INPUT" was an engineering term used as a section header above a
              sentence that already said the same thing. */}
          <p className="eyebrow">Today</p>
          <p className="mood-title">Feeling anything today?</p>
        </div>
        <span className="mood-togo">
          <Togo
            mood={pose?.mood ?? "harnessed"}
            tilt={pose?.tilt}
            size={56}
            gid="mc"
            className="togo-brace togo-face"
          />
        </span>
      </div>

      {/* THE TUGLINE — from his harness, down the right-hand gutter, terminating
          ON the CTA at an ember hitch that rhymes with his harness ring. It used
          to be a 1px brown hairline crossing two interactive chips and stopping
          at the button's top edge without attaching: a hair on the lens, not a
          line under load. It is now routed clear of every tap target and it
          carries a light-mode stop that survives the near-white ground. */}
      <svg
        className="mood-tug togo-face"
        viewBox="0 0 26 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* THE LINE HAS TO COME FROM SOMEWHERE. The head variant carries no
              harness, so a round cap at the top left the line beginning in mid
              air beside his jaw, on the card's corner radius — a stray ember
              stroke rather than rigging. Both the line and its bloom now fade
              up from zero, so it reads as running out from behind him. */}
          <linearGradient id="mc-tug" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tug-1)" stopOpacity="0" />
            <stop offset="0.22" stopColor="var(--tug-1)" />
            <stop offset="1" stopColor="var(--tug-2)" />
          </linearGradient>
          <linearGradient id="mc-tug-glow" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tug-glow)" stopOpacity="0" />
            <stop offset="0.3" stopColor="var(--tug-glow)" />
            <stop offset="1" stopColor="var(--tug-glow)" />
          </linearGradient>
        </defs>
        {/* NO vector-effect here: non-scaling-stroke moves the dash pattern into
            screen space, which silently defeats pathLength and cut this line
            into three pieces with round caps — it read as two stray strokes.
            The box is 1:1 horizontally, so the stroke width is honest anyway. */}
        <path
          className="mood-tug-glow"
          d="M20 0 C25 24 26 56 17 78 C12 90 8 96 3 100"
          fill="none"
          pathLength={100}
        />
        <path
          d="M20 0 C25 24 26 56 17 78 C12 90 8 96 3 100"
          fill="none"
          stroke="url(#mc-tug)"
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength={100}
        />
      </svg>
      <span className="mood-hitch togo-face" aria-hidden="true" />

      <p className="mood-say togo-say">{last ? MOOD_LINES[last] : togoLine("home")}</p>

      <div className="mood-chips grid-2">
        {MOODS.map((m, i) => (
          <button
            key={m.id}
            className={`chip glyph-chip ${selected.includes(m.id) ? "on" : ""}`}
            style={{ ["--i" as string]: i }}
            data-wide={m.id === "surprise" ? "1" : undefined}
            onClick={() => toggle(m.id)}
            type="button"
            aria-pressed={selected.includes(m.id)}
          >
            <Glyph name={m.glyph} size={20} />
            {m.label}
          </button>
        ))}
      </div>

      <button className="big-btn" onClick={go} type="button">
        <BowlIcon size={20} strokeWidth={2} />
        Eat now
        {selected.length > 0 && <span className="count-pill">{selected.length}</span>}
      </button>

      <button className="big-btn secondary together-btn" type="button" onClick={() => void together()} disabled={making}>
        <PersonIcon size={18} strokeWidth={2} />
        {making ? "Opening…" : "Eat together"}
      </button>
    </div>
  );
}
