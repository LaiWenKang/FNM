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
//   · NO TAIL ANYWHERE, in any mood, in any variant.
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

/* ═══ GEOMETRY REVISION 3 — THE BABY SCHEMA ═══════════════════════════════
   Revision 2 passed the 20px silhouette test and failed the only test that
   decides whether anyone wants him on their home screen: it was drawn as an
   adult working animal on purpose. Its own margins admitted it — "small and low
   reads adult", "the outer corner is lifted 8°... the whole difference between
   an alert working animal and a puppy", "there is not one circle in it". Every
   one of those calls is inverted below, because the mascot's job is to be
   liked, and neoteny is the mechanism:

     PROPORTION   Cranium 82 wide against 75 tall — WIDER than tall, and round.
                  Rev 2 was 76 × 79, tapering the whole way.
     MUZZLE       Snub: 30 wide, 22 deep, rounded off. Rev 2 ran a long wedge
                  to a chin at y 115.4; this ends at 108.5.
     EYES         22 units across on an 82-wide head, at 49% of head height —
                  BIG and HIGH. Rev 2: 18 × 12.6, at 57%, slanted up 8°.
                  The slant is gone; a lifted outer corner is a glare.
     NOSE         Bigger relative to the muzzle, and higher — an infant's
                  features crowd the lower half of the face.
     DROPPED      Whiskers and guard hairs. Both are realist texture, and both
                  fought the flat-vector read at every size under 64px.

   The husky is still unmistakably a husky: the tall close-set ears, the dark
   cap, the white cheeks, the blaze up the forehead and the ice-blue eyes are
   the species tells, and all five survive. ─────────────────────────────── */

/* ── L1 EAR — still tall and close-set (that is the husky tell against a fox or
   a shepherd, and the deep V between the pair is what the eye reads at 20px),
   but the apex is now a ROUNDED CAP rather than a point. A sharp tip on a round
   skull reads as a warning triangle. ─────────────────────────────────────── */
const EAR =
  "M27 52 C22 39 24.5 24 29.2 14.5 C31.4 10 36.4 10.4 38.4 15 L53.5 43 C55.6 47.4 52.4 52.6 47.6 51.2 Z";
/* the same shape inset — light through thin skin, and the only warm pixel
   above the jaw */
const EAR_INNER =
  "M32.4 46.6 C29.4 37.6 31.2 28 34 22 C35.3 19.2 38.2 19.5 39.4 22.2 L48.4 40 C49.6 42.7 47.7 45.8 44.9 45 Z";

/* ── L2 HEAD — a round cranium with a snub muzzle dropped out of it. Crown at
   y 33, widest 82 at y 62, cheeks bulging OUT rather than tapering in, then a
   short step into a 30-wide muzzle lobe and a chin at y 108.5. The cheek arcs
   are the circles rev 2 was written to exclude; they are the whole point. ─ */
const HEAD =
  "M60 33 C78 33 96 42 101 60 C105 74 100 84 88 89 C82 91.5 78 92 75 93 C76.5 99 73 105 66 107.5 C64 108.2 62 108.5 60 108.5 C58 108.5 56 108.2 54 107.5 C47 105 43.5 99 45 93 C42 92 38 91.5 32 89 C20 84 15 74 19 60 C24 42 42 33 60 33 Z";

/* ── L4 MASK — one continuous band with a V under the bridge, clipped to the
   head so its edges are the head's edges. NEVER two separate eye patches: two
   blotches read as a bandit, one band reads as a mask. It brackets the eyes at
   their widest and then RELEASES: taken any lower it covered three quarters of
   the head and the whole animal collapsed into one black blob with a white
   wedge in it. The three tones — dark cap, slate cheek, cream muzzle — are what
   make him read as a husky rather than as a panda. ──────────────────────── */
const MASK =
  "M8 20 L112 20 L112 71 C104 81.5 94 85.5 82 84 C72 82.8 65 79.4 60 75.8 C55 79.4 48 82.8 38 84 C26 85.5 16 81.5 8 71 Z";

/* ── L5 BLAZE — the needle, on the face. Apex (60,36); the flanks still obey
   x = 60 ± 0.5774·(y−36), so the apex is exactly 60° — TasteRadar's own spoke
   step, and the one law carried over from rev 2 untouched. The barbs at y 59.4
   are the pale brow spots, the pinch at y 65–80 is the bridge between the eyes,
   and the flare below y 84 IS the muzzle. One shape doing three anatomical jobs
   and reading as an arrow the whole time. ───────────────────────────────── */
