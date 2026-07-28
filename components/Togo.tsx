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

/* ═══ GEOMETRY REVISION 4 — THE PALE FACE ═════════════════════════════════
   Revisions 2 and 3 both drew a DARK face with a white blaze down it. That is
   anatomically correct for a husky and it was the whole problem: a dark face
   with pale eye-holes reads as a MASK — bandit, raccoon, something hiding —
   no matter how round the skull is or how big the eyes get. Rev 3 fixed the
   proportions and kept the value structure, so it stayed unfriendly.

   Every cute husky drawing inverts it: a PALE face with a dark cap sitting on
   top like a hood. That single change does more than every proportion tweak in
   rev 3 combined, and it is what makes the two things below finally work:

     BLUSH        Tried in rev 3 and cut, because on a dark coat a warm cheek
                  patch has no pale ground to tint and read as a bruise. On a
                  cream face it reads as a cheek, which is what it always was.
     SOLID EYES   Two dark ovals with one catchlight each. Against a dark face
                  they would vanish, which is why rev 2 and 3 needed a big cyan
                  iris ringed in cream to punch through — and a bright ring on a
                  dark ground is exactly what made them read as goggles.

   ONE LAW SURVIVES ALL FOUR REVISIONS: the blaze apex is 60°, TasteRadar's own
   spoke step, so the mascot and the instruments are provably one drawing.

   The husky tells all survive: tall close-set ears, dark cap, pale face, the
   blaze splitting the cap, pink inner ears. ────────────────────────────── */

/* ── L1 EAR — a rounded triangle, tall and close-set. Tall is the husky tell
   against a fox; close-set is the tell against a shepherd; and the V notch
   between the pair is the loudest canine cue at 20px. ──────────────────── */
const EAR = "M30 44 C26 32 29 20 34 15 C38 11 43 13 45 19 L51 38 C52.6 42.6 49 47 44.6 45.4 Z";
/* the same shape inset — pink, and the only warm note above the cheeks */
const EAR_INNER = "M34.5 39 C32 31 33.5 23.5 36.5 20.5 C38.8 18.2 41.5 19.4 42.7 22.9 L46.3 34.3 C47.2 36.9 45.2 39.4 42.7 38.5 Z";

/* ── L2 HEAD — ONE CIRCLE, r 38 about (60,66). Rev 3 hung a separate snub
   muzzle lobe off a round cranium; on a pale face that lobe has no value change
   to define it, so it stopped being a muzzle and became a bump in the outline.
   The nose and mouth carry the muzzle on their own now. ─────────────────── */
const HEAD =
  "M60 28 C81 28 98 45 98 66 C98 87 81 104 60 104 C39 104 22 87 22 66 C22 45 39 28 60 28 Z";

/* ── L4 CAP — the dark hood, and the ONLY dark mass on the face. It follows the
   head's own arc across the top, then falls to the cheeks either side of a
   central dip. IT RELEASES ABOVE THE EYES — the first cut of this revision let
   the lower edge fall to y 68 and it cut across the top of both eyes, which
   turned every neutral mood into a scowl. The clearance is 4 units and it is
   the difference between friendly and furious. It still comes right down at
   the TEMPLES, because a cap that only crosses the crown reads as a fringe
   rather than as a hood. ──────────────────────────────────────────────── */
const CAP =
  "M22.1 64 A38 38 0 0 1 97.9 64 C94 64 86 60 74 54 C68 50.4 64 48 60 48 C56 48 52 50.4 46 54 C34 60 26 64 22.1 64 Z";

/* ── L5 BLAZE — the needle, splitting the cap. Apex (60,30); the flanks obey
   x = 60 ± 0.5774·(y−30), so the apex is EXACTLY 60°, the one law carried
   unbroken since revision 2. It seats into the cap's own notch, so cap and
   blaze read as ONE pale shape rather than a white triangle stuck on a hood.
   It stops at the brow: on a pale face there is nothing below the brow for it
   to contrast against, and a wider one just split his head in two. ─────── */
const BLAZE = "M60 30 L70.4 48 C66 47.4 63 48.6 60 51 C57 48.6 54 47.4 49.6 48 Z";

/* ── L6 EYE — a solid dark oval, 10.8 × 12.4, with ONE catchlight. Rev 3 spent
   four layers per eye (cream, iris, pupil, two speculars) to punch a bright eye
   through a dark face. On cream, dark IS the contrast, so an eye is one shape
   and a dot — and that is also why it survives to 20px without degrading. ── */
const EYE = "M0 -6.2 C3 -6.2 5.4 -3.4 5.4 0 C5.4 3.4 3 6.2 0 6.2 C-3 6.2 -5.4 3.4 -5.4 0 C-5.4 -3.4 -3 -6.2 0 -6.2 Z";
const EYE_X = 74;
const EYE_Y = 64;

/* ── L7 BLUSH — one soft ellipse per cheek. The lever that failed on a dark
   coat and works immediately on a cream one. ──────────────────────────── */
const BLUSH: [number, number] = [35, 76];

/* ── L8 NOSE — a small rounded heart, dead centre. On a pale face it does not
   need to be large to read; it needs to be the DARKEST thing below the cap,
   and it is. IT TAKES NO EMBER: a warm nose at the optical centre of the face
   turns a guide into a plush toy. ──────────────────────────────────────── */
