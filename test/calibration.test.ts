import { describe, expect, it } from "vitest";
import {
  CALIBRATION_DECK,
  CALIBRATION_LENGTH,
  CATALOGUE_CENTRE,
  MIN_PER_POLE,
  centreDrift,
  deckCoverage,
  swipeWeight,
} from "@/lib/calibration";
import { SWIPE_CARDS, SwipeCard } from "@/lib/data/seed";
import { DIMS, Dim, FlavorVector, neutralVector, nudge, vec } from "@/lib/flavor";

// Calibration is sixteen taps and then the app claims to know your palate.
// Every bug these tests pin was invisible from the outside: the profile always
// LOOKED plausible, it was just wrong, and there was no way to notice without
// running the deck end to end and reading the number that came out.

function calibrate(answer: (c: SwipeCard) => boolean): FlavorVector {
  let v = neutralVector();
  CALIBRATION_DECK.forEach((card, n) => {
    const liked = answer(card);
    v = nudge(v, card.flavor, liked, swipeWeight(n, liked));
  });
  return v;
}

describe("a dish only teaches what it claims", () => {
  it("leaves an axis alone when the dish says nothing about it", () => {
    // vec() fills unwritten axes with 0.5, and treating that as a claim of
    // "medium" was the single biggest source of bad calibration: liking a dish
    // dragged every axis it never mentioned toward the middle.
    const soupLover = vec({ soupy: 0.95 });
    const opinionatedAboutHeatOnly = vec({ heat: 0.95 });
    const after = nudge(soupLover, opinionatedAboutHeatOnly, true, 0.5);
    expect(after.soupy).toBe(0.95);
    expect(after.heat).toBeGreaterThan(soupLover.heat);
  });

  it("does not amplify an existing bias when a dish is rejected", () => {
    // The nastier half of the same bug. Rejection pushes AWAY from the target,
    // so on an axis the dish never claimed, `v - 0.5` pushed v further from
    // centre — saying no invented a preference out of nothing.
    const v = vec({ fried: 0.9 });
    const after = nudge(v, vec({ heat: 0.95 }), false, 0.5);
    expect(after.fried).toBe(0.9);
  });

  it("teaches nothing at all from a dish that claims nothing", () => {
    const v = vec({ heat: 0.8, soupy: 0.2 });
    expect(nudge(v, neutralVector(), true, 0.9)).toEqual(v);
    expect(nudge(v, neutralVector(), false, 0.9)).toEqual(v);
  });
});

describe("rejecting is not the mirror of accepting", () => {
  it("moves exactly one axis — the one it blames", () => {
    // A no rejects ONE thing and does not say which. Pushing away on every
    // axis punished four for one axis's crime.
    const after = nudge(neutralVector(), vec({ heat: 0.95, rich: 0.62 }), false, 0.4);
    const moved = DIMS.filter((d) => after[d] !== 0.5);
    expect(moved).toEqual(["heat"]);
  });

  it("blames what you disagree with, not merely what is loudest", () => {
    // A soup lover turning down a salad is objecting to the absence of broth,
    // even though the salad is loudest about being un-fried.
    const soupLover = vec({ soupy: 0.95 });
    const salad = vec({ heat: 0.12, sweet: 0.28, soupy: 0.05, fried: 0.05, rich: 0.16 });
    const after = nudge(soupLover, salad, false, 0.4);
    expect(DIMS.filter((d) => after[d] !== soupLover[d])).toEqual(["soupy"]);
  });

  it("learns less from rejecting something you look nothing like", () => {
    // Distance-proportional push ran away: an axis that drifted became the
    // explanation for every later rejection, which drifted it further.
    const spicy = vec({ heat: 0.95 });
    const alsoNeutral = neutralVector();
    const mild = vec({ heat: 0.05 });
    const farMove = Math.abs(nudge(spicy, mild, false, 0.4).heat - spicy.heat);
    const nearMove = Math.abs(nudge(alsoNeutral, mild, false, 0.4).heat - alsoNeutral.heat);
    expect(farMove).toBeLessThan(nearMove);
  });

  it("counts for less than an acceptance", () => {
    expect(swipeWeight(0, false)).toBeLessThan(swipeWeight(0, true));
    expect(swipeWeight(9, false)).toBeLessThan(swipeWeight(9, true));
  });

  it("moves early answers more than late ones", () => {
    expect(swipeWeight(0, true)).toBeGreaterThan(swipeWeight(15, true));
  });
});

describe("the deck", () => {
  it("is the promised length, with no repeats, all from the pool", () => {
    expect(CALIBRATION_DECK).toHaveLength(CALIBRATION_LENGTH);
    expect(new Set(CALIBRATION_DECK.map((c) => c.id)).size).toBe(CALIBRATION_LENGTH);
    for (const card of CALIBRATION_DECK) expect(SWIPE_CARDS).toContain(card);
  });

  it("gives every pole of every axis enough cards to argue its side", () => {
    // `sweet` once had ONE card claiming it high and none claiming it low, so
    // the axis stayed at 0.5 for every user on earth while still counting for
    // a sixth of every palate score.
    const cov = deckCoverage();
    for (const d of DIMS) {
      expect(cov[`${d}:high`], `${d} high`).toBeGreaterThanOrEqual(MIN_PER_POLE);
      expect(cov[`${d}:low`], `${d} low`).toBeGreaterThanOrEqual(MIN_PER_POLE);
    }
  });

  it("sits on the catalogue's centre of gravity, not on 0.5", () => {
    // 0.5 is not neutral: real places average heat 0.39 and fried 0.40. What
    // matters is that someone with no strong opinions finishes calibration at
    // the centre of the food they will actually be offered. The old deck missed
    // it by +0.13 on soupy and -0.11 on fried, and every profile inherited that.
    const drift = centreDrift();
    for (const d of DIMS) expect(Math.abs(drift[d]), `${d} drift`).toBeLessThan(0.07);
  });

  it("is drawn from a catalogue centre that is genuinely off 0.5", () => {
    // If this ever stops being true the alignment test above is vacuous.
    const off = DIMS.filter((d) => Math.abs(CATALOGUE_CENTRE[d] - 0.5) > 0.05);
    expect(off.length).toBeGreaterThan(0);
  });
});

