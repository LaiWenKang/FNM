// TOGO — the lead dog in harness.
//
// GEOMETRY REVISION 2. The first cut failed GATE A: a black silhouette at 20px
// read as a sitting cat — round skull, corner-mounted ear tufts, a curled tail.
// Every one of those is now excluded by construction, and the silhouette was
// re-authored against the 20px black test rather than against a description:
//
//   · TALL, CLOSE-SET EAR TRIANGLES rising clear of the skull, inner bases 17
//     units apart on the 120 grid, apexes at x 34.7 / 85.3. The V notch between
//     them is 32 units deep — 5px at a 20px render, and the single loudest
//     canine cue in the drawing.
//   · A WEDGE, NOT A CIRCLE. The outline is taller than it is wide (76 × 79) and
//     tapers the whole way down; there is not one circular arc in it.
//   · A SEPARATE MUZZLE LOBE. The ruff is widest at y 70 and the muzzle drops out
//     of it at less than half that width, so the bottom of the silhouette is a
//     snout rather than a chin.
//   · RUFF SCALLOPS CUT INTO the jaw outline — three per side, each bowing out
//     while the outline steps in, so the coat breaks the edge from inside.
//   · NO TAIL ANYWHERE, in any mood, in any variant.
//   · SIX SHORT VIBRISSAE leaving the muzzle, not long straight rays.
//
// Pure presentational: no hooks, no state, server-safe, every defs id
// gid-prefixed (components/TasteRadar.tsx convention). Six moods drive the
// drawing through `data-mood` and CSS alone — NOTHING is added to or removed
// from the DOM between moods, so React never re-renders him and Safari never
// re-rasterises him. The expression channel is the EARS (each hinging about its
// own base), never brows; there are no brows in this file.
//
// TWO GOVERNING LAWS, enforced here rather than in a style guide:
//   · THE BLAZE IS RIGID on head and bust — it never translates, rotates,
//     scales or morphs. Only the standalone needle rotates.
//   · THE TONGUE PATH IS AUTHORED INSIDE THE HOWL GROUP ONLY, so it can never
//     ship into another mood. Irises are clamped to ±3px in every mood, which
//     makes meme side-eye geometrically impossible.
//
// Everything is symmetric about x=60 and every coordinate is literal and final.

import type { CSSProperties } from "react";
import { DIMS, FlavorVector } from "@/lib/flavor";
import { NEEDLE_PATH } from "./Needle";

export type TogoMood = "harnessed" | "reading" | "locked" | "hedging" | "banked" | "howl";
export type TogoVariant = "needle" | "head" | "bust";

export interface TogoProps {
  /** Bound to real confidence, never to decoration. Default "harnessed". */
  mood?: TogoMood;
  /** Default "head". `needle` is the bare mark on his own grid. */
  variant?: TogoVariant;
  /** Rendered width in px. Drives detail degradation via data-size. Default 40. */
  size?: number;
  /** Degrees. Rotates the standalone needle only — the blaze never moves. */
  bearing?: number;
  /** Draws each whisker to its dimension's strength, in real DIMS order. */
  vector?: FlavorVector;
  /** Composable 6° head yaw. Not a seventh mood. */
  tilt?: boolean;
  /**
   * Bust only. Draws the tugline out to the frame edge. Default OFF: a line that
   * stops in empty space is worse than no line, so placements that have a real
   * target (the calibrate pill, the card stack) draw their own connector in the
   * DOM and terminate it ON that target.
   */
  tug?: boolean;
  /** defs id prefix. Also seeds this instance's idle desync. Default "tg". */
  gid?: string;
  className?: string;
  /** Supply only where he carries meaning alone; otherwise he is decorative. */
  label?: string;
}

const VB: Record<TogoVariant, string> = {
  needle: "0 0 48 48",
  head: "0 0 120 120",
  bust: "0 0 120 170",
};
const ASPECT: Record<TogoVariant, number> = { needle: 1, head: 1, bust: 170 / 120 };

/* ── L1 EAR — a TALL triangle, not a corner tuft. Base runs (25.6,49.4) →
   (51.5,41): 26 wide against a 36-unit rise, apex at x≈34.7 leaning ~8° out.
   Inner bases land at x=51.5 and x=68.5, a 17-UNIT GAP — close-set is the husky
   tell against a shepherd or a fox, and the deep V between the two is what the
   eye actually reads at 20px. ─────────────────────────────────────────────── */
