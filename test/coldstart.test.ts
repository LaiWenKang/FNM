import { describe, expect, it } from "vitest";
import type { Context } from "@/lib/context";
import { SEED_PLACES } from "@/lib/data/seed";
import { neutralVector, palateFit, vec } from "@/lib/flavor";
import { defaultProfile } from "@/lib/profile-shape";
import { recommend } from "@/lib/scoring";
import { explain } from "@/lib/explain";

// THE FIRST PICK, BEFORE THE APP KNOWS ANYTHING.
//
// A brand-new diner could always reach a recommendation without swiping, and
// that is right — sixteen questions before your first lunch is the opposite of
// "near-zero input". What was wrong was what the score claimed on the way
// there: `palateFit` scored every place against the neutral vector and handed
// out a third of the ring for it, ranking by closeness to the exact midpoint of
// every axis. That is not an absence of information, it is wrong information,
// and it quietly favoured the blandest thing on the street.

const CTX: Context = { hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null };
const ORIGIN = { lat: 1.2841, lng: 103.8515 };

const sumOf = (b: object): number => Object.values(b).reduce((a: number, c) => a + (c as number), 0);

describe("the bias that was there", () => {
  it("scores wildly different food alike when the palate is neutral", () => {
    // Pinning the ORIGINAL behaviour, so the reason for the change stays
    // legible: 0.5 across the board is not a taste, and treating it as one
    // produced a 30-point spread out of nothing.
    const n = neutralVector();
    const points = SEED_PLACES.map((p) => Math.round(palateFit(n, p.flavor) * 54));
    const spread = Math.max(...points) - Math.min(...points);
    expect(spread).toBeGreaterThan(25);
  });
});

describe("a pick before calibration", () => {
  const cold = { ...defaultProfile(), maxKm: 50 };

  it("still returns a pick with zero swipes", () => {
    // The whole point. Nothing about being honest may cost a hungry person
    // their recommendation.
    expect(cold.swipeCount).toBe(0);
    expect(recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)).not.toBeNull();
  });

  it("gives every candidate the identical palate term", () => {
    // THE FIX. With nothing to tilt the ranking, the term must not tilt it.
    const rec = recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)!;
    const picks = [rec.best, rec.safer, rec.adventurous].filter(Boolean);
    const values = new Set(picks.map((p) => p!.breakdown.palate));
    expect(values.size).toBe(1);
  });

  it("does not drop the score to make the point", () => {
    // Zeroing the term would have scored a perfectly good first pick ~27 lower
    // than the identical pick tomorrow, which is its own kind of lie.
    const rec = recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)!;
    expect(rec.best.breakdown.palate).toBeGreaterThan(20);
  });

  it("keeps the bars summing to the ring exactly", () => {
    // The card prints "sums to match". That claim does not get a day off
    // because the diner is new.
    const rec = recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)!;
    for (const pick of [rec.best, rec.safer, rec.adventurous]) {
      if (!pick) continue;
      expect(sumOf(pick.breakdown)).toBe(pick.matchScore);
    }
  });

  it("does not claim to match a taste it has not been told", () => {
    const rec = recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)!;
    expect(rec.best.reasons[0]).not.toContain("your taste");
    expect(rec.best.reasons[0]).toContain("%");
  });

  it("does not claim a palate in the headline sentence either", async () => {
    /* CAUGHT ON THE PREVIEW DEPLOY, after the bar was already fixed. The
       explanation is generated separately and overrode the reason line, so the
       card still read "51% match for your BALANCED palate" — describeTaste
       reads the neutral vector as "balanced" and the sentence stated it as a
       finding. Worse than the bar it sits under, because it is prose, and
       prose sounds certain. */
    const rec = recommend(cold, SEED_PLACES, CTX, ORIGIN, [], null, false)!;
    const line = await explain(rec.best, cold, CTX, false);
    expect(line).not.toContain("palate");
    expect(line).toMatch(/\d+% match/);
  });

  it("still names the palate once there is one", async () => {
    const warm = { ...defaultProfile(), maxKm: 50, swipeCount: 16, vector: vec({ heat: 0.9 }) };
    const rec = recommend(warm, SEED_PLACES, CTX, ORIGIN)!;
    expect(await explain(rec.best, warm, CTX, true)).toContain("palate");
  });

  it("lets real evidence decide instead", () => {
    /* With the palate flat, the ranking has to come from the terms that are
       actually grounded — distance, hours, price, rating. A place on the
       doorstep should beat one across the island. */
    const near = SEED_PLACES[0];
    const far = { ...SEED_PLACES[1], id: "far-one", lat: near.lat + 0.3, lng: near.lng + 0.3 };
    const rec = recommend(
      cold,
      [{ ...near, id: "near-one" }, far],
      CTX,
      { lat: near.lat, lng: near.lng },
      [],
      null,
      false,
    )!;
    expect(rec.best.place.id).toBe("near-one");
  });
});

describe("what counts as having been told", () => {
  it("uses the real palate once there are swipes", () => {
    const warm = { ...defaultProfile(), maxKm: 50, swipeCount: 16, vector: vec({ heat: 0.9, rich: 0.85 }) };
    const rec = recommend(warm, SEED_PLACES, CTX, ORIGIN)!;
    const picks = [rec.best, rec.safer, rec.adventurous].filter(Boolean);
    const values = new Set(picks.map((p) => p!.breakdown.palate));
    // A calibrated palate SHOULD separate places. If this ever collapses to one
    // value, the cold-start path has swallowed the warm one.
    expect(values.size).toBeGreaterThan(1);
    expect(rec.best.reasons[0]).toContain("your taste");
  });

  it("treats a stated craving as a taste, even at zero swipes", () => {
    /* A craving is a sentence the diner typed. Telling them the palate is
       unknown while they are looking at the words they just wrote would be the
       app ignoring its most direct input — so the route counts a craving, and
       a mood tap, as having been told. This pins the CONTRACT the route
       depends on: passing palateKnown restores the real palate term. */
    const spicy = { ...defaultProfile(), maxKm: 50, vector: vec({ heat: 0.95 }) };
    const rec = recommend(spicy, SEED_PLACES, CTX, ORIGIN, [], null, true)!;
    const picks = [rec.best, rec.safer, rec.adventurous].filter(Boolean);
    expect(new Set(picks.map((p) => p!.breakdown.palate)).size).toBeGreaterThan(1);
  });

  it("defaults to trusting the palate, so no existing caller changes behaviour", () => {
    const warm = { ...defaultProfile(), maxKm: 50, swipeCount: 16, vector: vec({ heat: 0.9 }) };
    const withDefault = recommend(warm, SEED_PLACES, CTX, ORIGIN)!;
    const explicit = recommend(warm, SEED_PLACES, CTX, ORIGIN, [], null, true)!;
    expect(withDefault.best.matchScore).toBe(explicit.best.matchScore);
    expect(withDefault.best.place.id).toBe(explicit.best.place.id);
  });
});
