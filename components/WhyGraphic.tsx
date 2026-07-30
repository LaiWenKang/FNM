// WHY, AS A GRAPHIC — the change that converts a telemetry COSTUME into a
// visible ENGINE.
//
// Five or six signed contribution bars whose values are the terms lib/scoring.ts
// already computes, and WHOSE SUM IS THE NUMBER IN THE RING. That is the whole
// difference between a slot machine and an engine, and it is exactly what
// "advanced / technical" means: not more monospace, but the arithmetic shown.
//
// Plus the 76px dual radar — your palate as an ember polygon, the dish's vector
// as a cyan outline — which is the wordless version of the same claim.
//
// Togo signs it. A recommendation with a face attached is a recommendation
// someone is accountable for. His mood is bound to the REAL score (≥85 locked ·
// 60–84 hedging · <60 hedging + tilt) and he is capped at 24px, well under the
// 72px ring: the number stays the hero and he endorses it.

import type { CSSProperties } from "react";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { FlavorVector } from "@/lib/flavor";
import Togo, { TogoMood } from "@/components/Togo";
import TasteRadar from "@/components/TasteRadar";

const ROWS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "palate", label: "Palate" },
  { key: "distance", label: "Distance" },
  { key: "weather", label: "Weather" },
  { key: "budget", label: "Budget" },
  { key: "novelty", label: "Novelty" },
  // Only rendered when it is non-zero — curated places carry no crowd rating,
  // and a permanent 0 bar would read as "badly rated" rather than "not rated".
  { key: "quality", label: "Rating" },
  { key: "craving", label: "Craving" },
  { key: "saved", label: "You saved it" },
];

/** Confidence, not decoration: the pose is a function of the number. */
export function moodForScore(score: number): { mood: TogoMood; tilt: boolean } {
  if (score >= 85) return { mood: "locked", tilt: false };
  if (score >= 60) return { mood: "hedging", tilt: false };
  return { mood: "hedging", tilt: true };
}

export interface WhyGraphicProps {
  score: number;
  breakdown: ScoreBreakdown;
  /** The engine's sentence. Facts, in the engine's own voice. */
  explanation: string;
  /** Togo's clause. A verdict, never a measurement. */
  clause: string;
  vector?: FlavorVector | null;
  compare?: FlavorVector | null;
  /* FALSE BEFORE THE DINER HAS SAID ANYTHING. The palate bar is the only term
     on this card that can be drawn from no evidence at all — the others come
     from a map, a clock, a price and a crowd rating. Rendering "+27 Palate"
     next to those, in the same weight, is the card claiming a reading it does
     not have, on the one screen whose entire pitch is that the arithmetic is
     shown. */
  palateKnown?: boolean;
  gid?: string;
}

export default function WhyGraphic({
  score,
  breakdown,
  explanation,
  clause,
  vector,
  compare,
  palateKnown = true,
  gid = "why",
}: WhyGraphicProps) {
  // A permanent 0 bar reads as "scored badly" rather than "not applicable", so
  // rows that only exist conditionally are dropped when they carry no value.
  const rows = ROWS.filter((r) =>
    (r.key !== "quality" || breakdown.quality !== 0) &&
    (r.key !== "craving" || breakdown.craving !== 0) &&
    (r.key !== "saved" || breakdown.saved !== 0),
  );
  const values = rows.map((r) => breakdown[r.key]);
  const denom = Math.max(20, ...values.map((v) => Math.abs(v)));
  const { mood, tilt } = moodForScore(score);

  return (
    <section className="why-block" aria-label="Why this pick">
      <div className="why-head">
        <span className="why-label">Why</span>
        <span className="why-sum">{values.length} terms · sums to match</span>
      </div>

      {/* ONE why-sentence, authored by him. The ring already says the number and
          the bars already prove it, so the engine's restatement of the same
          figure is gone: the head plus his line IS the why-line. */}
      <p className="togo-attrib togo-say" title={explanation}>
        <Togo mood={mood} tilt={tilt} size={24} gid={`${gid}-t`} className="togo-face" />
        <span className="togo-attrib-name">Togo&rsquo;s call</span>
        <span className="togo-attrib-sep" aria-hidden="true">
          ·
        </span>
        <span className="togo-attrib-line">{clause}</span>
      </p>

      <div className="why-body">
        <div className="why-bars">
          {rows.map((row, i) => {
            const v = breakdown[row.key];
            return (
              <div
                className="why-row"
                key={row.key}
                data-sign={v < 0 ? "neg" : "pos"}
                data-zero={v === 0 ? "1" : undefined}
                data-unset={row.key === "palate" && !palateKnown ? "1" : undefined}
                style={{ "--v": Math.abs(v) / denom, "--i": i } as CSSProperties}
              >
                <span className="why-row-label">
                  {row.key === "palate" && !palateKnown ? "Palate · not set" : row.label}
                </span>
                <span className="why-track">
                  <span className="why-fill" />
                </span>
                <span className="why-val">
                  {v >= 0 ? "+" : "−"}
                  {Math.abs(v)}
                </span>
              </div>
            );
          })}
        </div>

        {vector && (
          <div className="why-radar" aria-hidden="true">
            <TasteRadar vector={vector} compare={compare ?? undefined} decorative gid={`${gid}-r`} size={92} />
            {/* The DISH swatch only exists when there IS a dish. Live Google
                results carry no dish data, and a legend naming a series that
                was never plotted reads as a rendering fault. */}
            <span className="why-radar-key">
              <i className="k-you" /> {palateKnown ? "You" : "You · not set"}
              {compare && (
                <>
                  <i className="k-dish" /> Dish
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
