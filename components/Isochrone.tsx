// ISOCHRONE — the walk, as an arc instead of as a word.
//
// A 28px ring whose sweep is walkMinutes/15: a full circle is a quarter-hour on
// foot, which is roughly the ceiling anyone in the CBD will accept at lunch.
// Replaces "2 MIN WALK" set at 17/700 — the bare number was louder than the
// match score it sat beneath.
//
// Server-safe. The sweep draws with the same pathLength=100 + dashoffset
// technique as the score ring and the minimap walk path, so every data graphic
// in the app animates in one vocabulary.

import type { CSSProperties } from "react";

export default function Isochrone({ walkMinutes, size = 28 }: { walkMinutes: number; size?: number }) {
  const pct = Math.max(6, Math.min(100, Math.round((walkMinutes / 15) * 100)));
  return (
    <svg
      className="isochrone"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      style={{ "--sweep": pct } as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <circle className="iso-track" cx="14" cy="14" r="10.5" fill="none" strokeWidth="3.4" />
      <circle
        className="iso-arc"
        cx="14"
        cy="14"
        r="10.5"
        fill="none"
        strokeWidth="3.4"
        strokeLinecap="round"
        pathLength={100}
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}
