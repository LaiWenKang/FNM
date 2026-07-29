import { SEED_PLACES, SWIPE_CARDS, SwipeCard } from "@/lib/data/seed";
import { DIMS, Dim, FlavorVector, SPEAKS } from "@/lib/flavor";

// ═══ CHOOSING THE SIXTEEN ═════════════════════════════════════════════════
//
// Calibration is sixteen yes/no answers and about sixty seconds. That budget
// is fixed — it is the thing that makes this app openable — so the only
// question is WHICH sixteen, and hand-picking them went badly:
//
//   · Fifteen of the old sixteen said nothing about SWEET, so the axis was
//     never measured and sat at 0.5 for everyone while still counting for a
//     sixth of every palate score.
//   · HEAT had eight cards claiming "mild" and three claiming "spicy". Anyone
//     who liked most of what they saw drifted mild regardless of their taste,
//     because the deck itself leaned that way. A deck that leans is a deck
//     that answers its own question.
//
// So the deck is SELECTED rather than typed out. Twelve buckets — six axes
// times two poles — and each pick goes to whichever card best serves the
// emptiest ones. The guarantee is checked in test/calibration.test.ts, and it
// survives adding cards to the pool, which typing out a list never does.

export const CALIBRATION_LENGTH = 16;

type Pole = "high" | "low";
const poleOf = (v: number): Pole => (v >= 0.5 ? "high" : "low");
const claims = (card: SwipeCard, d: Dim): boolean => Math.abs(card.flavor[d] - 0.5) >= SPEAKS;

/** At least this many cards must argue each side of each axis. */
export const MIN_PER_POLE = 4;
/** How much a unit of centre-misalignment costs against a missing pole card. */
const ALIGN_WEIGHT = 14;

/** The centre of gravity of the food this app can actually offer. */
export const CATALOGUE_CENTRE: FlavorVector = (() => {
  const out = {} as FlavorVector;
  for (const d of DIMS) {
    out[d] = SEED_PLACES.reduce((s, p) => s + p.flavor[d], 0) / SEED_PLACES.length;
  }
  return out;
})();

function centreOf(cards: SwipeCard[]): FlavorVector {
  const out = {} as FlavorVector;
  for (const d of DIMS) out[d] = cards.reduce((s, c) => s + c.flavor[d], 0) / (cards.length || 1);
  return out;
}

/**
 * ALIGNMENT IS THE OBJECTIVE, and working out what to align to was the whole
 * problem. The obvious target — a deck balanced around 0.5 on every axis — is
 * wrong, because 0.5 is not where food is. Measured across the catalogue, real
 * places average heat 0.39, fried 0.40, adventure 0.38. Nothing is neutral at
 * 0.5 except the empty vector we start people at.
 *
 * So a diner with no strong opinions should finish calibration sitting at the
 * centre of what they will actually be OFFERED, and the deck's job is to put
 * them there. The old deck missed that centre by +0.13 on soupy and −0.11 on
 * fried, which is a systematic error in everybody's profile: every user came
 * out reading as more of a soup person and less of a fried-food person than
 * the food around them, and then every ranking inherited it.
 *
 * The cost therefore has two parts — how far the deck's centre sits from the
 * catalogue's, and whether each pole gets enough cards to argue its side at
 * all (a centre can be right on average while measuring nothing). Strength
 * breaks ties: a dish that is *definitely* sweet teaches more than a faintly
 * sweet one.
 *
 * Deterministic on purpose. Everyone gets the same sixteen in the same order,
 * so a calibration can be reasoned about, reproduced and tested.
 */
