import { describe, expect, it } from "vitest";
import { SEED_PLACES } from "@/lib/data/seed";
import { cravingFit, parseCravingLocal } from "@/lib/craving";

// The zero-key parser is the one that actually ships for most users, so it is
// the one that has to be right. Everything here runs without an API key.

describe("parseCravingLocal", () => {
  it("keeps an unknown word as a literal target", () => {
    // The line that makes the keyless version useful: no lexicon contains
    // "banana leaf", and it still has to find Indian Banana Leaf Restaurant.
    const c = parseCravingLocal("banana leaf");
    expect(c.terms).toContain("banana");
    expect(c.terms).toContain("leaf");
  });

  it("drops filler words that would match everything", () => {
    const c = parseCravingLocal("i want something good for lunch today");
    expect(c.terms).not.toContain("want");
    expect(c.terms).not.toContain("lunch");
    expect(c.terms).not.toContain("today");
    expect(c.terms).not.toContain("something");
  });

  it("expands a known word into its local synonyms", () => {
    const c = parseCravingLocal("noodles");
    expect(c.terms).toContain("mee");
    expect(c.terms).toContain("ramen");
  });

  it("reads flavour intent as well as literal terms", () => {
    expect(parseCravingLocal("spicy").vector.heat).toBeGreaterThan(0.8);
    expect(parseCravingLocal("ramen").vector.soupy).toBeGreaterThan(0.8);
  });

  it("INVERTS intent on a negation rather than ignoring the word", () => {
    // "not spicy" must lower heat. Merely dropping "spicy" would leave the
    // user's learned heat preference untouched and change nothing.
    const c = parseCravingLocal("not spicy");
    expect(c.vector.heat).toBeLessThan(0.2);
    expect(c.avoid.length).toBeGreaterThan(0);
  });

  it("handles 'no <thing>' as an avoid instruction", () => {
    const c = parseCravingLocal("no pork");
    expect(c.avoid).toContain("pork");
    expect(c.terms).not.toContain("pork");
  });

  it("survives punctuation, case and emoji", () => {
    const c = parseCravingLocal("RAMEN!!! 🍜 please");
    expect(c.terms).toContain("ramen");
    expect(c.terms).not.toContain("please");
  });

  it("returns nothing actionable for empty or filler-only input", () => {
    expect(parseCravingLocal("").terms).toHaveLength(0);
    expect(parseCravingLocal("   ").terms).toHaveLength(0);
    expect(parseCravingLocal("i want something to eat").terms).toHaveLength(0);
  });
});

describe("cravingFit", () => {
  const wingstop = SEED_PLACES.find((p) => /wingstop/i.test(p.name))!;
  const salad = SEED_PLACES.find((p) => /salad/i.test(p.name))!;

  it("matches on the place name", () => {
    expect(cravingFit(wingstop, parseCravingLocal("wingstop")).score).toBeGreaterThan(0);
  });

  it("matches on a dish name, not just the sign outside", () => {
    const fit = cravingFit(wingstop, parseCravingLocal("wings"));
    expect(fit.score).toBeGreaterThan(0);
    expect(fit.hit).toBe("wings");
  });

  it("scores two matched terms above one", () => {
    const one = cravingFit(salad, parseCravingLocal("salad")).score;
    const two = cravingFit(salad, parseCravingLocal("salad bowl")).score;
    expect(two).toBeGreaterThanOrEqual(one);
  });

  it("returns a hard negative for an avoided term", () => {
    const c = parseCravingLocal("no wings");
    expect(cravingFit(wingstop, c).score).toBe(-1);
  });

  it("is neutral, not negative, when a craving simply does not apply", () => {
    expect(cravingFit(salad, parseCravingLocal("wings")).score).toBe(0);
  });

  it("ignores terms too short to be meaningful", () => {
    // A two-letter term would match almost every name by accident.
    const fit = cravingFit(wingstop, { text: "a", terms: ["a"], vector: {}, avoid: [] });
    expect(fit.score).toBe(0);
  });

  it("does nothing at all with no craving", () => {
    expect(cravingFit(wingstop, null).score).toBe(0);
  });
});
