// DISH SECTION — a 180px hand-drawn cross-section for the swipe card, replacing
// 192px of another company's raster clipart on the most-viewed activation screen
// in the product.
//
// Nine archetypes selected FROM THE DISH VECTOR rather than authored per card,
// so nine drawings cover sixteen cards and any card added later is covered for
// free. That is the same trick the recommender itself uses: don't enumerate,
// place things in the shared flavour space and read them off it.
//
// Pure presentational, server-safe, every defs id gid-prefixed.

import type { FlavorVector } from "@/lib/flavor";

export type Section =
  | "spicy-soup"
  | "clear-soup"
  | "congee"
  | "fried"
  | "grill"
  | "raw"
  | "braise"
  | "greens"
  | "rice";

export function sectionFor(f: FlavorVector): Section {
  if (f.soupy > 0.7 && f.heat > 0.5) return "spicy-soup";
  if (f.soupy > 0.85 && f.rich < 0.45) return "congee";
  if (f.soupy > 0.65) return "clear-soup";
  if (f.fried > 0.7) return "fried";
  if (f.adventure > 0.7 && f.fried < 0.35) return "raw";
  if (f.rich > 0.72 && f.heat > 0.45) return "braise";
  if (f.rich > 0.65) return "grill";
  if (f.rich < 0.3 && f.fried < 0.3) return "greens";
  return "rice";
}

const BOWL = "M16 60H164c-4 50-26 76-74 76S20 110 16 60Z";
const PLATE = "M10 92H170c-6 18-36 28-80 28S16 110 10 92Z";
const BROTH = "M22 70H158c-3 42-23 62-68 62S25 112 22 70Z";

const STEAM = [
  "M62 46c-9-10-2-19 1-26 3-7 2-12-3-18",
  "M90 40c-9-10-2-19 1-26 3-7 2-12-3-18",
  "M118 46c-9-10-2-19 1-26 3-7 2-12-3-18",
];

/** Contents per archetype: [class, path] pairs drawn inside the clipped vessel. */
const CONTENTS: Record<Section, { d: string; tone: "warm" | "cool" | "ink" }[]> = {
  "spicy-soup": [
    { d: "M22 70H158c-3 42-23 62-68 62S25 112 22 70Z", tone: "warm" },
    { d: "M34 84c22-13 50-16 74-7l-5 13c-20-7-43-5-62 6Z", tone: "ink" },
    { d: "M40 104c20-12 46-14 68-6l-5 12c-18-6-39-4-56 5Z", tone: "ink" },
    { d: "M104 78a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z", tone: "warm" },
    { d: "M58 96a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z", tone: "warm" },
  ],
  "clear-soup": [
    { d: BROTH, tone: "cool" },
    { d: "M40 82c16-10 36-13 54-7l-4 12c-14-5-31-3-45 5Z", tone: "ink" },
    { d: "M64 102c16-10 36-13 54-7l-4 12c-14-5-31-3-45 5Z", tone: "ink" },
    { d: "M96 84a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z", tone: "warm" },
  ],
  congee: [
    { d: BROTH, tone: "cool" },
    { d: "M36 86c18-14 42-20 66-16l-2 12c-20-3-40 2-56 13Z", tone: "ink" },
    { d: "M46 108c16-11 36-15 56-11l-2 11c-16-3-33 0-47 9Z", tone: "ink" },
  ],
  fried: [
    { d: PLATE, tone: "ink" },
    { d: "M44 52c14-8 30-6 40 6 8 10 6 24-4 32-11 9-27 8-36-2-10-11-9-27 0-36Z", tone: "warm" },
    { d: "M104 62c12-6 26-3 33 8 6 9 4 21-5 27-10 7-23 5-30-4-7-9-6-25 2-31Z", tone: "warm" },
    { d: "M56 66c7-4 15-2 19 4l-6 4c-2-3-6-4-9-2Z", tone: "cool" },
  ],
  grill: [
    { d: PLATE, tone: "ink" },
    { d: "M32 56h56c6 0 10 5 10 11s-4 11-10 11H32c-6 0-10-5-10-11s4-11 10-11Z", tone: "warm" },
    { d: "M94 74h54c6 0 10 5 10 11s-4 11-10 11H94c-6 0-10-5-10-11s4-11 10-11Z", tone: "warm" },
    { d: "M40 60h40v5H40Zm62 18h40v5h-40Z", tone: "cool" },
  ],
  raw: [
    { d: PLATE, tone: "ink" },
    { d: "M30 60c16-10 34-13 50-8l-6 18c-12-4-26-2-38 5Z", tone: "warm" },
    { d: "M74 70c16-10 34-13 50-8l-6 18c-12-4-26-2-38 5Z", tone: "warm" },
    { d: "M116 58c14-9 30-11 44-7l-5 16c-11-3-23-1-33 4Z", tone: "warm" },
  ],
  braise: [
    { d: BOWL, tone: "ink" },
    { d: "M40 72a20 20 0 1 1 0 40 20 20 0 0 1 0-40Z", tone: "warm" },
    { d: "M84 62a17 17 0 1 1 0 34 17 17 0 0 1 0-34Z", tone: "warm" },
    { d: "M122 78a15 15 0 1 1 0 30 15 15 0 0 1 0-30Z", tone: "warm" },
    { d: "M36 78a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z", tone: "cool" },
  ],
  greens: [
    { d: BOWL, tone: "ink" },
    { d: "M88 46c26 0 46 20 46 44h-14c0-17-14-30-32-30Z", tone: "warm" },
    { d: "M84 52c-24 2-42 21-42 44h13c0-16 13-29 29-31Z", tone: "warm" },
    { d: "M60 104a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm34 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z", tone: "cool" },
  ],
  rice: [
    { d: PLATE, tone: "ink" },
    { d: "M50 78c0-17 18-30 40-30s40 13 40 30c0 8-18 13-40 13s-40-5-40-13Z", tone: "cool" },
    { d: "M58 68h64c4 0 7 3 7 6s-3 6-7 6H58c-4 0-7-3-7-6s3-6 7-6Z", tone: "warm" },
    { d: "M66 54h48c3 0 6 2 6 5s-3 5-6 5H66c-3 0-6-2-6-5s3-5 6-5Z", tone: "warm" },
  ],
};

