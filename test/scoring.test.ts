import { describe, expect, it } from "vitest";
import type { Context } from "@/lib/context";
import { Place, SEED_PLACES } from "@/lib/data/seed";
import { vec } from "@/lib/flavor";
import { defaultProfile } from "@/lib/profile-shape";
import { recommend } from "@/lib/scoring";
import { parseCravingLocal } from "@/lib/craving";

// THE SCORE-SUM INVARIANT IS A PUBLIC CLAIM. The pick card literally prints
// "N terms · sums to match" beside the ring, so any pick whose bars do not add
// up to its own number is the UI lying to the user. It held by luck until
// recently — the old code CLAMPED at 99, which silently broke the claim for any
// pick whose terms exceeded it. These tests exist so it can never regress
// quietly again.

const CTX: Context = {
  hourSg: 12,
  mealPeriod: "lunch",
  raining: false,
  forecast: null,
};
const ORIGIN = { lat: 1.2841, lng: 103.8515 };

function sumOf(b: object): number {
  return Object.values(b).reduce((a: number, c) => a + (c as number), 0);
}

describe("score-sum invariant", () => {
  it("every pick's breakdown sums to its displayed match score", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const rec = recommend(profile, SEED_PLACES, CTX, ORIGIN);
    expect(rec).not.toBeNull();
    for (const pick of [rec!.best, rec!.safer, rec!.adventurous]) {
      if (!pick) continue;
      expect(sumOf(pick.breakdown)).toBe(pick.matchScore);
    }
  });

  it("holds when a craving pushes the raw total past the 99 the ring can draw", () => {
    // Standing on Wingstop's doorstep, craving wings, with a palate that IS
    // Wingstop's flavour profile. Without scaling the bars sum past the ring.
    const wingstop = SEED_PLACES.find((p) => p.id === "wingstop-marina")!;
    const profile = {
      ...defaultProfile(),
      maxKm: 50,
      priceMax: 4 as const,
      vector: vec(wingstop.flavor),
    };
    const rec = recommend(
      profile,
      SEED_PLACES,
      CTX,
      { lat: wingstop.lat, lng: wingstop.lng },
      [],
      parseCravingLocal("wings"),
    );
    expect(rec!.best.place.id).toBe("wingstop-marina");
    expect(rec!.best.matchScore).toBe(99);
    expect(sumOf(rec!.best.breakdown)).toBe(99);
  });

  it("holds at the FLOOR too, where a clamp used to lie", () => {
    // The mirror of the overflow case, and it was a live bug the moment the
    // palate term stopped handing every candidate a free ~28 points: asking
    // for "not spicy" within 2 km put Mala Xiang Guo's terms at −1, and the
    // card displayed a 1 with bars adding up to −1 beside it.
    //
    // The −34 avoid penalty is scaled back to whatever makes the row land on
    // exactly 1, so the ring and the bars agree at the bottom of the range the
    // same way they do at the top.
    const profile = {
      ...defaultProfile(),
      maxKm: 2,
      priceMax: 4 as const,
      vector: vec({ heat: 0.7, soupy: 0.9, rich: 0.8 }),
    };
    const rec = recommend(profile, SEED_PLACES, CTX, ORIGIN, [], parseCravingLocal("not spicy"));
    expect(rec).not.toBeNull();

    const floored = [rec!.best, rec!.safer, rec!.adventurous].filter(
      (p): p is NonNullable<typeof p> => p?.matchScore === 1,
    );
    expect(floored.length, "expected a pick pinned to the floor").toBeGreaterThan(0);
    for (const pick of floored) {
      expect(sumOf(pick.breakdown)).toBe(1);
      // Scaled, not clamped: the penalty was pulled in from its full −34.
      expect(pick.breakdown.craving).toBeLessThan(0);
      expect(pick.breakdown.craving).toBeGreaterThan(-34);
    }
  });

  it("holds across many profile/craving combinations", () => {
    const cravings = ["", "wings", "salad", "noodles", "spicy", "not spicy", "sushi", "rice"];
    const vectors = [
      vec({}),
      vec({ heat: 1, sweet: 1, soupy: 1, fried: 1, rich: 1, adventure: 1 }),
      vec({ heat: 0, sweet: 0, soupy: 0, fried: 0, rich: 0, adventure: 0 }),
      vec({ heat: 0.7, soupy: 0.9, rich: 0.8 }),
    ];
    for (const c of cravings) {
      for (const v of vectors) {
        for (const maxKm of [0.5, 2, 50]) {
          const profile = { ...defaultProfile(), vector: v, maxKm, priceMax: 4 as const };
          const rec = recommend(
            profile,
            SEED_PLACES,
            CTX,
            ORIGIN,
            [],
            c ? parseCravingLocal(c) : null,
          );
          if (!rec) continue;
          for (const pick of [rec.best, rec.safer, rec.adventurous]) {
            if (!pick) continue;
            expect(
              sumOf(pick.breakdown),
              `craving="${c}" maxKm=${maxKm} place=${pick.place.name}`,
            ).toBe(pick.matchScore);
            expect(pick.matchScore).toBeGreaterThanOrEqual(1);
            expect(pick.matchScore).toBeLessThanOrEqual(99);
          }
        }
      }
    }
  });
});

