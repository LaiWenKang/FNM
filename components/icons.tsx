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

/** Map pin — the plan bar's location control. */
export function PinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  );
}

/** Clock — the plan bar's time control. */
export function ClockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </Svg>
  );
}

/** Crosshair with pulse — "use my current location". */
export function LocateIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle cx="12" cy="12" r="7.5" opacity="0.45" />
    </Svg>
  );
}

/** Umbrella — the COVERED WALK badge, from the seed's `sheltered` flag. */
export function UmbrellaIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12a9 9 0 0 1 18 0z" />
      <path d="M12 12v6.5a2.5 2.5 0 0 1-5 0" />
    </Svg>
  );
}

/** Thermometer — the tonight strip's temperature slot. */
export function ThermoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 13.5V5a2 2 0 1 0-4 0v8.5a4 4 0 1 0 4 0z" />
      <path d="M12 9v5" />
    </Svg>
  );
}

/** Storefront — the "spots indexed" / open-now counter. */
export function StoreIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M3.4 9l1.4-4.4A1 1 0 0 1 5.8 4h12.4a1 1 0 0 1 1 .6L20.6 9" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  );
}

/** Sliders — the taste / calibration module head. */
export function SlidersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </Svg>
  );
}

/** Eye with a slash — the "hide Togo" control. */
export function EyeOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15.6 15.6 0 0 1-3 3.5M6.4 8.2A15.9 15.9 0 0 0 3 12s4 6 9 6a9.4 9.4 0 0 0 3.6-.7" />
      <path d="M10 10a2.8 2.8 0 0 0 4 4" />
      <path d="M4 4l16 16" />
    </Svg>
  );
}

/** Refresh — the re-roll / try-again control. */
export function RefreshIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v5h-5" />
    </Svg>
  );
}

/** Google "G" — brand mark for the sign-in button (multi-color, no stroke). */
export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.5l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.7 5.2-.1.3C8 40.6 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.8-5.3-.2.1A21.9 21.9 0 0 0 2 24c0 3.5.9 6.9 2.5 9.9l7-5.5z" />
      <path fill="#EA4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 15.4 2 8 7.4 4.5 14.1l7 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
    </svg>
  );
}