describe("what sixteen taps actually produce", () => {
  const strongest = (v: FlavorVector): Dim =>
    DIMS.reduce((a, b) => (Math.abs(v[b] - 0.5) > Math.abs(v[a] - 0.5) ? b : a));

  it("does not turn a soup lover into a chilli fiend", () => {
    // THE REPORTED BUG, pinned. Someone who says yes only to soup rejects a
    // pile of mild dry dishes on the way, and the old maths read every one of
    // those rejections as "wants it spicier" — they came out at heat 0.96
    // having never once endorsed chilli.
    const v = calibrate((c) => c.flavor.soupy > 0.7);
    expect(v.soupy).toBeGreaterThan(0.75);
    expect(v.heat).toBeLessThan(0.6);
    expect(strongest(v)).toBe("soupy");
  });

  it("learns almost nothing from someone who liked none of it", () => {
    // Sixteen refusals are not an opinion, and the app used to read them as
    // one: it came out at heat 0.98, a violent taste assembled from nothing
    // but "no". Landing near the centre is the honest answer.
    const v = calibrate(() => false);
    for (const d of DIMS) expect(Math.abs(v[d] - 0.5), `${d}`).toBeLessThan(0.2);
  });

  it("can finally tell a sweet tooth from someone who dislikes sweet things", () => {
    // Not merely inaccurate before — IMPOSSIBLE. One card in sixteen claimed
    // sweetness and none denied it, so the axis could not move: every user
    // finished at sweet ≈ 0.5 while it went on counting for a sixth of every
    // palate score. These two now land 0.46 of the scale apart — measured, and
    // asserted a little under so the test pins the behaviour without pinning
    // the exact arithmetic.
    const sweetTooth = calibrate((c) => c.flavor.sweet > 0.6);
    const savoury = calibrate((c) => c.flavor.sweet < 0.4);
    expect(sweetTooth.sweet).toBeGreaterThan(0.7);
    expect(savoury.sweet).toBeLessThan(0.35);
    expect(sweetTooth.sweet - savoury.sweet).toBeGreaterThan(0.4);
  });

  it("reads a chilli head as a chilli head", () => {
    const v = calibrate((c) => c.flavor.heat > 0.6);
    expect(v.heat).toBeGreaterThan(0.8);
    expect(strongest(v)).toBe("heat");
  });

  it("leaves someone who likes everything near the centre of the food on offer", () => {
    // A deck that leans answers its own question. Liking all sixteen is not a
    // preference and must not be recorded as one.
    const v = calibrate(() => true);
    for (const d of DIMS) {
      expect(Math.abs(v[d] - CATALOGUE_CENTRE[d]), `${d}`).toBeLessThan(0.22);
    }
  });

  it("keeps every axis inside the unit range", () => {
    for (const answer of [() => true, () => false, (c: SwipeCard) => c.flavor.rich > 0.6]) {
      const v = calibrate(answer);
      for (const d of DIMS) {
        expect(v[d]).toBeGreaterThanOrEqual(0);
        expect(v[d]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the card pool", () => {
  it("has no duplicate ids and no flavour outside 0..1", () => {
    expect(new Set(SWIPE_CARDS.map((c) => c.id)).size).toBe(SWIPE_CARDS.length);
    for (const c of SWIPE_CARDS) {
      for (const d of DIMS) {
        expect(c.flavor[d], `${c.id}.${d}`).toBeGreaterThanOrEqual(0);
        expect(c.flavor[d], `${c.id}.${d}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("states a sweetness for every card", () => {
    // The omission that made one of six axes unmeasurable. A card may be
    // deliberately neutral on sweetness, but it has to say so on purpose.
    for (const c of SWIPE_CARDS) expect(typeof c.flavor.sweet).toBe("number");
  });

  it("is bigger than the deck, so selection has something to choose between", () => {
    expect(SWIPE_CARDS.length).toBeGreaterThan(CALIBRATION_LENGTH);
  });
});

describe("a named reason beats a guessed one", () => {
  it("blames the axis the diner actually named", () => {
    // "Too rich" says which part was wrong. The blame heuristic exists for
    // "not feeling it", where nobody said — using it on a stated reason would
    // be re-deriving an answer we were handed.
    const v = neutralVector();
    const dish = vec({ heat: 0.95, rich: 0.85 });
    // Left to itself the heuristic blames heat, the louder claim.
    expect(DIMS.filter((d) => nudge(v, dish, false, 0.4)[d] !== 0.5)).toEqual(["heat"]);
    // Told the reason, it blames rich.
    expect(DIMS.filter((d) => nudge(v, dish, false, 0.4, "rich")[d] !== 0.5)).toEqual(["rich"]);
  });

  it("ignores a named axis the dish never claimed", () => {
    // Saying "too rich" about something with no opinion on richness is not
    // evidence about richness.
    const v = neutralVector();
    const after = nudge(v, vec({ heat: 0.95 }), false, 0.4, "rich");
    expect(after.rich).toBe(0.5);
    expect(after.heat).not.toBe(0.5);
  });
});