function selectDeck(pool: SwipeCard[], size: number): SwipeCard[] {
  const key = (d: Dim, p: Pole) => `${d}:${p}`;
  const count: Record<string, number> = {};
  for (const d of DIMS) {
    count[key(d, "high")] = 0;
    count[key(d, "low")] = 0;
  }

  const cost = (cards: SwipeCard[], c: Record<string, number>): number => {
    const centre = centreOf(cards);
    let total = 0;
    for (const d of DIMS) {
      total += ALIGN_WEIGHT * Math.abs(centre[d] - CATALOGUE_CENTRE[d]);
      /* SQUARED, so the gap from three cards to four costs far more than the
         gap from six to seven. A pole argued by one card is how `sweet` came
         to be unmeasurable; linear shortfall let alignment buy its way past
         that, and it did. */
      total += Math.max(0, MIN_PER_POLE - c[key(d, "high")]) ** 2;
      total += Math.max(0, MIN_PER_POLE - c[key(d, "low")]) ** 2;
    }
    return total;
  };

  const chosen: SwipeCard[] = [];
  const left = [...pool];
  while (chosen.length < size && left.length) {
    let bestIdx = 0;
    let bestCost = Infinity;
    let bestStrength = -1;
    for (let i = 0; i < left.length; i += 1) {
      const trial = { ...count };
      let strength = 0;
      for (const d of DIMS) {
        if (!claims(left[i], d)) continue;
        trial[key(d, poleOf(left[i].flavor[d]))] += 1;
        strength += Math.abs(left[i].flavor[d] - 0.5);
      }
      const c = cost([...chosen, left[i]], trial);
      if (c < bestCost - 1e-9 || (Math.abs(c - bestCost) < 1e-9 && strength > bestStrength)) {
        bestIdx = i;
        bestCost = c;
        bestStrength = strength;
      }
    }
    const [card] = left.splice(bestIdx, 1);
    for (const d of DIMS) {
      if (claims(card, d)) count[key(d, poleOf(card.flavor[d]))] += 1;
    }
    chosen.push(card);
  }
  return chosen;
}

/** How far the deck's centre of gravity sits from the catalogue's, per axis. */
export function centreDrift(deck: SwipeCard[] = CALIBRATION_DECK): Record<Dim, number> {
  const centre = centreOf(deck);
  const out = {} as Record<Dim, number>;
  for (const d of DIMS) out[d] = centre[d] - CATALOGUE_CENTRE[d];
  return out;
}

/** The sixteen cards onboarding actually shows, in order. */
export const CALIBRATION_DECK: SwipeCard[] = selectDeck(SWIPE_CARDS, CALIBRATION_LENGTH);

/** Every pole of every axis, and how many cards in the deck speak to it. */
export function deckCoverage(deck: SwipeCard[] = CALIBRATION_DECK): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of DIMS) {
    out[`${d}:high`] = 0;
    out[`${d}:low`] = 0;
  }
  for (const card of deck) {
    for (const d of DIMS) {
      if (claims(card, d)) out[`${d}:${poleOf(card.flavor[d])}`] += 1;
    }
  }
  return out;
}

/* ── HOW HARD EACH ANSWER PUSHES ──────────────────────────────────────────
   Early answers move the vector further, because at the start there is
   nothing to contradict them; later ones fine-tune. The decay is gentler than
   it was (0.15 -> 0.08 per swipe) because a masked nudge only touches the
   axes a card actually claims, so any single axis now gets roughly five
   updates across the deck rather than sixteen — the old schedule had it
   crawling by the time the deck reached the cards that mattered.

   A REJECTION IS WORTH LESS THAN AN ACCEPTANCE, and not by a little. A yes
   endorses every axis the dish claims. A no rejects ONE of them and does not
   say which, so even after weighting by salience it is a guess. Two-thirds
   weight is the price of that ambiguity. */
export const ACCEPT_WEIGHT = 0.34;
export const REJECT_DISCOUNT = 0.62;

export function swipeWeight(swipeCount: number, liked: boolean): number {
  const base = Math.max(0.12, ACCEPT_WEIGHT / (1 + swipeCount * 0.08));
  return liked ? base : base * REJECT_DISCOUNT;
}
