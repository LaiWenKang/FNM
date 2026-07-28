// THE SCORE — the most valuable atom on the money screen, finally sized like it.
//
// A 72px arc with a 44px mono tabular number counting up inside it. Both the
// sweep and the odometer run for --dur-4 from the same 80ms delay, so they
// resolve on the SAME FRAME as Togo's needle settling onto the restaurant's
// bearing: three instruments, one gesture.
//
// CSS-only odometer (@property --n + counter-reset) — no rAF, no state, no
// effect, which is why this component is server-safe. `--n` is also declared
// statically as `var(--score)`, so where @property is unsupported the number is
// simply correct instead of animated.
//
// Semantic ramp: ≥85 --score-hot · 70–84 --score-warm · <70 --score-cool. A 61
// must not look as hot as a 92; before this, arc length was the only difference
// and at 44px it was unreadable.

import type { CSSProperties } from "react";

export function scoreTone(score: number): "hot" | "warm" | "cool" {
  return score >= 85 ? "hot" : score >= 70 ? "warm" : "cool";
}

export default function ScoreReadout({
  score,
  size = 72,
  gid,
  label = "Match",
}: {
  score: number;
  size?: number;
  /** Unique gradient id — readouts repeat per page. */
  gid: string;
  label?: string;
}) {
  const tone = scoreTone(score);
  return (
    <div
      className="score-readout"
      data-tone={tone}
      data-digits={String(score).length}
      style={{ "--score": score, "--sz": `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${label} score ${score} out of 100`}
    >
      <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--score-c-hi)" />
            <stop offset="1" stopColor="var(--score-c)" />
          </linearGradient>
        </defs>
        <circle className="score-track" cx="36" cy="36" r="32" fill="none" strokeWidth="4.5" />
        <circle
          className="score-arc"
          cx="36"
          cy="36"
          r="32"
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          pathLength={100}
          stroke={`url(#${gid})`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="score-num count" aria-hidden="true" />
      <span className="score-unit" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
