// Match-score ring — the COMPACT readout, for the 44px alternative cards.
// The hero uses ScoreReadout.tsx; a 44px ring wants a different construction to
// a 72px one, so both exist.
//
// CSS-only draw: pathLength=100 plus a keyframe running to
// calc(100 - var(--score)), so there is no mounted-flip effect any more and the
// component is server-safe. Semantic ramp shared with ScoreReadout — a 61 never
// looks as hot as a 92.

import type { CSSProperties } from "react";
import { scoreTone } from "./ScoreReadout";

export default function ScoreRing({
  score,
  size = 44,
  gid,
}: {
  score: number;
  size?: number;
  /** Unique gradient id — rings repeat per page. */
  gid: string;
}) {
  return (
    <svg
      className="ring"
      data-tone={scoreTone(score)}
      style={{ "--score": score } as CSSProperties}
      viewBox="0 0 56 56"
      width={size}
      height={size}
      role="img"
      aria-label={`Match score ${score} out of 100`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--score-c-hi)" />
          <stop offset="1" stopColor="var(--score-c)" />
        </linearGradient>
      </defs>
      <circle className="ring-track" cx="28" cy="28" r="24" strokeWidth="5" fill="none" />
      <circle
        className="ring-fill"
        cx="28"
        cy="28"
        r="24"
        stroke={`url(#${gid})`}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        pathLength={100}
        transform="rotate(-90 28 28)"
      />
      <text className="ring-num" x="28" y="33" textAnchor="middle">
        {score}
      </text>
    </svg>
  );
}
