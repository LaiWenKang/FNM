import { describe, expect, it } from "vitest";
import { MOODS, applyMoods, isValidMood } from "@/lib/mood";
import { DIMS, vec } from "@/lib/flavor";
import { defaultProfile } from "@/lib/profile-shape";

// A mood is the app's fastest input — one tap, before any swiping — and it is
// now also what tells the cold-start path that the diner HAS said something.
// That makes its two guarantees load-bearing: it must change this request, and
// it must not change the stored profile.

const base = () => ({ ...defaultProfile(), vector: vec({ heat: 0.5, rich: 0.5 }) });

describe("the mood list", () => {
  it("accepts every id it ships and rejects anything else", () => {
    for (const m of MOODS) expect(isValidMood(m.id)).toBe(true);
    expect(isValidMood("spicyy")).toBe(false);
    expect(isValidMood("")).toBe(false);
    expect(isValidMood("__proto__")).toBe(false);
  });

  it("has no duplicate ids", () => {
    expect(new Set(MOODS.map((m) => m.id)).size).toBe(MOODS.length);
  });

  it("gives every mood a label and a drawn glyph", () => {
    // "never a raster emoji" is a stated design rule; a missing glyph key
    // renders as a hole in the mood card.
    for (const m of MOODS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.glyph.length).toBeGreaterThan(0);
    }
  });
});

describe("applying a mood", () => {
  it("never mutates the stored profile", () => {
    /* THE ONE THAT MATTERS MOST. Moods adjust THIS request only — the comment
       at the top of lib/mood.ts promises it. A shared object reference here
       would quietly write "I fancy soup today" into the permanent palate, and
       the corruption would be invisible until the profile stopped making
       sense weeks later. */
    const p = base();
    const before = JSON.stringify(p);
    const after = applyMoods(p, ["spicy", "soupy", "cheap", "nearby"]);
    expect(JSON.stringify(p)).toBe(before);
    expect(after.vector).not.toBe(p.vector);
  });

  it("returns the profile untouched for no moods", () => {
    const p = base();
    expect(applyMoods(p, []).vector).toEqual(p.vector);
  });

  it("ignores an unknown id instead of throwing", () => {
    // The id arrives from a query string, so it is user input.
    const p = base();
    expect(applyMoods(p, ["nonsense", "spicy"]).vector.heat).toBe(0.85);
  });

  it("raises heat for spicy, and never lowers it", () => {
    // A chilli-head who taps SPICY must not be turned DOWN to 0.85.
    expect(applyMoods(base(), ["spicy"]).vector.heat).toBe(0.85);
    const hot = { ...base(), vector: vec({ heat: 0.98 }) };
    expect(applyMoods(hot, ["spicy"]).vector.heat).toBe(0.98);
  });

  it("pulls rich and fried down for light, and never up", () => {
    const p = applyMoods(base(), ["light"]);
    expect(p.vector.rich).toBe(0.15);
    expect(p.vector.fried).toBe(0.1);
    const ascetic = { ...base(), vector: vec({ rich: 0.02, fried: 0.02 }) };
    expect(applyMoods(ascetic, ["light"]).vector.rich).toBe(0.02);
  });

  it("raises soupy for soupy", () => {
    expect(applyMoods(base(), ["soupy"]).vector.soupy).toBe(0.9);
  });

  it("makes comfort rich AND unadventurous", () => {
    // Comfort food is not just heavy — it is familiar. Missing the adventure
    // half would recommend a rich dish nobody has heard of.
    const p = applyMoods(base(), ["comfort"]);
    expect(p.vector.rich).toBe(0.75);
    expect(p.vector.adventure).toBe(0.25);
  });

  it("moves budget and distance, not flavour, for cheap and nearby", () => {
    const p = applyMoods(base(), ["cheap", "nearby"]);
    expect(p.priceMax).toBe(1);
    expect(p.maxKm).toBe(0.8);
    expect(p.vector).toEqual(base().vector);
  });

  it("never widens a limit the user already set tighter", () => {
    // "Super close" on a profile already capped at 500 m must not relax it.
    const tight = { ...base(), maxKm: 0.4 };
    expect(applyMoods(tight, ["nearby"]).maxKm).toBe(0.4);
  });

  it("maxes adventure for surprise, overriding a timid profile", () => {
    // Unlike the others this one is a deliberate OVERRIDE, not a bound: asking
    // to be surprised is asking to be taken out of your usual range.
    const timid = { ...base(), vector: vec({ adventure: 0.05 }) };
    expect(applyMoods(timid, ["surprise"]).vector.adventure).toBe(0.95);
    const bold = { ...base(), vector: vec({ adventure: 1 }) };
    expect(applyMoods(bold, ["surprise"]).vector.adventure).toBe(0.95);
  });

  it("stacks moods that do not conflict", () => {
    const p = applyMoods(base(), ["spicy", "soupy", "cheap"]);
    expect(p.vector.heat).toBe(0.85);
    expect(p.vector.soupy).toBe(0.9);
    expect(p.priceMax).toBe(1);
  });

  it("resolves a contradictory pair without producing a broken vector", () => {
    // Nothing stops a user tapping LIGHT and COMFORT. Last writer wins is a
    // fine answer; an out-of-range value is not.
    const p = applyMoods(base(), ["light", "comfort"]);
    for (const d of DIMS) {
      expect(p.vector[d]).toBeGreaterThanOrEqual(0);
      expect(p.vector[d]).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every axis in range for every single mood", () => {
    for (const m of MOODS) {
      for (const start of [0, 0.5, 1]) {
        const p = applyMoods(
          { ...base(), vector: vec(Object.fromEntries(DIMS.map((d) => [d, start]))) },
          [m.id],
        );
        for (const d of DIMS) {
          expect(p.vector[d]).toBeGreaterThanOrEqual(0);
          expect(p.vector[d]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("is order-independent for bound-style moods", () => {
    const a = applyMoods(base(), ["spicy", "soupy"]).vector;
    const b = applyMoods(base(), ["soupy", "spicy"]).vector;
    expect(a).toEqual(b);
  });
});
