// THE BEARING — Togo's separable monogram.
//
// Seven path commands on a 0 0 48 48 grid: a 60° arrowhead with two barbs on a
// shaft that pinches and flares, with a rounded foot. Anatomically it is a
// husky's blaze; geometrically it is a compass needle. The apex angle is exactly
// 60° — TasteRadar's own spoke step — so pointing it down any spoke lands its
// two flanks on that sector's bisectors and it covers exactly that dimension's
// territory. Needle-in-hexagon is the brand lockup.
//
// COLOUR LAW: as the BARE MARK it is flat INSTRUMENT ICE (#EDF3F7) — never the
// cream fur gradient, which belongs only to the blaze on the face. In light
// theme it gains a 1px --togo-blaze-edge outline, and the `ink` tone inverts it
// to a solid dark silhouette (only possible because it is a filled shape, not a
// knocked-out band).
//
// Pure presentational, no hooks, server-safe. This is the one mark the
// "Hide Togo" toggle never removes — it is brand, not voice.

import type { CSSProperties } from "react";
import { hexPath } from "./TasteRadar";

/** The canonical needle. Authored once here; Togo's `needle` variant imports it. */
export const NEEDLE_PATH =
  "M24 5 L35.6 25 C33.2 25.2 30.8 26.2 30.2 29.2 C29.4 34 28.6 38.6 27.8 42.2 C27.3 44.4 20.7 44.4 20.2 42.2 C19.4 38.6 18.6 34 17.8 29.2 C17.2 26.2 14.8 25.2 12.4 25 Z";

/**
 * The lockup hexagon — TasteRadar's exact vertex-up geometry at R=21 about the
 * needle's balance point, so the apex reaches spoke 0 and the foot sits at ~82%
 * of R toward the bottom vertex.
 */
export const NEEDLE_HEX = hexPath(21, 24, 25.5);

export type NeedleTone = "ice" | "ink" | "data" | "unsigned";

export interface NeedleProps {
  /** Rendered edge length in px. Default 16. */
  size?: number;
  /** Degrees. Rotates about the needle's balance point (24, 27), not its centroid. */
  bearing?: number;
  /**
   * `ice` — instrument ice on dark (default) · `ink` — inverted for light
   * surfaces · `data` — cyan, for badges and telemetry · `unsigned` — grey at
   * 40%, the withheld signature on the safer bet.
   */
  tone?: NeedleTone;
  /** Nest the mark inside the shipped hexagon geometry — the brand lockup. */
  hex?: boolean;
  /**
   * A hairline compass ring with an N tick at north. Without it a 14px arrow
   * beside a distance readout reads as a stray mouse cursor; with it, it reads
   * as an instrument. Use wherever the mark carries a TRUE bearing.
   */
  ring?: boolean;
  /** Continuous rotation, for the "resolving" indicator. */
  spin?: boolean;
  /** defs/element id prefix, TasteRadar convention. */
  gid?: string;
  className?: string;
  /** Supply only when the mark carries meaning on its own; otherwise decorative. */
  label?: string;
}

export default function Needle({
  size = 16,
  bearing = 0,
  tone = "ice",
  hex = false,
  ring = false,
  spin = false,
  gid = "nd",
  className,
  label,
}: NeedleProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      overflow="visible"
      focusable="false"
      className={`togo-mark${hex ? " togo-mark-hex" : ""}${ring ? " togo-mark-ring" : ""}${
        className ? ` ${className}` : ""
      }`}
      data-tone={tone}
      style={{ "--bearing": `${bearing}deg` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      {hex && <path className="togo-needle-hex" d={NEEDLE_HEX} fill="none" />}
      {ring && (
        <g className="togo-needle-ring" fill="none">
          <circle cx="24" cy="25" r="21" />
          <path d="M24 2.6v5.4" />
        </g>
      )}
      <g className={`togo-needle-rot${spin ? " togo-needle-spin" : ""}`}>
        <path id={`${gid}-needle`} className="togo-needle" d={NEEDLE_PATH} />
      </g>
    </svg>
  );
}