describe("a craving outranks the learned palate", () => {
  // The whole reason the feature exists: if the profile can overrule what the
  // user typed, the app argues with them.
  it("beats a profile that prefers something else entirely", () => {
    const soupLover = {
      ...defaultProfile(),
      maxKm: 50,
      vector: vec({ soupy: 0.95, heat: 0.8, rich: 0.8, fried: 0.05 }),
    };
    const plain = recommend(soupLover, SEED_PLACES, CTX, ORIGIN);
    const asked = recommend(soupLover, SEED_PLACES, CTX, ORIGIN, [], parseCravingLocal("salad"));
    expect(plain!.best.place.name).not.toMatch(/salad/i);
    expect(asked!.best.place.name).toMatch(/salad/i);
  });

  it("reports no hit rather than inventing one when nothing matches", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const plain = recommend(profile, SEED_PLACES, CTX, ORIGIN)!;
    const rec = recommend(profile, SEED_PLACES, CTX, ORIGIN, [], parseCravingLocal("tacos"))!;
    expect(rec.best.cravingHit).toBeNull();
    // Zero, NOT a penalty. An unmatched craving must fall back to the palate
    // quietly — penalising every place equally changes no ranking and would
    // print a negative bar on a pick whose only fault is that this street does
    // not sell tacos. This assertion is the record of that decision.
    expect(rec.best.breakdown.craving).toBe(0);
    expect(rec.best.place.id).toBe(plain.best.place.id);
  });

  it("penalises a place that contains something explicitly refused", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const craving = parseCravingLocal("no chicken");
    expect(craving.avoid).toContain("chicken");
    const rec = recommend(profile, SEED_PLACES, CTX, ORIGIN, [], craving)!;
    expect(rec.best.place.name.toLowerCase()).not.toContain("chicken");
  });
});

describe("saved posts", () => {
  const savedPlace: Place = {
    ...SEED_PLACES[0],
    id: "g-saved-1",
    name: "Saved From A Video",
    wantToTry: true,
  };

  it("earns a real boost over an identical place you never saved", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const twin: Place = { ...savedPlace, id: "g-twin", name: "Same But Unsaved", wantToTry: false };
    const rec = recommend(profile, [savedPlace, twin], CTX, ORIGIN);
    expect(rec!.best.place.id).toBe("g-saved-1");
    expect(rec!.best.breakdown.saved).toBeGreaterThan(0);
  });

  it("does not break the sum invariant", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const rec = recommend(profile, [savedPlace, ...SEED_PLACES], CTX, ORIGIN);
    expect(sumOf(rec!.best.breakdown)).toBe(rec!.best.matchScore);
  });
});