const EAR =
  "M25.6 49.4 C23.4 38 25.6 23.4 29.8 13.2 C31.8 8.2 37.6 8 39.6 13.2 L51.5 41 C53.3 44.8 50.4 49.2 46.1 48.1 Z";
/* the same shape at 0.54 about its own centroid — light through thin skin, and
   the only warm pixel above the jaw */
const EAR_INNER =
  "M31 42.2 C29.8 36 31 28.1 33.2 22.6 C34.3 19.9 37.4 19.8 38.5 22.6 L45 37.6 C45.9 39.7 44.4 42.1 42 41.5 Z";

/* ── L2 HEAD — the wedge. Crown at y 39.4, widest 98 at y 70, RUFF SCALLOPS
   (three per side, y 70→100) cut INTO the outline, then a hard taper into a
   MUZZLE LOBE less than half the ruff's width, chin at y 115.4. Taller than
   wide, tapering the whole way: there is not one circle in it. ───────────── */
const HEAD =
  "M60 39.4 C64 37.6 66.6 36.6 68.5 36.2 C81 34.6 89.8 39.8 94.4 49.2 C97.4 55.4 98.4 62.4 98 69.8 C99.9 74.2 98.4 78.2 93.8 81 C95 85.8 93 89.2 88 91.2 C88.6 95.4 86 98.2 81 99.4 C79.6 100.6 78 101.2 76.6 101.6 C76.4 105.4 75.4 109 72.6 111.4 C69.6 114 65.2 115.2 60 115.4 C54.8 115.2 50.4 114 47.4 111.4 C44.6 109 43.6 105.4 43.4 101.6 C42 101.2 40.4 100.6 39 99.4 C34 98.2 31.4 95.4 32 91.2 C27 89.2 25 85.8 26.2 81 C21.6 78.2 20.1 74.2 22 69.8 C21.6 62.4 22.6 55.4 25.6 49.2 C30.2 39.8 39 34.6 51.5 36.2 C53.4 36.6 56 37.6 60 39.4 Z";

/* ── L4 MASK — one continuous band with a shallow V under the bridge, clipped to
   the head so its edges are the head's edges. NEVER two separate eye patches:
   two blotches read as a bandit, one band reads as equipment. ────────────── */
const MASK =
  "M12 24 L108 24 L108 74 C99 84.5 90 88 79 86.6 C70 85.4 64 82.6 60 80 C56 82.6 50 85.4 41 86.6 C30 88 21 84.5 12 74 Z";

/* ── L5 BLAZE — the needle, on the face. Apex (60,41); the flanks obey
   x = 60 ± 0.5774·(y−41), so the apex is exactly 60° — TasteRadar's own spoke
   step. The barb tips at (47.3,63) and (72.7,63) ARE the pale brow spots and
   now sit clear ABOVE the almonds; the pinch at y 68–83 is the bridge between
   the eyes; the flare below y 87 is the muzzle. One shape doing three
   anatomical jobs and reading as an arrow the whole time. ────────────────── */
const BLAZE =
  "M60 41 L72.7 63 C69.6 63.5 67.2 65 66.2 68.4 C65.4 71.4 65 74 65.2 78 C65.6 83.4 72.4 87.4 72.8 95 C73.2 103.6 68 110.6 60 111 C52 110.6 46.8 103.6 47.2 95 C47.6 87.4 54.4 83.4 54.8 78 C55 74 54.6 71.4 53.8 68.4 C52.8 65 50.4 63.5 47.3 63 Z";

/* ── L6 ALMOND — 18 wide × 12.6 tall on a 76-wide head, sitting at 51% of head
   height. Small and low reads adult; big and high reads toy. The outer corner is
   lifted 8° at placement — that single 8° is the whole difference between an
   alert working animal and a puppy. ─────────────────────────────────────── */
const ALMOND = "M-9 0 C-6.4 -5.6 -1 -7.2 4.6 -5.2 C7.6 -4 9 -2 9 -1 C9 1.4 5.8 4.8 .8 5.4 C-4.2 6 -7 3.4 -9 0 Z";
const EYE_X = 77;
const EYE_Y = 76;