const BLAZE =
  "M60 36 L73.5 59.4 C70 60 67.6 61.8 66.6 65.2 C65.8 68 65.4 71 65.6 75 C66 80.5 73.4 84.5 74.8 92 C76.4 100.4 70 107.6 60 108 C50 107.6 43.6 100.4 45.2 92 C46.6 84.5 54 80.5 54.4 75 C54.6 71 54.2 68 53.4 65.2 C52.4 61.8 50 60 46.5 59.4 Z";

/* ── L6 EYE — 16.4 × 17.6 on an 82-wide head. ROUNDNESS is what reads cute,
   not raw area: rev 2's 18 × 12.6 was wide and squinting, and a first pass at
   21 × 22.8 put 63% of the face width inside two eyeballs and went straight
   past cute into uncanny. Taller than wide, placed LEVEL — rev 2 rotated the
   pair -8° so the outer corners lifted, which is the difference between a look
   and a glare. ──────────────────────────────────────────────────────────── */
const EYE =
  "M0 -8.8 C4.6 -8.8 8.2 -4.9 8.2 0 C8.2 4.9 4.6 8.8 0 8.8 C-4.6 8.8 -8.2 4.9 -8.2 0 C-8.2 -4.9 -4.6 -8.8 0 -8.8 Z";
const EYE_X = 74.6;
const EYE_Y = 70.5;

/* ── L7 NOSE — husky black, a rounded heart wider than tall, sitting HIGH on the
   snub muzzle. IT TAKES NO EMBER: a warm nose puts saturated pixels at the exact
   optical centre of the face and turns a guide into a plush toy. ─────────── */
const NOSE =
  "M60 88.4 C64.6 88.4 68.4 90.5 68.4 93.5 C68.4 96.9 64.2 99.8 60 99.8 C55.8 99.8 51.6 96.9 51.6 93.5 C51.6 90.5 55.4 88.4 60 88.4 Z";

/* ══ BUST — viewBox 0 0 120 170, head group translated y−2. The body ends in a
   MASKED DISSOLVE rather than at the frame edge, so there is no hard horizontal
   crop on any screen at any size. ══════════════════════════════════════════ */

/** the winter collar the jaw sits into, drawn BEHIND the shoulders */
const NECK = "M46 100 C41 111 38 122 37 136 L83 136 C82 122 79 111 74 100 Z";
const SHOULDER = "M16 170 C16 142 34 130 60 130 C86 130 104 142 104 170 Z";
const BIB = "M60 131 C71 131 77.5 141.5 78.5 170 L41.5 170 C42.5 141.5 49 131 60 131 Z";

/* NO RUFF. Six scallops ran across the top of the chest as texture; against
   the round head and the flat fills of revision 3 they stopped reading as fur
   and started reading as a lace collar. Same verdict as the whiskers: realist
   detail that fights a flat drawing loses. */

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
 * One eye, authored once and placed twice. Placed LEVEL: rev 2 rotated the pair
 * -8° so the outer corners lifted, which is the difference between a look and a
 * glare and was costing him every ounce of warmth he had.
 */
