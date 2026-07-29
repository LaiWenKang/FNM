import { describe, expect, it } from "vitest";
import type { Context } from "@/lib/context";
import { SEED_PLACES } from "@/lib/data/seed";
import { vec } from "@/lib/flavor";
import { Group, MEAN_W, MIN_W, Member, decideForGroup, groupVector, normalizeCode } from "@/lib/group";

// The group blend is the least obvious maths in the product and the easiest to
// break silently — a wrong weight still returns a plausible-looking restaurant.
// These tests pin the two failure modes it exists to sit between.

const CTX: Context = { hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null };

function member(id: string, name: string, v: Parameters<typeof vec>[0], over: Partial<Member> = {}): Member {
  return {
    id,
    name,
    vector: vec(v),
    maxKm: 50,
    priceMax: 4,
    seeded: true,
    joinedAt: 0,
    ...over,
  };
}

function group(members: Member[]): Group {
  return {
    code: "ABC123",
    createdAt: Date.now(),
    lat: 1.2841,
    lng: 103.8515,
    label: "Raffles Place",
    hour: 12,
    members,
    decidedPlaceId: null,
  };
}

describe("the group blend", () => {
  it("is exactly mean and minimum in the stated proportion", () => {
    const g = group([
      member("a", "A", { soupy: 0.9, heat: 0.8 }),
      member("b", "B", { rich: 0.2, fried: 0.1 }),
    ]);
    const picks = decideForGroup(g, SEED_PLACES, CTX);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.groupScore).toBe(Math.round(MEAN_W * p.meanScore + MIN_W * p.minScore));
    }
  });

  it("prefers the higher FLOOR when two candidates tie on the mean", () => {
    // The whole point. A candidate one member hates must lose to an equally
    // average one nobody hates.
    const g = group([
      member("a", "A", { soupy: 0.95, heat: 0.85, fried: 0.05 }),
      member("b", "B", { rich: 0.1, fried: 0.05, soupy: 0.1 }),
    ]);
    const picks = decideForGroup(g, SEED_PLACES, CTX);
    for (let i = 1; i < picks.length; i += 1) {
      if (picks[i - 1].meanScore === picks[i].meanScore) {
        expect(picks[i - 1].minScore).toBeGreaterThanOrEqual(picks[i].minScore);
      }
    }
  });

  it("names the member the pick serves worst", () => {
    const g = group([
      member("a", "Mei", { soupy: 0.95, heat: 0.9 }),
      member("b", "Raj", { rich: 0.1, fried: 0.05 }),
    ]);
    const [top] = decideForGroup(g, SEED_PLACES, CTX);
    const worst = [...top.perMember].sort((x, y) => x.score - y.score)[0];
    expect(top.weakestMemberName).toBe(worst.name);
    expect(top.minScore).toBe(worst.score);
  });

  it("ranks strictly by the blend", () => {
    const g = group([member("a", "A", { heat: 0.7 }), member("b", "B", { soupy: 0.7 })]);
    const picks = decideForGroup(g, SEED_PLACES, CTX);
    for (let i = 1; i < picks.length; i += 1) {
      expect(picks[i - 1].groupScore).toBeGreaterThanOrEqual(picks[i].groupScore);
    }
  });
});

describe("constraints are not averaged", () => {
  it("applies the STRICTEST distance ceiling to everyone", () => {
    // Somebody who said 800 m must not be walked 2 km because four other
    // people were relaxed about it.
    const g = group([
      member("a", "Near", {}, { maxKm: 0.3 }),
      member("b", "Far", {}, { maxKm: 50 }),
    ]);
    const picks = decideForGroup(g, SEED_PLACES, CTX);
    for (const p of picks) {
      const dx = p.place.lat - g.lat;
      const dy = p.place.lng - g.lng;
      expect(Math.sqrt(dx * dx + dy * dy) * 111).toBeLessThanOrEqual(0.31);
    }
  });

  it("applies the STRICTEST budget ceiling to everyone", () => {
    const g = group([
      member("a", "Hawker", {}, { priceMax: 1 }),
      member("b", "Anything", {}, { priceMax: 4 }),
    ]);
    for (const p of decideForGroup(g, SEED_PLACES, CTX)) {
      expect(p.place.priceLevel).toBeLessThanOrEqual(1);
    }
  });

  it("only offers candidates every voter can actually reach", () => {
    const g = group([
      member("a", "A", { heat: 0.9 }),
      member("b", "B", { soupy: 0.9 }),
      member("c", "C", { rich: 0.2 }),
    ]);
    for (const p of decideForGroup(g, SEED_PLACES, CTX)) {
      expect(p.perMember).toHaveLength(3);
    }
  });
});

describe("who counts as a voter", () => {
  it("excludes members with no palate instead of counting them as neutral", () => {
    // Counting an unseeded member as neutral drags every candidate toward the
    // middle — the exact bland-centroid failure the blend exists to avoid.
    const g = group([
      member("a", "Seeded", { heat: 0.9, fried: 0.8 }),
      member("b", "Empty", {}, { seeded: false }),
    ]);
    const picks = decideForGroup(g, SEED_PLACES, CTX);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.perMember.map((m) => m.name)).toEqual(["Seeded"]);
    }
  });

  it("returns nothing when nobody has a palate, rather than guessing", () => {
    const g = group([member("a", "A", {}, { seeded: false })]);
    expect(decideForGroup(g, SEED_PLACES, CTX)).toHaveLength(0);
  });

  it("keeps unseeded members out of the group vector too", () => {
    const hot = member("a", "A", { heat: 1 });
    const empty = member("b", "B", { heat: 0 }, { seeded: false });
    expect(groupVector([hot, empty]).heat).toBe(1);
  });
});

describe("codes", () => {
  it("normalises what someone reads aloud across a table", () => {
    expect(normalizeCode(" abc-123 ")).toBe("ABC123");
    expect(normalizeCode("a b c 1 2 3")).toBe("ABC123");
  });
  it("truncates rather than accepting an over-long code", () => {
    expect(normalizeCode("ABCDEFGHIJ")).toHaveLength(6);
  });
});