/* ── L7 NOSE — husky black, a rounded trapezoid wider than tall, at the needle's
   foot. IT TAKES NO EMBER: a warm nose puts saturated pixels at the exact
   optical centre of the face and turns a guide into a pet. ───────────────── */
const NOSE =
  "M60 93 C64.2 93 68 94.8 68 97.5 C68 100.6 63.6 103.2 60 103.2 C56.4 103.2 52 100.6 52 97.5 C52 94.8 55.8 93 60 93 Z";

/* ── L9 WHISKERS — SIX SHORT VIBRISSAE leaving the muzzle, indexed to
   lib/flavor.ts DIMS order [heat, sweet, soupy, fried, rich, adventure]. With
   `vector` passed, DRAWN LENGTH = DIMENSION STRENGTH and the mascot becomes a
   data visualisation with zero extra art. ───────────────────────────────── */
const WHISKERS = [
  "M47 95 C41 92.6 36 90 31.6 86.4", // 0 heat
  "M46.4 99.4 C39.6 99 33.6 98 28.4 96.4", // 1 sweet
  "M47 103.6 C41.4 105.6 36.6 108 32.6 111", // 2 soupy
  "M73 95 C79 92.6 84 90 88.4 86.4", // 3 fried
  "M73.6 99.4 C80.4 99 86.4 98 91.6 96.4", // 4 rich
  "M73 103.6 C78.6 105.6 83.4 108 87.4 111", // 5 adventure
];
/** BANKED droop — the same six paths, +3 on every terminal y. Command parity. */
const WHISKERS_DROOP = [
  "M47 95 C41 92.6 36 90 31.6 89.4",
  "M46.4 99.4 C39.6 99 33.6 98 28.4 99.4",
  "M47 103.6 C41.4 105.6 36.6 108 32.6 114",
  "M73 95 C79 92.6 84 90 88.4 89.4",
  "M73.6 99.4 C80.4 99 86.4 98 91.6 99.4",
  "M73 103.6 C78.6 105.6 83.4 108 87.4 114",
];

/** L10 GUARD HAIRS — purely textural, three per side, mirrored, riding the ruff. */
const GUARD = [
  "M27 78 C25.4 81 25.6 84 27.6 86.4",
  "M30.6 89 C29 91.4 30 94 32.6 95.8",
  "M35.4 97.6 C37.4 99.6 40 101 43 101.8",
];

/* ══ BUST — viewBox 0 0 120 170, head group translated y−2. The body ends in a
   MASKED DISSOLVE rather than at the frame edge, so there is no hard horizontal
   crop on any screen at any size. ══════════════════════════════════════════ */

/** the winter collar the jaw sits into, drawn BEHIND the shoulders */
const NECK = "M46 100 C41 111 38 122 37 136 L83 136 C82 122 79 111 74 100 Z";
const SHOULDER = "M16 170 C16 142 34 130 60 130 C86 130 104 142 104 170 Z";
const BIB = "M60 131 C71 131 77.5 141.5 78.5 170 L41.5 170 C42.5 141.5 49 131 60 131 Z";

/** RUFF fringe — six scallops over the collar. Texture only, never data. */
const RUFF = [
  "M30 130 Q35 139.5 40 131",
  "M40 131 Q45 140.5 50 132",
  "M50 132 Q55 141 60 132.5",
  "M60 132.5 Q65 141 70 132",
  "M70 132 Q75 140.5 80 131",
  "M80 131 Q85 139.5 90 130",
];

/* HARNESS — a CLOSED YOKE, never a free-floating V or a single open arc: a
   padded collar band with real thickness running round the chest, two side
   straps down the flanks and a girth strap closing the loop underneath. The
   tugline visibly ORIGINATES from the ring at its foot. This is his only ember
   above the ground line, and it is an arrow to the CTA rather than a rival. */
const YOKE =
  "M34.4 131.4 C35.6 143 47 152.4 60 152.4 C73 152.4 84.4 143 85.6 131.4 L79.8 130.4 C79 140.4 70.6 147 60 147 C49.4 147 41 140.4 40.2 130.4 Z";