describe("hard filters", () => {
  it("never returns a closed place", () => {
    const midnight: Context = { ...CTX, hourSg: 3, mealPeriod: "supper" };
    const profile = { ...defaultProfile(), maxKm: 50 };
    const rec = recommend(profile, SEED_PLACES, midnight, ORIGIN);
    if (!rec) return;
    for (const pick of [rec.best, rec.safer, rec.adventurous]) {
      if (!pick) continue;
      const { openHour: o, closeHour: c } = pick.place;
      const open = c > o ? 3 >= o && 3 < c : 3 >= o || 3 < c;
      expect(open, `${pick.place.name} is shut at 03:00`).toBe(true);
    }
  });

  it("never returns a place over the budget ceiling", () => {
    const profile = { ...defaultProfile(), maxKm: 50, priceMax: 1 as const };
    const rec = recommend(profile, SEED_PLACES, CTX, ORIGIN);
    if (!rec) return;
    for (const pick of [rec.best, rec.safer, rec.adventurous]) {
      if (!pick) continue;
      expect(pick.place.priceLevel).toBeLessThanOrEqual(1);
    }
  });

  it("honours the exclude list, which is what 'not feeling it' relies on", () => {
    const profile = { ...defaultProfile(), maxKm: 50 };
    const first = recommend(profile, SEED_PLACES, CTX, ORIGIN)!;
    const second = recommend(profile, SEED_PLACES, CTX, ORIGIN, [first.best.place.id])!;
    expect(second.best.place.id).not.toBe(first.best.place.id);
  });
});

describe("the repeat penalty sees through the label", () => {
  const profileAt = (recent: { placeId: string; cuisine: string; at: number }[]) => ({
    ...defaultProfile(),
    maxKm: 50,
    recent,
  });
  const scoreOf = (p: ReturnType<typeof profileAt>, id: string) => {
    const seen: string[] = [];
    for (let i = 0; i < SEED_PLACES.length; i += 1) {
      const rec = recommend(p, SEED_PLACES, CTX, ORIGIN, seen);
      if (!rec) break;
      for (const s of [rec.best, rec.safer, rec.adventurous]) {
        if (s && !seen.includes(s.place.id)) {
          if (s.place.id === id) return s.matchScore;
          seen.push(s.place.id);
        }
      }
    }
    return null;
  };

  it("damps a place whose FAMILY you ate yesterday, across the two tiers", () => {
    // A curated place says "japanese"; a live Google one said
    // "japanese_restaurant". Exact-string comparison could never connect them,
    // so the app would happily send you for Japanese two days running.
    const sushi = SEED_PLACES.find((p) => p.cuisine === "japanese")!;
    const fresh = scoreOf(profileAt([]), sushi.id);
    const afterRamen = scoreOf(
      // "ramen" is a different cuisine in the SAME family as "japanese".
      profileAt([{ placeId: "somewhere-else", cuisine: "ramen", at: Date.now() - 3 * 60 * 60 * 1000 }]),
      sushi.id,
    );
    expect(fresh).not.toBeNull();
    expect(afterRamen).not.toBeNull();
    expect(afterRamen!).toBeLessThan(fresh!);
  });

  it("hits the SAME cuisine harder than merely the same family", () => {
    const sushi = SEED_PLACES.find((p) => p.cuisine === "japanese")!;
    const hoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const sameFamily = scoreOf(profileAt([{ placeId: "x", cuisine: "ramen", at: hoursAgo }]), sushi.id);
    const sameCuisine = scoreOf(profileAt([{ placeId: "x", cuisine: "japanese", at: hoursAgo }]), sushi.id);
    expect(sameCuisine!).toBeLessThan(sameFamily!);
  });

  it("does not treat two unrelated cuisines as a repeat", () => {
    const sushi = SEED_PLACES.find((p) => p.cuisine === "japanese")!;
    const fresh = scoreOf(profileAt([]), sushi.id);
    const afterThai = scoreOf(
      profileAt([{ placeId: "x", cuisine: "thai", at: Date.now() - 3 * 60 * 60 * 1000 }]),
      sushi.id,
    );
    expect(afterThai).toBe(fresh);
  });
});
