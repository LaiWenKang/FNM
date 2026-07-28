// THE RECEIPT — the emotional peak of the product, which until now terminated
// in "Decision logged ✓" and a Done button.
//
// A physical object: perforated top edge (mask-image radial-gradient repeated at
// 18px), a dashed tear line, mono line items, and a HOWL Togo stamped beside the
// tear with his TUGLINE GONE SLACK, because the run is over. That slack line is
// the entire difference between a mascot celebrating and a mascot finishing.
//
// The DIRECTIONS deep link is the only thing on this screen that leaves the app,
// and it is the only thing anyone wants from it once they have decided.

import Togo from "@/components/Togo";
import Needle from "@/components/Needle";
import Glyph from "@/components/Glyph";
import type { DishGlyphKey } from "@/components/glyphs/dishes";
import { ArrowIcon } from "@/components/icons";

export interface ReceiptProps {
  name: string;
  area?: string | null;
  dish: { name: string; priceSgd: number } | null;
  glyph: DishGlyphKey;
  walkMinutes: number;
  matchScore: number;
  /** Seconds from landing on /recommend to committing. The 60-second promise, kept. */
  decidedInSec: number;
  lat?: number;
  lng?: number;
  placeId: string;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function Receipt({
  name,
  area,
  dish,
  glyph,
  walkMinutes,
  matchScore,
  decidedInSec,
  lat,
  lng,
  placeId,
}: ReceiptProps) {
  const rows: [string, string][] = [
    ["Place", name],
    ...(area ? ([["Area", area]] as [string, string][]) : []),
    ...(dish ? ([["Dish", dish.name]] as [string, string][]) : []),
    ["Walk", `${walkMinutes} MIN`],
    ["Match", `${matchScore}/100`],
    ...(dish ? ([["Price", money(dish.priceSgd)]] as [string, string][]) : []),
  ];

  return (
    <div className="receipt" style={{ viewTransitionName: `pick-${placeId}` }}>
      <div className="receipt-perf" aria-hidden="true" />

      <header className="receipt-head">
        <span className="receipt-brand">
          <Needle size={13} tone="ice" gid="rcpt" />
          FNM · DECIDED
        </span>
        <span className="receipt-glyph" aria-hidden="true">
          <Glyph name={glyph} size={40} />
        </span>
      </header>

      <h2 className="receipt-name">{name}</h2>
      {dish && <p className="receipt-dish">Get the {dish.name}</p>}

      <dl className="receipt-rows">
        {rows.map(([k, v]) => (
          <div className="receipt-row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="receipt-tear" aria-hidden="true">
        <span className="receipt-stamp">
          <Togo mood="howl" variant="bust" size={100} gid="rcp" className="togo-face" />
        </span>
      </div>

      <p className="receipt-timing">
        <span className="receipt-timing-k">Decided in</span>
        <span className="receipt-timing-v">{decidedInSec}s</span>
      </p>

      {lat !== undefined && lng !== undefined && (
        <a className="big-btn go" href={`maps://?daddr=${lat},${lng}&dirflg=w`}>
          <ArrowIcon size={18} strokeWidth={2.2} />
          Directions
        </a>
      )}
    </div>
  );
}