export default function DishSection({
  flavor,
  size = 180,
  gid = "ds",
}: {
  flavor: FlavorVector;
  size?: number;
  gid?: string;
}) {
  const kind = sectionFor(flavor);
  const vessel = kind === "fried" || kind === "grill" || kind === "raw" || kind === "rice" ? PLATE : BOWL;
  const rim = vessel === BOWL ? { cy: 60, rx: 74, ry: 14 } : { cy: 92, rx: 80, ry: 11 };

  return (
    <svg
      className="dish-section"
      viewBox="0 0 180 150"
      width={size}
      height={Math.round((size * 150) / 180)}
      data-kind={kind}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-v`} x1=".2" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor="var(--sec-vessel-1)" />
          <stop offset="1" stopColor="var(--sec-vessel-2)" />
        </linearGradient>
        <clipPath id={`${gid}-c`}>
          <path d={vessel} />
        </clipPath>
      </defs>

      {/* steam first, so the vessel edge always wins the overlap */}
      <g className="sec-steam" fill="none" strokeLinecap="round" strokeWidth="3">
        {STEAM.map((d, i) => (
          <path key={d} d={d} style={{ ["--i" as string]: i }} pathLength={100} />
        ))}
      </g>

      <path className="sec-vessel" d={vessel} fill={`url(#${gid}-v)`} />
      <g clipPath={`url(#${gid}-c)`}>
        {CONTENTS[kind].map((c, i) => (
          <path key={i} className={`sec-fill sec-${c.tone}`} d={c.d} />
        ))}
      </g>
      <path className="sec-rim" d={vessel} fill="none" strokeWidth="3.4" strokeLinejoin="round" />
      <ellipse className="sec-lip" cx="90" cy={rim.cy} rx={rim.rx} ry={rim.ry} fill="none" strokeWidth="3.4" />
      <ellipse className="sec-lip-hi" cx="72" cy={rim.cy - 2} rx="34" ry="6" fill="none" strokeWidth="2.2" />
    </svg>
  );
}