const NOSE =
  "M60 76 C63.4 76 66 77.6 66 80 C66 82.7 62.8 85 60 85 C57.2 85 54 82.7 54 80 C54 77.6 56.6 76 60 76 Z";

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
  const place = side === "r" ? `translate(${EYE_X} ${EYE_Y})` : `translate(120,0) scale(-1,1) translate(${EYE_X} ${EYE_Y})`;
  return (
    <g transform={place}>
      <g className="togo-eye">
        <g className="togo-eye-open">
          <path d={EYE} fill="var(--togo-line)" />
          {/* THE CATCHLIGHT CARRIES THE GAZE. With a solid eye there is no iris
              to slide inside a sclera, so the highlight is what moves — the
              oldest trick in cartoon animation, and it keeps every mood's
              --iris-x working untouched. */}
          <g className="togo-iris">
            <circle cx="1.9" cy="-2.2" r="2" fill="#fff" opacity=".95" />
            <circle className="togo-spec-2" cx="-1.6" cy="2.2" r="0.9" fill="#fff" opacity=".4" />
          </g>
        </g>
        {/* HOWL only — the celebration is spent exactly once. Dark on cream now,
            where rev 3 needed it cream on dark. */}
        <path
          className="togo-eye-happy"
          d="M-5.4 1.6 Q0 -4.4 5.4 1.6"
          stroke="var(--togo-line)"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
          opacity="0"
        />
        {/* ONE property drives blink and every half-lidded mood. THE LID IS FACE
            COLOURED, not cap coloured: the eye sits on cream now, so a dark lid
            would blink the wrong way round. */}
        <g clipPath={`url(#${gid}-eyeclip)`}>
          <rect
            className="togo-lid"
            x="-6.6"
            y="-7"
            width="13.2"
            height="14"
            fill="var(--togo-face-1)"
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
        <linearGradient id={`${gid}-face`} x1=".3" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor="var(--togo-face-1)" />
          <stop offset="1" stopColor="var(--togo-face-2)" />
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
          <stop offset="0" stopColor="var(--togo-ear-in)" stopOpacity=".72" />
          <stop offset="1" stopColor="var(--togo-ear-in)" />
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
            <ellipse className="togo-glow" cx="60" cy="70" rx="48" ry="42" fill={`url(#${gid}-glow)`} />
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
                {/* L2 — the head takes the FACE gradient. Rev 3 filled it with
                    the coat and then covered 3/4 of it with the mask; here the
                    cream IS the head and the cap is a hood laid over the top. */}
                <path d={HEAD} fill={`url(#${gid}-face)`} />
                {/* L3 RIM LIGHT — the move that separates premium vector from
                    clipart. Same light source as --bg-glow-1, so he sits in the
                    same 3D space as the glass cards instead of on top of them. */}
                <path
                  className="togo-rim"
                  d={HEAD}
                  fill="none"
                  stroke={`url(#${gid}-rim)`}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  opacity="0.5"
                />
                {/* L4 THE CAP. Lit, not painted — a flat fill cost the head its
                    roundness. Clipped to the head so its edges are the head's. */}
                <path d={CAP} fill={`url(#${gid}-cap)`} clipPath={`url(#${gid}-clip)`} />
                {/* L5 */}
                <path className="togo-blaze" d={BLAZE} fill={`url(#${gid}-blaze)`} />
                <g clipPath={`url(#${gid}-blazeclip)`}>
                  {/* READING: the scan runs UP the needle — the direction it
                      points. This is the frame where the character and the
                      engine fuse, and it is the only cyan left on the face. */}
                  <rect className="togo-scan" x="48" y="0" width="24" height="16" fill="var(--data)" opacity="0" />
                </g>
                {/* L5b BLUSH — clipped to the head so it can never bleed past
                    the cheek. It failed on rev 3's dark coat and works on sight
                    here, which is the whole argument for the pale face. */}
                <g className="togo-blush" clipPath={`url(#${gid}-clip)`} fill="var(--togo-blush)">
                  <ellipse cx={BLUSH[0]} cy={BLUSH[1]} rx="8.4" ry="5.2" />
                  <ellipse cx={120 - BLUSH[0]} cy={BLUSH[1]} rx="8.4" ry="5.2" />
                </g>
                {/* L6 */}
                <Eye gid={gid} side="l" />
                <Eye gid={gid} side="r" />
                {/* L7 */}
                <path d={NOSE} fill="var(--togo-line)" />
                <circle cx="57.2" cy="78.6" r="1.5" fill="#fff" opacity=".45" />
                {/* L8 MOUTH — two paths so the halves move independently. Both
                    now turn UP at the far end: rev 2's halves ran level out of
                    the corner, which is a muzzle line rather than a smile. */}
                <g fill="none" stroke="var(--togo-line)" strokeWidth="2.1" strokeLinecap="round">
                  <path className="togo-mouth togo-mouth-l" d="M60 85 Q55.8 90.6 51.2 87.6" />
                  <path className="togo-mouth togo-mouth-r" d="M60 85 Q64.2 90.6 68.8 87.6" />
                  {/* drawn 1px off level — that is the entire "unimpressed" read */}
                  <path className="togo-mouth togo-mouth-flat" d="M52.6 88.2 L67.4 87.4" opacity="0" />
                </g>

                {/* HOWL ONLY. The tongue exists nowhere else in this file. */}
                <g className="togo-howl">
                  <path
                    className="togo-howl-only togo-howl-mouth"
                    d="M53.4 85.6 C56.2 84 63.8 84 66.6 85.6 C66.6 92.6 63.6 96.2 60 96.2 C56.4 96.2 53.4 92.6 53.4 85.6 Z"
                    fill="#2A1620"
                    opacity="0"
                  />
                  <path
                    className="togo-howl-only togo-tongue"
                    d="M56.6 90.6 C57.8 89.2 62.2 89.2 63.4 90.6 C63.4 94.2 61.8 95.4 60 95.4 C58.2 95.4 56.6 94.2 56.6 90.6 Z"
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
                    cy="88"
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
