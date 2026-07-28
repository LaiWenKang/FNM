// The taste radar hexagon — the brand's data-viz identity. Pure presentational
// SVG (no hooks, server-safe). Reads the 6-dim flavor vector in DIMS order and
// plots it on a 4-ring hex grid with an ember-gradient glow polygon, mono cyan
// vertex values, and mono axis labels.
//
// Variants:
//   default    — full chart: grid, polygon, vertex dots, values, axis labels
//   decorative — polygon + grid only (watermark)
//   ghost      — dashed grid rings + spokes only (empty-palate illustration)
//
// Extensions:
//   compare — a second vector as a CYAN OUTLINE. Your palate in ember, the
//             dish's in cyan: wordless "why this fits", one polygon.
//   senses  — Togo's six whiskers running out along the six spokes, drawn to
//             each dimension's value in real DIMS order. With his head at the
//             hub, the chart stops being an abstract hexagon and becomes "what
//             Togo knows about you".
//   hub     — a slot at the exact centre (CX 150, CY 140) for that head and the
//             needle rotated to the dominant axis.
//
// The 60s spin is GONE: imperceptible, and it kept a compositing layer alive on
// a phone for zero visual return.

import type { ReactNode } from "react";
import { DIMS, FlavorVector } from "@/lib/flavor";

const AXES = ["SPICE", "SWEET", "TEXTURE", "CRISP", "BODY", "NOVELTY"];
const CX = 150;
const CY = 140;
const R = 110;
const GRID_RADII = [27.5, 55, 82.5, 110];

/** The hub's own coordinates, exported so callers can place things on it. */
export const RADAR_CX = CX;
export const RADAR_CY = CY;

/**
 * Vertex `i` of a vertex-up hexagon of radius `r`. 60° per spoke — the step the
 * whole brand geometry is built on (Togo's blaze apex is exactly 60°, so its
 * flanks land on two sector bisectors). Exported so Needle.tsx and the app icon
 * reuse this exact geometry rather than approximating it.
 */
export function pt(i: number, r: number, cx: number = CX, cy: number = CY): [number, number] {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function hexPath(r: number, cx: number = CX, cy: number = CY): string {
  return (
    Array.from({ length: 6 }, (_, i) => pt(i, r, cx, cy))
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ") + " Z"
  );
}

/** Spoke index of the strongest dimension — the axis the hub needle points down. */
export function dominantAxis(vector: FlavorVector): number {
  let best = 0;
  DIMS.forEach((d, i) => {
    if (vector[d] > vector[DIMS[best]]) best = i;
  });
  return best;
}

interface TasteRadarProps {
  vector?: FlavorVector;
  /** A second vector as a cyan outline — the dish, against your palate. */
  compare?: FlavorVector;
  /** Togo's whiskers along the six spokes, drawn to value. */
  senses?: FlavorVector;
  ghost?: boolean;
  decorative?: boolean;
  /** Rendered width in px. Omit to fill the container (max 300). */
  size?: number;
  /** Anything that belongs at the exact centre of the palate. */
  hub?: ReactNode;
  /** Unique gradient/filter id prefix — pass distinct ids if two radars share a page. */
  gid?: string;
  className?: string;
}

function polyOf(vector: FlavorVector): { verts: [number, number][]; poly: string } {
  const verts = DIMS.map((d, i) => pt(i, R * Math.max(0.05, vector[d]))) as [number, number][];
  return { verts, poly: verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") };
}

export default function TasteRadar({
  vector,
  compare,
  senses,
  ghost = false,
  decorative = false,
  size,
  hub,
  gid = "rg",
  className,
}: TasteRadarProps) {
  const chrome = decorative || ghost;
  const main = vector && !ghost ? polyOf(vector) : null;
  const alt = compare && !ghost ? polyOf(compare) : null;

  return (
    <svg
      viewBox="0 0 300 280"
      overflow="visible"
      width={size}
      height={size ? Math.round((size * 280) / 300) : undefined}
      className={`radar-svg${ghost ? " radar-ghost" : ""}${className ? ` ${className}` : ""}`}
      role={chrome ? undefined : "img"}
      aria-hidden={chrome ? true : undefined}
      aria-label={chrome ? undefined : "Taste profile radar chart"}
    >
      {main && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB03A" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FF4D2E" stopOpacity="0.55" />
          </linearGradient>
          <filter id={`${gid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      <g className="radar-grid" fill="none" strokeWidth="1">
        {GRID_RADII.map((r, gi) => (
          <path key={r} d={hexPath(r)} className={ghost && gi === 0 ? "radar-grid-inner" : undefined} />
        ))}
        {Array.from({ length: 6 }, (_, i) => {
          const [x, y] = pt(i, R);
          return <path key={`s${i}`} d={`M${CX} ${CY} L${x.toFixed(1)} ${y.toFixed(1)}`} />;
        })}
      </g>

      {main && (
        <>
          <polygon
            className="radar-poly"
            points={main.poly}
            fill={`url(#${gid})`}
            fillOpacity="0.35"
            filter={`url(#${gid}-glow)`}
          />
          <polygon
            className="radar-poly-edge"
            points={main.poly}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {main.verts.map(([x, y], i) => (
            <circle key={`d${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.5" fill="#FFB03A" />
          ))}
        </>
      )}

      {/* THE DISH, against you. Cyan outline only — the data voice never fills. */}
      {alt && (
        <polygon
          className="radar-compare"
          points={alt.poly}
          fill="none"
          stroke="var(--data)"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
      )}

      {/* HIS SENSES — six whiskers out along the six spokes, drawn to value. */}
      {senses && (
        <g className="radar-senses" fill="none" strokeLinecap="round" strokeWidth="2">
          {DIMS.map((d, i) => {
            const [x, y] = pt(i, Math.max(18, R * senses[d]));
            return (
              <path
                key={`w${i}`}
                className="radar-sense"
                style={{ ["--i" as string]: i }}
                d={`M${CX} ${CY} L${x.toFixed(1)} ${y.toFixed(1)}`}
              />
            );
          })}
        </g>
      )}

      {main &&
        !decorative &&
        DIMS.map((d, i) => {
          // +22 keeps the value clear of the polygon fill and its glow halo;
          // the 48px floor stops low-value labels crowding the center.
          const v = vector![d];
          const [lx, ly] = pt(i, Math.max(R * Math.max(0.05, v) + 22, 48));
          return (
            <text
              key={`v${i}`}
              x={lx.toFixed(1)}
              y={(ly + 3).toFixed(1)}
              textAnchor="middle"
              className="radar-value"
            >
              {Math.round(v * 100)}
            </text>
          );
        })}

      {!chrome &&
        AXES.map((label, i) => {
          const [x, y] = pt(i, 124);
          return (
            <text
              key={label}
              x={x.toFixed(1)}
              y={(y + 3).toFixed(1)}
              textAnchor="middle"
              className="radar-axis"
            >
              {label}
            </text>
          );
        })}

      {/* The origin of your palate. He is literally standing at the centre of it. */}
      {hub && (
        <g className="radar-hub" transform={`translate(${CX} ${CY})`}>
          {hub}
        </g>
      )}
    </svg>
  );
}
