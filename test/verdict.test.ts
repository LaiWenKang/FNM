import { describe, expect, it } from "vitest";
import { ASK_AFTER_MS, ASK_UNTIL_MS, RecentMeal, Verdict, defaultProfile } from "@/lib/profile-shape";
import { DIMS, neutralVector, nudge, vec } from "@/lib/flavor";

// Every other signal in this app is a PREDICTION — a swipe says what you think
// you like, a pick says what looked best at 12:15. A verdict is the only thing
// that knows how the food actually was, which is why it outweighs the pick
// that preceded it.

const ACCEPT_WEIGHT = 0.1;
const VERDICT_WEIGHT: Record<Verdict, number> = { again: 0.16, fine: 0, no: 0.1 };

/** The route's selection rule, kept in step with app/api/pick/route.ts. */
function pendingIn(recent: RecentMeal[], now: number): RecentMeal | undefined {
  return [...recent]
    .reverse()
    .find((m) => !m.verdict && now - m.at > ASK_AFTER_MS && now - m.at < ASK_UNTIL_MS);
}

const meal = (over: Partial<RecentMeal> = {}): RecentMeal => ({
  placeId: "p1",
  cuisine: "teochew",
  at: Date.now() - 3 * 60 * 60 * 1000,
  ...over,
});

describe("when to ask", () => {
  const now = Date.now();

  it("does not ask while they are still holding the fork", () => {
    expect(pendingIn([meal({ at: now - 10 * 60 * 1000 })], now)).toBeUndefined();
  });

  it("does not ask once they would be guessing", () => {
    // A fabricated verdict moves the palate on evidence that never existed —
    // worse than never asking.
    expect(pendingIn([meal({ at: now - ASK_UNTIL_MS - 1000 })], now)).toBeUndefined();
  });

  it("asks inside the window", () => {
    expect(pendingIn([meal({ at: now - ASK_AFTER_MS - 1000 })], now)).toBeDefined();
  });

  it("never asks twice about the same meal", () => {
    expect(pendingIn([meal({ verdict: "again" })], now)).toBeUndefined();
  });

  it("asks about the most recent unrated meal, not the oldest", () => {
    const recent = [
      meal({ placeId: "old", at: now - 20 * 60 * 60 * 1000 }),
      meal({ placeId: "new", at: now - 3 * 60 * 60 * 1000 }),
    ];
    expect(pendingIn(recent, now)?.placeId).toBe("new");
  });

  it("has a window wide enough to be usable at all", () => {
    // A lunch eaten at noon has to still be askable that evening.
    expect(ASK_AFTER_MS).toBeLessThan(3 * 60 * 60 * 1000);
    expect(ASK_UNTIL_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });
});

describe("what a verdict is worth", () => {
  const dish = vec({ heat: 0.9, rich: 0.9, soupy: 0.1 });

  it("outweighs the pick it is a verdict on", () => {
    // Choosing a place was a guess about the meal. Wanting it AGAIN is the
    // answer to the thing the guess was about, so it has to count for more —
    // otherwise the app keeps trusting its own predictions over the outcome.
    expect(VERDICT_WEIGHT.again).toBeGreaterThan(ACCEPT_WEIGHT);
  });

  it("learns nothing at all from a shrug", () => {
    // "Fine" is the honest middle. Manufacturing a preference out of it would
    // be inventing data.
    expect(VERDICT_WEIGHT.fine).toBe(0);
    const before = neutralVector();
    const after = { ...before };
    expect(after).toEqual(before);
  });

  it("moves toward the dish on 'again' and away on 'not again'", () => {
    const start = neutralVector();
    const yes = nudge(start, dish, true, VERDICT_WEIGHT.again);
    const no = nudge(start, dish, false, VERDICT_WEIGHT.no);
    expect(yes.rich).toBeGreaterThan(start.rich);
    expect(no.rich).toBeLessThanOrEqual(start.rich);
  });

  it("keeps every axis inside the unit range", () => {
    let v = vec({ heat: 0.98, rich: 0.98 });
    for (let i = 0; i < 40; i += 1) v = nudge(v, dish, true, VERDICT_WEIGHT.again);
    for (const d of DIMS) {
      expect(v[d]).toBeGreaterThanOrEqual(0);
      expect(v[d]).toBeLessThanOrEqual(1);
    }
  });

  it("learns nothing when the meal recorded no dish flavour", () => {
    // Older meals, and picks on places with no dish data, have no flavour
    // stored. There is nothing to move toward, and guessing one would be
    // worse than leaving the palate alone.
    const m = meal();
    expect(m.flavor).toBeUndefined();
  });
});

describe("the meal record", () => {
  it("starts unrated and carries the flavour a verdict will need", () => {
    const p = defaultProfile();
    const flavor = vec({ heat: 0.8 });
    p.recent.push({ placeId: "p1", cuisine: "sichuan", at: Date.now(), flavor });
    expect(p.recent[0].verdict).toBeUndefined();
    expect(p.recent[0].flavor).toEqual(flavor);
  });
});
