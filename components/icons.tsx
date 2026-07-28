// Shared stroke-SVG icon set — 24×24 grid, stroke="currentColor", no fills.
// Purely presentational; every icon inherits color from its parent.

import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function Svg({
  size = 24,
  strokeWidth = 1.8,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Bowl + steam — the Eat tab / eat-now glyph. */
export function BowlIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12a8 8 0 0 0 16 0z" />
      <path d="M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3" />
    </Svg>
  );
}

/** Hexagon-radar glyph — the Taste tab; matches the radar brand mark. */
export function RadarGlyphIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z" opacity="0.55" />
    </Svg>
  );
}

/** Person — the You tab. */
export function PersonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19c1.2-3.2 3.6-4.6 6.5-4.6s5.3 1.4 6.5 4.6" />
    </Svg>
  );
}

/** Walking figure — distance / range. */
export function WalkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="13.5" cy="4" r="2" />
      <path d="M13 7.5l-1.5 5-3 7.5" />
      <path d="M11.5 12.5l3 3 1 4.5" />
      <path d="M13 8.5l3.5 2" />
      <path d="M12.5 9.5l-3 2-.7 2.5" />
    </Svg>
  );
}

/** Cloud + rain — weather telemetry. */
export function CloudRainIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 15.5a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.4 3.4 0 0 0 7.4 15.5z" />
      <path d="M9 18l-.8 2.2M13.5 18l-.8 2.2" />
    </Svg>
  );
}

/** Crosshair target — calibrate / taste test. */
export function TargetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Svg>
  );
}

/** Price tag — budget. */
export function TagIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <path d="M7 7h.01" />
    </Svg>
  );
}

/** Shield + keyhole — data & privacy. */
export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M12 11.6V14" />
    </Svg>
  );
}

/** Small forward arrow — dish pointer. */
export function ArrowIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

/** Check — yes / confirm. */
export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l5 5L19 7" />
    </Svg>
  );
}

/** X — no / dismiss. */
export function XIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}