const YOKE_HI = "M36.4 131.6 C37.6 142 48 150.4 60 150.4";
const YOKE_SIDE = ["M36.4 144 C33.4 151 32.4 158 33 164", "M83.6 144 C86.6 151 87.6 158 87 164"];
const YOKE_GIRTH = "M33.6 159 C44 164 76 164 86.4 159";

/* THE KEEPER — a short strap wrapped across the yoke band, holding the ring.
   Hardware fixed to a strap reads as working gear; the same ember shape with
   nothing attaching it reads as a pendant, which is why the ring moved off
   centre. A symmetric band plus a centred hanging shape is a pet collar and an
   ID tag, no matter how the band itself is drawn. */
const KEEPER = "M67.4 143.8 L76.6 150.6";

/* TUGLINE — leaves the ring and runs OFF THE FRAME. All three states share an
   identical M-C command sequence so they morph. */
const TUG = "M76 150 C90 152.6 102 149 120 138";
const TUG_SLACK = "M76 150 C88 158.4 100 157.4 120 148";
const TUG_TAUT = "M76 150 C89 148 103 145.6 120 143";

/** Five ember ◆ sparks — the EXISTING badge glyph reused, never new confetti. */
const SPARKS: [number, number][] = [
  [-26, -18],
  [-13, -30],
  [0, -34],
  [13, -30],
  [26, -18],
];

/** Deterministic, server-safe per-instance desync. Two Togos must never blink in unison. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * One eye, authored once and placed twice. The 8° slant mirrors correctly
 * because the whole placement mirrors: outer corner up on BOTH sides.
 */
function Eye({ gid, side }: { gid: string; side: "l" | "r" }) {
  const p = `rotate(-8 ${EYE_X} ${EYE_Y}) translate(${EYE_X} ${EYE_Y})`;
  const place = side === "r" ? p : `translate(120,0) scale(-1,1) ${p}`;
  return (
    <g transform={place}>
      <g className="togo-eye">
        <g className="togo-eye-open">
          <path d={ALMOND} fill="var(--togo-blaze-1)" />
          <g clipPath={`url(#${gid}-eyeclip)`}>
            <g className="togo-iris">
              {/* the 1px stroke is a fake bloom that costs zero filter time */}
              <circle r="6" fill={`url(#${gid}-iris)`} stroke="rgba(83,217,255,.55)" strokeWidth="1" />
              <circle r="3" fill="#08111A" />
              {/* two ASYMMETRIC speculars — the cheapest single trick separating
                  premium vector from free-icon work */}
              <circle cx="2.6" cy="-2.8" r="2.2" fill="#fff" opacity=".95" />
              <circle className="togo-spec-2" cx="-2.1" cy="2.4" r="1" fill="#fff" opacity=".38" />
            </g>
          </g>
        </g>
        {/* HOWL only — the celebration is spent exactly once */}
        <path
          className="togo-eye-happy"
          d="M-7 1.6 Q0 -5.4 7 1.6"
          stroke="var(--togo-blaze-1)"
          strokeWidth="3.2"
          fill="none"
          strokeLinecap="round"
          opacity="0"
        />
        {/* ONE property drives blink and every half-lidded mood. Clipped to the
            almond because the un-clipped rect reaches into the blaze, and THE
            BLAZE IS RIGID: it must be pixel-identical in every mood. */}
        <g clipPath={`url(#${gid}-eyeclip)`}>
          <rect
            className="togo-lid"
            x="-10"
            y="-7.6"
            width="20"
            height="14"
            fill="var(--togo-mask)"
            transform="scale(1,0)"
            style={side === "r" ? ({ "--blink-d": "25ms" } as CSSProperties) : undefined}
          />
        </g>
      </g>
    </g>
  );
}

