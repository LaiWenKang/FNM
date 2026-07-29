import { beforeEach, describe, expect, it } from "vitest";
import type { Context } from "@/lib/context";
import { SEED_PLACES } from "@/lib/data/seed";
import {
  FULL_TILT_AT,
  HALF_LIFE_MS,
  MAX_TILT,
  clearMemoryLedger,
  debts,
  recordMeal,
  weightFor,
} from "@/lib/fairness";
import { vec } from "@/lib/flavor";
import { Group, MEAN_W, MIN_W, Member, decideForGroup } from "@/lib/group";

// The group blend has no memory, so with the same five people every Tuesday it
// re-derives the same least-happy person every week and calls it optimal. These
// tests are about the memory.

const CTX: Context = { hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null };

function member(id: string, name: string, v: Parameters<typeof vec>[0], over: Partial<Member> = {}): Member {
  return { id, name, vector: vec(v), maxKm: 50, priceMax: 4, seeded: true, joinedAt: 0, ...over };
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

beforeEach(() => clearMemoryLedger());

describe("the ledger", () => {
  it("measures a shortfall against the meal's own average, not an absolute score", async () => {
    // A meal where everybody scored badly is not unfair to anyone — it was a
    // thin day for options. What counts is doing worse than the people you
    // were standing next to.
    await recordMeal([
      { memberId: "x", score: 30 },
      { memberId: "y", score: 30 },
    ]);
    expect((await debts(["x", "y"])).x).toBe(0);

    clearMemoryLedger();
    await recordMeal([
      { memberId: "x", score: 95 },
      { memberId: "y", score: 65 },
    ]);
    // Sixty-five is a good score in absolute terms and still a raw deal today.
    expect((await debts(["x", "y"])).y).toBeGreaterThan(0);
  });

  it("records who was served worse than the group that day", async () => {
    await recordMeal([
      { memberId: "a", score: 80 },
      { memberId: "b", score: 40 },
    ]);
    const owed = await debts(["a", "b"]);
    expect(owed.b).toBeGreaterThan(0);
    expect(owed.a).toBe(0);
  });

  it("does not turn being well served into a penalty", async () => {
    // A credit is not a debt. The best-matched member should stop being owed
    // anything, not come to dread their own turn coming round.
    await recordMeal([
      { memberId: "a", score: 90 },
      { memberId: "b", score: 30 },
    ]);
    const owed = await debts(["a", "b"]);
    expect(owed.a).toBe(0);
    expect(owed.a).not.toBeLessThan(0);
  });

  it("ignores a meal nobody could have been short-changed at", async () => {
    await recordMeal([{ memberId: "a", score: 10 }]);
    expect((await debts(["a"])).a).toBe(0);
  });

  it("treats an equal meal as owing nobody anything", async () => {
    await recordMeal([
      { memberId: "a", score: 60 },
      { memberId: "b", score: 60 },
    ]);
    const owed = await debts(["a", "b"]);
    expect(owed.a).toBe(0);
    expect(owed.b).toBe(0);
  });

  it("lets a slight fade — last Tuesday counts, March does not", async () => {
    const now = Date.now();
    await recordMeal([{ memberId: "a", score: 80 }, { memberId: "old", score: 20 }], now - HALF_LIFE_MS);
    const faded = (await debts(["old"], now)).old;
    clearMemoryLedger();
    await recordMeal([{ memberId: "a", score: 80 }, { memberId: "old", score: 20 }], now);
    const fresh = (await debts(["old"], now)).old;
    expect(faded).toBeCloseTo(fresh / 2, 1);
  });

  it("accumulates across repeated meals", async () => {
    const now = Date.now();
    await recordMeal([{ memberId: "a", score: 80 }, { memberId: "b", score: 50 }], now);
    const one = (await debts(["b"], now)).b;
    await recordMeal([{ memberId: "a", score: 80 }, { memberId: "b", score: 50 }], now);
    expect((await debts(["b"], now)).b).toBeGreaterThan(one);
  });
});

describe("how loud a debt makes you", () => {
  it("changes nothing for someone owed nothing", () => {
    expect(weightFor(0)).toBe(1);
  });

  it("rises with the debt but never becomes a veto", () => {
    // Fairness rotation should tilt a close call toward whoever keeps losing
    // them, not hand one person control — that just relocates the unfairness.
    expect(weightFor(FULL_TILT_AT / 2)).toBeGreaterThan(1);
    expect(weightFor(FULL_TILT_AT)).toBeCloseTo(1 + MAX_TILT, 5);
    expect(weightFor(FULL_TILT_AT * 100)).toBeCloseTo(1 + MAX_TILT, 5);
  });
});

describe("the rotation, applied", () => {
  const crew = () => group([member("a", "Mei", { soupy: 0.95, heat: 0.9 }), member("b", "Raj", { rich: 0.15, fried: 0.05 })]);

  it("changes nothing on a group's first decision", () => {
    const g = crew();
    expect(decideForGroup(g, SEED_PLACES, CTX, {})).toEqual(decideForGroup(g, SEED_PLACES, CTX));
  });

  it("raises the score of what the owed member wants", () => {
    const g = crew();
    const before = decideForGroup(g, SEED_PLACES, CTX);
    const after = decideForGroup(g, SEED_PLACES, CTX, { b: FULL_TILT_AT });

    // Find a place Raj likes much more than Mei and check it gained ground.
    const rajsFavourite = before
      .filter((p) => p.perMember.length === 2)
      .sort((x, y) => {
        const dx = x.perMember.find((m) => m.id === "b")!.score - x.perMember.find((m) => m.id === "a")!.score;
        const dy = y.perMember.find((m) => m.id === "b")!.score - y.perMember.find((m) => m.id === "a")!.score;
        return dy - dx;
      })[0];
    const was = before.find((p) => p.place.id === rajsFavourite.place.id)!;
    const now = after.find((p) => p.place.id === rajsFavourite.place.id)!;
    expect(now.meanScore).toBeGreaterThan(was.meanScore);
  });

  it("actually reorders close calls, rather than being cosmetic", () => {
    // The point of the whole feature. Two candidates a few points apart, one
    // suiting each member: owing Mei a turn has to be enough to swap them, or
    // the rotation is a label on a screen and nothing more.
    const g = group([
      member("a", "Mei", { soupy: 0.95, heat: 0.9 }),
      member("b", "Raj", { fried: 0.9, rich: 0.85, soupy: 0.05 }),
    ]);
    const rank = (picks: ReturnType<typeof decideForGroup>, id: string) =>
      picks.findIndex((p) => p.place.id === id);
    const before = decideForGroup(g, SEED_PLACES, CTX);
    const after = decideForGroup(g, SEED_PLACES, CTX, { a: FULL_TILT_AT });

    // Thai (soupy, spicy — Mei's) against Wingstop (fried — Raj's).
    expect(rank(before, "boat-quay-thai")).toBeGreaterThan(rank(before, "wingstop-marina"));
    expect(rank(after, "boat-quay-thai")).toBeLessThan(rank(after, "wingstop-marina"));
  });

  it("does not overturn a clear winner", () => {
    // A rotation tilts close calls. If one place is genuinely best for the
    // group, owing somebody a turn is not a reason to inflict a worse lunch on
    // everyone else.
    const g = crew();
    const before = decideForGroup(g, SEED_PLACES, CTX);
    const clear = before[0].groupScore - before[1].groupScore;
    if (clear < 4) return; // no clear winner in this catalogue; nothing to assert
    const after = decideForGroup(g, SEED_PLACES, CTX, { b: FULL_TILT_AT });
    expect(after[0].place.id).toBe(before[0].place.id);
  });

  it("keeps the group score reconcilable with what the card prints", () => {
    // The card shows the mean and the group score side by side. Weighting the
    // mean must not break the arithmetic a user can do on screen.
    for (const p of decideForGroup(crew(), SEED_PLACES, CTX, { b: 8 })) {
      expect(p.groupScore).toBe(Math.round(MEAN_W * p.meanScore + MIN_W * p.minScore));
    }
  });

  it("does not let a debt override a hard constraint", () => {
    // A rotation adjusts preference, never budget or distance. Owing somebody
    // a turn cannot walk the group past a limit somebody else set.
    const g = group([
      member("a", "Near", {}, { maxKm: 0.3 }),
      member("b", "Far", {}, { maxKm: 50 }),
    ]);
    for (const p of decideForGroup(g, SEED_PLACES, CTX, { b: 1000 })) {
      const dx = p.place.lat - g.lat;
      const dy = p.place.lng - g.lng;
      expect(Math.sqrt(dx * dx + dy * dy) * 111).toBeLessThanOrEqual(0.31);
    }
  });

  it("still excludes members who have shown no palate, however much they are owed", () => {
    const g = group([
      member("a", "Seeded", { heat: 0.9 }),
      member("b", "Empty", {}, { seeded: false }),
    ]);
    for (const p of decideForGroup(g, SEED_PLACES, CTX, { b: 1000 })) {
      expect(p.perMember.map((m) => m.name)).toEqual(["Seeded"]);
    }
  });
});
