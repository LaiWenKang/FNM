// The taste radar hexagon — the brand's data-viz identity. Pure presentational
// SVG (no hooks, server-safe). Reads the 6-dim flavor vector in DIMS order and
// plots it on a 4-ring hex grid with an ember-gradient glow polygon, mono cyan
// vertex values, and mono axis labels.
//
// Variants:
//   default    — full chart: grid, polygon, vertex dots, values, axis labels
//   decorative — polygon + grid only (home-hero watermark)
//   ghost      — dashed grid rings + spokes only (empty-palate illustration)

import { DIMS, FlavorVector } from "@/lib/flavor";

const AXES = ["SPICE", "SWEET", "TEXTURE", "CRISP", "BODY", "NOVELTY"];
const CX = 150;
const CY = 140;
const R = 110;
const GRID_RADII = [27.5, 55, 82.5, 110];

function pt(i: number, r: number): [number, number] {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function hexPath(r: number): string {
  return (
    Array.from({ length: 6 }, (_, i) => pt(i, r))
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ") + " Z"
  );
}

interface TasteRadarProps {
  vector?: FlavorVector;
  ghost?: boolean;
  decorative?: boolean;
  /** Unique gradient/filter id prefix — pass distinct ids if two radars share a page. */
  gid?: string;
  className?: string;
}

export default function TasteRadar({
  vector,
  ghost = false,
  decorative = false,
  gid = "rg",
  className,
}: TasteRadarProps) {
  const values = vector ? DIMS.map((d) => vector[d]) : [];
  const verts = values.map((v, i) => pt(i, R * Math.max(0.05, v)));
  const poly = verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const chrome = decorative || ghost;

  return (
    <svg
      viewBox="0 0 300 280"
      overflow="visible"
      className={`radar-svg${ghost ? " radar-ghost" : ""}${className ? ` ${className}` : ""}`}
      role={chrome ? undefined : "img"}
      aria-hidden={chrome ? true : undefined}
      aria-label={chrome ? undefined : "Taste profile radar chart"}
    >
      {vector && !ghost && (
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

      {vector && !ghost && (
        <>
          <polygon
            points={poly}
            fill={`url(#${gid})`}
            fillOpacity="0.35"
            filter={`url(#${gid}-glow)`}
          />
          <polygon
            points={poly}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {verts.map(([x, y], i) => (
            <circle key={`d${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.5" fill="#FFB03A" />
          ))}
          {!decorative &&
            values.map((v, i) => {
              // +22 keeps the value clear of the polygon fill and its glow halo;
              // the 48px floor stops low-value labels crowding the center.
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
        </>
      )}

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
    </svg>
  );
}