export default function Togo({
  mood = "harnessed",
  variant = "head",
  size = 40,
  bearing = 0,
  vector,
  tilt = false,
  tug = false,
  gid = "tg",
  className,
  label,
}: TogoProps) {
  const dataSize = size <= 32 ? "s" : size <= 72 ? "m" : "l";
  const isBust = variant === "bust";
  const shift = isBust ? "translate(0 -2)" : undefined;
  const values = vector ? DIMS.map((d) => vector[d]) : null;

  const root: CSSProperties = {
    "--seed": hash(gid) % 7,
    "--bearing": `${bearing}deg`,
  } as CSSProperties;

  return (
    <svg
      viewBox={VB[variant]}
      width={size}
      height={Math.round(size * ASPECT[variant])}
      overflow="visible"
      focusable="false"
      className={`togo togo-${variant}${className ? ` ${className}` : ""}`}
      data-mood={mood}
      data-size={dataSize}
      data-tilt={tilt ? "1" : undefined}
      style={root}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <defs>
        <linearGradient id={`${gid}-coat`} x1=".22" y1="0" x2=".8" y2="1">
          <stop offset="0" stopColor="var(--togo-coat-1)" />
          <stop offset=".52" stopColor="var(--togo-coat-2)" />
          <stop offset="1" stopColor="var(--togo-coat-3)" />
        </linearGradient>
        <linearGradient id={`${gid}-blaze`} x1=".5" y1="0" x2=".5" y2="1">
          <stop offset="0" stopColor="var(--togo-blaze-1)" />
          <stop offset=".62" stopColor="var(--togo-blaze-1)" />
          <stop offset="1" stopColor="var(--togo-blaze-2)" />
        </linearGradient>
        <radialGradient id={`${gid}-iris`} cx=".40" cy=".32" r=".78">
          <stop offset="0" stopColor="#DFF7FF" />
          <stop offset=".38" stopColor="var(--togo-iris)" />
          <stop offset=".68" stopColor="#53D9FF" />
          <stop offset="1" stopColor="#1B6C97" />
        </radialGradient>
        {/* The app's own light model: ember falls top-left exactly like
            --bg-glow-1, cyan bounces back bottom-right from --data. He is LIT BY
            the Ember Engine, not painted in it. */}
        <linearGradient id={`${gid}-rim`} x1=".10" y1="0" x2=".92" y2="1">
          <stop offset="0" stopColor="var(--togo-rim-1)" />
          <stop offset=".36" stopColor="var(--togo-rim-2)" />
          <stop offset=".60" stopColor="var(--togo-rim-3)" />
          <stop offset="1" stopColor="var(--togo-rim-4)" />
        </linearGradient>
        <linearGradient id={`${gid}-ear`} x1=".5" y1="1" x2=".5" y2="0">
          <stop offset="0" stopColor="var(--togo-ear-in)" />
          <stop offset="1" stopColor="rgba(247,244,236,.55)" />
        </linearGradient>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor="var(--togo-glow)" />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
        {isBust && (
          <>
            <linearGradient id={`${gid}-tug`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFB03A" />
              <stop offset="1" stopColor="#FF4D2E" />
            </linearGradient>
            {/* THE ORGANIC CROP. The body dissolves into the page instead of
                being sliced by the frame — there is no clipping rect anywhere. */}
            <linearGradient id={`${gid}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".9" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </linearGradient>
            <mask id={`${gid}-fademask`} maskUnits="userSpaceOnUse" x="-40" y="-40" width="200" height="220">
              <rect x="-40" y="-40" width="200" height="220" fill={`url(#${gid}-fade)`} />
            </mask>
          </>
        )}
        <clipPath id={`${gid}-clip`}>
          <path d={HEAD} />
        </clipPath>
        <clipPath id={`${gid}-eyeclip`}>
          <path d={ALMOND} />
        </clipPath>
        <clipPath id={`${gid}-blazeclip`}>
          <path d={BLAZE} />
        </clipPath>
      </defs>

      {variant === "needle" ? (
        <g className="togo-needle-rot">
          <path className="togo-needle" d={NEEDLE_PATH} />
        </g>
      ) : (
        <g mask={isBust ? `url(#${gid}-fademask)` : undefined}>
          {/* L0 UNDERGLOW — a plain gradient ellipse, deliberately NOT a blur
              filter, so nothing re-rasterises per frame on a phone already
              paying for backdrop-filter. */}
          <g transform={shift}>
            <ellipse className="togo-glow" cx="60" cy="84" rx="50" ry="40" fill={`url(#${gid}-glow)`} />
          </g>

          <g className="togo-body">
            {isBust && (
              <>
                <path d={NECK} fill={`url(#${gid}-coat)`} />
                <path d={SHOULDER} fill={`url(#${gid}-coat)`} />
                <path
                  d={SHOULDER}
                  fill="none"
                  stroke={`url(#${gid}-rim)`}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                <path d={BIB} fill={`url(#${gid}-blaze)`} />
                {/* THE HARNESS, as a closed yoke */}
                <g className="togo-harness">
                  <g fill="none" stroke="var(--togo-harness)" strokeWidth="4.4" strokeLinecap="round">
                    {YOKE_SIDE.map((d) => (
                      <path key={d} d={d} />
                    ))}
                    <path d={YOKE_GIRTH} />
                  </g>
                  <path d={YOKE} fill="var(--togo-harness)" />
                  <path
                    d={YOKE_HI}
                    fill="none"
                    stroke="rgba(255,255,255,.34)"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </g>
                <g className="togo-ruff" fill="none" stroke="var(--togo-ruff)" strokeWidth="2.4" strokeLinecap="round">
                  {RUFF.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </g>
              </>
            )}

            <g transform={shift}>
              {/* The yaw group holds the ears too: an -18° HOWL lift with the ears
                  left behind would tear the head apart. */}
              <g className="togo-skull">
                {/* L1 EARS — drawn FIRST so the head crops their bases into one
                    silhouette. Each hinges about its own base, which is the entire
                    reason the ear language reads as a real hinge. */}
                <g className="togo-ear togo-ear-l">
                  <path d={EAR} fill={`url(#${gid}-coat)`} />
                  <path d={EAR_INNER} fill={`url(#${gid}-ear)`} />
                </g>
                <g transform="scale(-1,1) translate(-120,0)">
                  <g className="togo-ear togo-ear-r">
                    <path d={EAR} fill={`url(#${gid}-coat)`} />
                    <path d={EAR_INNER} fill={`url(#${gid}-ear)`} />
                  </g>
                </g>
                {/* L2 */}
                <path d={HEAD} fill={`url(#${gid}-coat)`} />
                {/* L3 RIM LIGHT — the move that separates premium vector from
                    clipart. Same light source as --bg-glow-1, so he sits in the
                    same 3D space as the glass cards instead of on top of them. */}
                <path
                  className="togo-rim"
                  d={HEAD}
                  fill="none"
                  stroke={`url(#${gid}-rim)`}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                {/* L4 */}
                <path d={MASK} fill="var(--togo-mask)" clipPath={`url(#${gid}-clip)`} />
                {/* L5 */}
                <path className="togo-blaze" d={BLAZE} fill={`url(#${gid}-blaze)`} />
                <g clipPath={`url(#${gid}-blazeclip)`}>
                  {/* cool bounce — ties the cream to --data without a new colour */}
                  <rect x="42" y="90" width="36" height="24" fill="rgba(83,217,255,.14)" />
                  {/* READING: the scan runs UP the needle — the direction it
                      points. This is the frame where the character and the
                      engine fuse. */}
                  <rect className="togo-scan" x="52" y="0" width="16" height="26" fill="var(--data)" opacity="0" />
                </g>
                {/* L6 */}
                <Eye gid={gid} side="l" />
                <Eye gid={gid} side="r" />
                {/* L7 */}
                <path d={NOSE} fill="var(--togo-line)" />
                <circle cx="57" cy="95" r="1.6" fill="#fff" opacity=".5" />
                {/* L8 — two paths so the halves move independently */}
                <g fill="none" stroke="var(--togo-line)" strokeWidth="2.4" strokeLinecap="round">
                  <path className="togo-mouth togo-mouth-l" d="M60 103.7 Q54.8 108.4 49 105.6" />
                  <path className="togo-mouth togo-mouth-r" d="M60 103.7 Q65.2 108.4 71 105.6" />
                  {/* drawn 1px off level — that is the entire "unimpressed" read */}
                  <path className="togo-mouth togo-mouth-flat" d="M51.5 106.6 L68.5 105.6" opacity="0" />
                </g>

                {/* HOWL ONLY. The tongue exists nowhere else in this file. */}
                <g className="togo-howl">
                  <path
                    className="togo-howl-only togo-howl-mouth"
                    d="M53 103 C56 101.4 64 101.4 67 103 C67 110.4 64 114.2 60 114.2 C56 114.2 53 110.4 53 103 Z"
                    fill="#2A1620"
                    opacity="0"
                  />
                  <path
                    className="togo-howl-only togo-tongue"
                    d="M56.4 108.6 C57.8 107 62.2 107 63.6 108.6 C63.6 112 61.8 113.4 60 113.4 C58.2 113.4 56.4 112 56.4 108.6 Z"
                    fill="#C4566A"
                    opacity="0"
                  />
                </g>

                {/* L9 WHISKERS — rooted in the muzzle flare, so they travel with
                    the head rather than staying pinned to the frame. */}
                <g
                  className="togo-whiskers"
                  fill="none"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  stroke="var(--togo-whisker)"
                >
                  {WHISKERS.map((d, i) => (
                    <path
                      key={d}
                      className="togo-whisker"
                      data-w={i}
                      d={d}
                      pathLength={100}
                      strokeDasharray={values ? `${(values[i] * 100).toFixed(1)} 100` : undefined}
                      style={{ "--i": i } as CSSProperties}
                    />
                  ))}
                  {WHISKERS_DROOP.map((d, i) => (
                    <path
                      key={d}
                      className="togo-whisker togo-whisker-droop"
                      data-w={i}
                      d={d}
                      pathLength={100}
                      strokeDasharray={values ? `${(values[i] * 100).toFixed(1)} 100` : undefined}
                      opacity="0"
                      style={{ "--i": i } as CSSProperties}
                    />
                  ))}
                </g>

                {/* L10 GUARD HAIRS — purely textural */}
                <g
                  className="togo-guard"
                  fill="none"
                  stroke="rgba(235,235,245,.22)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                >
                  {GUARD.map((d) => (
                    <path key={d} d={d} />
                  ))}
                  <g transform="scale(-1,1) translate(-120,0)">
                    {GUARD.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </g>
                </g>
              </g>

              {/* SCALE ON A CIRCLE IS FREE; NEVER ANIMATE r. */}
              <g className="togo-sonar-g" fill="none" stroke="var(--data)" strokeWidth="2">
                {[0, 1, 2].map((i) => (
                  <circle
                    key={i}
                    className="togo-sonar"
                    cx="60"
                    cy="103"
                    r="6"
                    opacity="0"
                    style={{ "--i": i } as CSSProperties}
                  />
                ))}
              </g>

              {/* the existing ◆ badge glyph, reused — never new confetti */}
              <g className="togo-sparks">
                {SPARKS.map(([bx, by], i) => (
                  <rect
                    key={i}
                    className="togo-howl-only togo-spark"
                    x="58"
                    y="101"
                    width="4"
                    height="4"
                    fill="var(--accent)"
                    opacity="0"
                    style={{ "--bx": `${bx}px`, "--by": `${by}px`, "--i": i } as CSSProperties}
                  />
                ))}
              </g>
            </g>

            {isBust && (
              <>
                {/* the SINGLE BRIGHTEST PIXEL on the whole character, and the
                    point the tugline provably leaves from — mounted on the
                    flank through a keeper, not hung under the chin */}
                <path
                  d={KEEPER}
                  fill="none"
                  stroke="var(--togo-harness)"
                  strokeWidth="4.6"
                  strokeLinecap="round"
                />
                <rect
                  className="togo-ring"
                  x="68.4"
                  y="146.4"
                  width="7.2"
                  height="7.2"
                  rx="1"
                  transform="rotate(45 72 150)"
                  fill="var(--accent-hi)"
                />
                {tug && (
                  <g fill="none" strokeWidth="2.8" strokeLinecap="round" stroke={`url(#${gid}-tug)`}>
                    <path className="togo-tug togo-tug-rest" d={TUG} pathLength={100} />
                    <path className="togo-tug togo-tug-slack" d={TUG_SLACK} pathLength={100} opacity="0" />
                    <path className="togo-tug togo-tug-taut" d={TUG_TAUT} pathLength={100} opacity="0" />
                  </g>
                )}
              </>
            )}
          </g>
        </g>
      )}
    </svg>
  );
}
