// SKYBAND — the 116px header of the hero card, and the reason the card body no
// longer smears orange→olive→blue-grey. ALL brand colour lives in here, in a
// contained band, instead of bleeding through a semi-transparent padding-box.
//
// It carries most of the new illustration density, all of it from data the API
// already returns:
//   · four sky gradients driven by mealPeriod — the app looks different at 8am
//     and at 11pm, which is the kind of detail people show other people
//   · an abstracted CBD skyline, so the gradient has a horizon to be a sky above
//   · a rain layer of 14 staggered lines when context.raining
//   · the COVERED WALK badge from `sheltered`, which has been sitting in the
//     seed schema since day one and has never once been surfaced
//   · a CLOSES 19:00 · 40 MIN chip computed from closeHour — high-value urgency,
//     completely absent before
//   · a 64px dish glyph, bottom-anchored and deliberately OUTSIDE the mask so it
//     breaks the band's lower edge and overlaps the card body. That overlap is
//     the depth cue; the mask alone would just be a fade.

import type { MealPeriod } from "@/lib/context";
import type { DishGlyphKey } from "@/components/glyphs/dishes";
import Glyph from "@/components/Glyph";
import { UmbrellaIcon } from "@/components/icons";

/** Deterministic skyline — same silhouette every render, no randomness. */
const SKYLINE = [
  [0, 74, 26, 42],
  [28, 58, 18, 58],
  [48, 68, 30, 48],
  [80, 40, 22, 76],
  [104, 62, 26, 54],
  [132, 30, 20, 86],
  [154, 54, 34, 62],
  [190, 46, 24, 70],
  [216, 66, 30, 50],
  [248, 36, 22, 80],
  [272, 60, 28, 56],
  [302, 50, 20, 66],
  [324, 70, 34, 46],
  [360, 56, 40, 60],
] as const;

const RAIN = Array.from({ length: 14 }, (_, i) => ({
  x: 12 + i * 28 + (i % 3) * 6,
  d: i,
}));

export interface SkyBandProps {
  mealPeriod: MealPeriod;
  raining: boolean;
  sheltered?: boolean;
  glyph: DishGlyphKey;
  /** "CLOSES 19:00 · 40 MIN" — already formatted, because Togo never says one. */
  closesLabel?: string | null;
  /** true when closing is inside the hour: the chip turns urgent. */
  closingSoon?: boolean;
}

export default function SkyBand({
  mealPeriod,
  raining,
  sheltered = false,
  glyph,
  closesLabel,
  closingSoon = false,
}: SkyBandProps) {
  return (
    <div className="skyband" data-period={mealPeriod} data-rain={raining ? "1" : undefined}>
      <div className="sky-fill">
        <svg
          className="sky-art"
          viewBox="0 0 400 116"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {/* the horizon the gradient needs in order to read as a sky */}
          <g className="sky-city">
            {SKYLINE.map(([x, y, w, h]) => (
              <rect key={x} x={x} y={y} width={w} height={h} />
            ))}
          </g>
          {raining && (
            <g className="sky-rain">
              {RAIN.map(({ x, d }) => (
                <line
                  key={x}
                  x1={x}
                  y1="-14"
                  x2={x - 7}
                  y2="10"
                  style={{ ["--i" as string]: d }}
                />
              ))}
            </g>
          )}
        </svg>
      </div>

      {closesLabel && (
        <span className={`sky-chip${closingSoon ? " urgent" : ""}`}>{closesLabel}</span>
      )}
      {raining && sheltered && (
        <span className="sky-badge">
          <UmbrellaIcon size={12} strokeWidth={1.9} />
          Covered walk
        </span>
      )}

      {/* breaks the mask edge on purpose — that overlap is the depth */}
      <span className="sky-dish">
        <Glyph name={glyph} size={64} />
      </span>
    </div>
  );
}