function Eye({ gid, side }: { gid: string; side: "l" | "r" }) {
  const p = `translate(${EYE_X} ${EYE_Y})`;
  const place = side === "r" ? p : `translate(120,0) scale(-1,1) ${p}`;
  return (
    <g transform={place}>
      <g className="togo-eye">
        <g className="togo-eye-open">
          <path d={EYE} fill="var(--togo-blaze-1)" />
          <g clipPath={`url(#${gid}-eyeclip)`}>
            <g className="togo-iris">
              {/* the 1px stroke is a fake bloom that costs zero filter time */}
              <circle r="7.7" fill={`url(#${gid}-iris)`} stroke="rgba(83,217,255,.55)" strokeWidth=".9" />
              <circle r="3.5" fill="#08111A" />
              {/* two ASYMMETRIC speculars — the cheapest single trick separating
                  premium vector from free-icon work, and scaled WITH the iris:
                  a big eye with a small catchlight reads as glass, not as life.
                  THE IRIS FILLS 94% OF THE EYE. Leave more cream than that
                  and it reads as a thick sclera ring — a cartoon eye wants a
                  RIM, not a white of the eye. */}
              <circle cx="2.8" cy="-3.1" r="2.5" fill="#fff" opacity=".95" />
              <circle className="togo-spec-2" cx="-2.4" cy="2.8" r="1.2" fill="#fff" opacity=".42" />
            </g>
          </g>
        </g>
        {/* HOWL only — the celebration is spent exactly once */}
        <path
          className="togo-eye-happy"
          d="M-6.6 1.9 Q0 -5.6 6.6 1.9"
          stroke="var(--togo-blaze-1)"
          strokeWidth="3.4"
          fill="none"
          strokeLinecap="round"
          opacity="0"
        />
        {/* ONE property drives blink and every half-lidded mood. Clipped to the
            eye because the un-clipped rect reaches into the blaze, and THE
            BLAZE IS RIGID: it must be pixel-identical in every mood. */}
        <g clipPath={`url(#${gid}-eyeclip)`}>
          <rect
            className="togo-lid"
            x="-9.4"
            y="-9.8"
            width="18.8"
            height="19"
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
  tilt = false,
  tug = false,
  gid = "tg",
  className,
  label,
}: TogoProps) {
  const dataSize = size <= 32 ? "s" : size <= 72 ? "m" : "l";
  const isBust = variant === "bust";
  const shift = isBust ? "translate(0 10)" : undefined;

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
        <linearGradient id={`${gid}-cap`} x1=".18" y1="0" x2=".82" y2="1">
          <stop offset="0" stopColor="var(--togo-mask-1)" />
          <stop offset=".62" stopColor="var(--togo-mask)" />
          <stop offset="1" stopColor="var(--togo-mask-2)" />
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
        {/* Four stops, not two, and the transparent one sits at .55 rather
            than .60 — at .60 the ember ran out mid-crown and terminated in a
            visible hard end, which read as a stray orange hair across the top
            of his head rather than as a light. */}
        <linearGradient id={`${gid}-rim`} x1=".10" y1="0" x2=".92" y2="1">
          <stop offset="0" stopColor="var(--togo-rim-1)" />
          <stop offset=".30" stopColor="var(--togo-rim-2)" />
          <stop offset=".55" stopColor="var(--togo-rim-3)" />
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
          <path d={EYE} />
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
                {/* Lit, not painted: a flat fill here made the whole cranium one
                    dead black plate and cost the head its roundness. */}
                <path d={MASK} fill={`url(#${gid}-cap)`} clipPath={`url(#${gid}-clip)`} />
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
                <circle cx="56.6" cy="91" r="1.9" fill="#fff" opacity=".5" />
                {/* L8 MOUTH — two paths so the halves move independently. Both
                    now turn UP at the far end: rev 2's halves ran level out of
                    the corner, which is a muzzle line rather than a smile. */}
                <g fill="none" stroke="var(--togo-line)" strokeWidth="2.1" strokeLinecap="round">
                  <path className="togo-mouth togo-mouth-l" d="M60 99.4 Q56.2 104 52.2 101.4" />
                  <path className="togo-mouth togo-mouth-r" d="M60 99.4 Q63.8 104 67.8 101.4" />
                  {/* drawn 1px off level — that is the entire "unimpressed" read */}
                  <path className="togo-mouth togo-mouth-flat" d="M53.4 102.2 L66.6 101.4" opacity="0" />
                </g>

                {/* HOWL ONLY. The tongue exists nowhere else in this file. */}
                <g className="togo-howl">
                  <path
                    className="togo-howl-only togo-howl-mouth"
                    d="M52.6 100.2 C55.6 98.6 64.4 98.6 67.4 100.2 C67.4 107.6 64 111.4 60 111.4 C56 111.4 52.6 107.6 52.6 100.2 Z"
                    fill="#2A1620"
                    opacity="0"
                  />
                  <path
                    className="togo-howl-only togo-tongue"
                    d="M56 105.6 C57.4 104 62.6 104 64 105.6 C64 109.4 62 110.8 60 110.8 C58 110.8 56 109.4 56 105.6 Z"
                    fill="#E8798D"
                    opacity="0"
                  />
                </g>

                {/* NO BLUSH. It is the standard cute lever and it was tried
                    here: on a DARK-coated animal a warm cheek patch has no pale
                    ground to tint, so at every opacity that was visible at all
                    it read as a bruise. Cuteness on this face comes from
                    proportion, not from makeup. */}
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
