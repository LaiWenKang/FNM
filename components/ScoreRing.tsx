"use client";

// Match-score ring — SVG stroke-dashoffset version (animates reliably on mount
// in Safari). The offset is set after a mounted flip so the arc draws in via
// the .ring-fill CSS transition.

import { useEffect, useState } from "react";

const C = 150.8; // 2πr for r=24

export default function ScoreRing({
  score,
  size = 56,
  gid,
}: {
  score: number;
  size?: number;
  /** Unique gradient id — rings repeat per page. */
  gid: string;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const offset = on ? C * (1 - score / 100) : C;

  return (
    <svg
      className="ring"
      viewBox="0 0 56 56"
      width={size}
      height={size}
      role="img"
      aria-label={`Match score ${score} out of 100`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB03A" />
          <stop offset="1" stopColor="#FF4D2E" />
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
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 28 28)"
      />
      <text className="ring-num" x="28" y="32.5" textAnchor="middle">
        {score}
      </text>
    </svg>
  );
}
