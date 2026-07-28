// STREETMAP — a 130px vector minimap from the lat/lng already sitting in
// seed.ts. No tiles, no API key, no raster, no external request.
//
// Two jobs. The obvious one is that a food card with a map on it feels like a
// product. The structural one is that this is HIGH-FREQUENCY CONTENT: a
// backdrop-filter over three blurred radials produces the same blurred radial
// at full iOS snapshot cost, which is why the glass has never read as glass.
// Put a street grid under it and the blur finally has something to refract.
//
// The grid is jittered deterministically off the destination id, so every
// restaurant's map looks different and no restaurant's map ever changes between
// renders. Pure presentational, server-safe.

const W = 300;
const H = 130;

/** Cheap deterministic hash — the same id always yields the same streets. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000) / 1000;
  };
}

export interface StreetMapProps {
  origin: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  destId: string;
  walkMinutes: number;
  className?: string;
}

export default function StreetMap({ origin, dest, destId, walkMinutes, className }: StreetMapProps) {
  const r = rng(hash(destId));

  // Project the pair into the frame with a margin, keeping the real bearing:
  // the line on the map points the same way the needle beside the distance does.
  const dLat = dest.lat - origin.lat;
  const dLng = (dest.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180);
  const span = Math.max(Math.abs(dLat), Math.abs(dLng), 1e-5) * 1.9;
  const ox = W / 2 - (dLng / span) * (W * 0.3);
  const oy = H / 2 + (dLat / span) * (H * 0.3);
  const dx = W / 2 + (dLng / span) * (W * 0.3);
  const dy = H / 2 - (dLat / span) * (H * 0.3);

  // An L-shaped route, because nobody walks a diagonal through a city block.
  const bend = Math.abs(dx - ox) > Math.abs(dy - oy) ? `${dx} ${oy}` : `${ox} ${dy}`;
  const path = `M${ox.toFixed(1)} ${oy.toFixed(1)} L${bend} L${dx.toFixed(1)} ${dy.toFixed(1)}`;

  // Per-element opacity used to run 0.03-0.14, which multiplied against an
  // already-transparent ink and left the module reading as an empty box on the
  // light ground. Absolute strength now lives in --map-grid / --map-grid-hi,
  // which is themed; these values only vary the streets against each other.
  const hLines = Array.from({ length: 6 }, (_, i) => ({
    y: 10 + i * 22 + Math.round(r() * 9),
    o: 0.55 + r() * 0.45,
  }));
  const vLines = Array.from({ length: 5 }, (_, i) => ({
    x: 20 + i * 58 + Math.round(r() * 22),
    o: 0.55 + r() * 0.45,
  }));
  const blocks = Array.from({ length: 5 }, () => ({
    x: Math.round(r() * (W - 60)),
    y: Math.round(r() * (H - 42)),
    w: 26 + Math.round(r() * 34),
    h: 16 + Math.round(r() * 22),
    o: 0.45 + r() * 0.35,
  }));

  return (
    <div className={`minimap${className ? ` ${className}` : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" preserveAspectRatio="none">
        <g className="map-blocks">
          {blocks.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="3" opacity={b.o.toFixed(3)} />
          ))}
        </g>
        <g className="map-grid" strokeWidth="1">
          {hLines.map((l) => (
            <line key={`h${l.y}`} x1="0" y1={l.y} x2={W} y2={l.y} opacity={l.o.toFixed(3)} />
          ))}
          {vLines.map((l) => (
            <line key={`v${l.x}`} x1={l.x} y1="0" x2={l.x} y2={H} opacity={l.o.toFixed(3)} />
          ))}
        </g>

        {/* the walk, drawn in over --dur-5 — same technique as the score ring */}
        <path className="map-route" d={path} fill="none" pathLength={100} strokeLinecap="round" strokeLinejoin="round" />

        <g className="map-origin" transform={`translate(${ox.toFixed(1)} ${oy.toFixed(1)})`}>
          <circle className="map-origin-pulse" r="5" />
          <circle r="3.4" />
        </g>
        <g className="map-dest" transform={`translate(${dx.toFixed(1)} ${dy.toFixed(1)})`}>
          <path d="M0 2 L-5.4 -6.4 A6.4 6.4 0 1 1 5.4 -6.4 Z" />
          <circle cx="0" cy="-8" r="2.4" className="map-dest-eye" />
        </g>
      </svg>
      <span className="map-scale">{walkMinutes <= 45 ? `${walkMinutes} min on foot` : "Take a ride"}</span>
    </div>
  );
}
