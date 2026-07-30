import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIMS, describeTaste, neutralVector, vec } from "@/lib/flavor";

// The model refinement of a craving, and the sentence a palate turns into.
// Both are the app putting WORDS to something, which is where an over-claim
// does the most damage: a user reading "your spicy palate" checks it against
// what they know about themselves, and a wrong one costs trust in the number
// beside it too.

const ask = vi.hoisted(() =>
  vi.fn(async (_opts: { system: string; user: string; maxTokens: number }) => null as string | null),
);
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, ask };
});

const { parseCraving, parseCravingLocal } = await import("@/lib/craving");

const reply = (o: unknown) => ask.mockResolvedValue(JSON.stringify(o));

beforeEach(() => ask.mockReset());
afterEach(() => vi.clearAllMocks());

describe("falling back to the lexicon", () => {
  it("uses the local parse when no model answers", async () => {
    ask.mockResolvedValue(null);
    expect(await parseCraving("spicy noodles")).toEqual(parseCravingLocal("spicy noodles"));
  });

  it("uses the local parse when the model returns prose", async () => {
    ask.mockResolvedValue("I think they want noodles!");
    expect(await parseCraving("spicy noodles")).toEqual(parseCravingLocal("spicy noodles"));
  });

  it("does not call the model for empty input", async () => {
    expect((await parseCraving("   ")).text).toBe("");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("what the model is allowed to add", () => {
  it("keeps the word the user actually typed", async () => {
    /* THE UNION RULE. The model sometimes drops the literal word in favour of
       a synonym — and the typed word is the one thing we know for certain they
       meant. Losing "wings" and searching only "chicken" is how "wings"
       silently became McDonald's. */
    reply({ terms: ["chicken"], avoid: [], flavor: {} });
    const c = await parseCraving("wings");
    expect(c.terms).toContain("wings");
    expect(c.terms).toContain("chicken");
  });

  it("picks up a negation a lexicon would miss", async () => {
    reply({ terms: ["rice"], avoid: ["pork", "bak"], flavor: {} });
    expect((await parseCraving("rice, no pork")).avoid).toEqual(expect.arrayContaining(["pork", "bak"]));
  });

  it("takes a budget only when it is a real tier", async () => {
    reply({ terms: [], avoid: [], flavor: {}, priceMax: 2 });
    expect((await parseCraving("something cheap")).priceMax).toBe(2);
  });

  it("ignores a budget outside the scale", async () => {
    // A priceMax of 9 would silently disable the budget filter entirely.
    for (const bad of [0, 5, -1, "two", null]) {
      reply({ terms: [], avoid: [], flavor: {}, priceMax: bad });
      expect((await parseCraving("cheap")).priceMax).toBeUndefined();
    }
  });

  it("clamps flavour values to the unit range", async () => {
    reply({ terms: [], avoid: [], flavor: { heat: 5, soupy: -2 } });
    const c = await parseCraving("nuclear soup");
    expect(c.vector.heat).toBe(1);
    expect(c.vector.soupy).toBe(0);
  });

  it("ignores non-numeric flavour values", async () => {
    reply({ terms: [], avoid: [], flavor: { heat: "hot", soupy: null } });
    const c = await parseCraving("hot soup");
    for (const d of DIMS) {
      if (c.vector[d] !== undefined) expect(Number.isFinite(c.vector[d])).toBe(true);
    }
  });

  it("keeps the local vector when the model offers no flavour at all", async () => {
    // Dropping to an empty vector would discard what the lexicon already knew.
    reply({ terms: ["laksa"], avoid: [], flavor: {} });
    expect((await parseCraving("spicy")).vector).toEqual(parseCravingLocal("spicy").vector);
  });

  it("caps how many terms a reply can inject", async () => {
    /* Every term becomes a match test against every candidate. An unbounded
       list is both a cost and a way to make everything match everything. */
    reply({ terms: Array.from({ length: 50 }, (_, i) => `term${i}`), avoid: [], flavor: {} });
    expect((await parseCraving("food")).terms.length).toBeLessThanOrEqual(20);
  });

  it("caps how long a single term can be", async () => {
    reply({ terms: ["x".repeat(200)], avoid: [], flavor: {} });
    for (const t of (await parseCraving("food")).terms) expect(t.length).toBeLessThanOrEqual(24);
  });

  it("drops non-string entries instead of crashing on them", async () => {
    reply({ terms: ["laksa", 42, null, { a: 1 }], avoid: [], flavor: {} });
    for (const t of (await parseCraving("laksa")).terms) expect(typeof t).toBe("string");
  });

  it("survives terms that are not an array at all", async () => {
    reply({ terms: "laksa", avoid: 7, flavor: {} });
    await expect(parseCraving("laksa")).resolves.toBeDefined();
  });

  it("lowercases everything, because matching is case-insensitive", async () => {
    reply({ terms: ["LAKSA", "Mee"], avoid: ["PORK"], flavor: {} });
    const c = await parseCraving("laksa");
    for (const t of [...c.terms, ...c.avoid]) expect(t).toBe(t.toLowerCase());
  });

  it("never duplicates a term the lexicon already found", async () => {
    reply({ terms: ["laksa"], avoid: [], flavor: {} });
    const c = await parseCraving("laksa");
    expect(new Set(c.terms).size).toBe(c.terms.length);
  });
});

describe("describing a palate in words", () => {
  it("calls an uncalibrated palate balanced", () => {
    // Which is exactly why the cold-start path must not print this sentence:
    // "balanced" reads as a finding, and it is the absence of one.
    expect(describeTaste(neutralVector())).toBe("balanced");
  });

  it("names each strong axis", () => {
    expect(describeTaste(vec({ heat: 0.9 }))).toContain("spicy");
    expect(describeTaste(vec({ sweet: 0.9 }))).toContain("sweet-leaning");
    expect(describeTaste(vec({ soupy: 0.9 }))).toContain("soupy");
    expect(describeTaste(vec({ fried: 0.9 }))).toContain("crispy");
    expect(describeTaste(vec({ rich: 0.9 }))).toContain("rich");
    expect(describeTaste(vec({ adventure: 0.9 }))).toContain("adventurous");
  });

  it("names the low end where a low value is itself a preference", () => {
    // Disliking chilli is a real taste; not being adventurous is closer to an
    // absence, which is why only heat and rich have a low-end word.
    expect(describeTaste(vec({ heat: 0.1 }))).toContain("mild");
    expect(describeTaste(vec({ rich: 0.1 }))).toContain("light");
  });

  it("never says both a word and its opposite", () => {
    const d = describeTaste(vec({ heat: 0.9, rich: 0.1 }));
    expect(d).toContain("spicy");
    expect(d).not.toContain("mild");
    expect(d).toContain("light");
    expect(d).not.toContain("rich,");
  });

  it("stays a readable phrase even for an extreme palate", () => {
    const all = describeTaste(
      vec({ heat: 1, sweet: 1, soupy: 1, fried: 1, rich: 1, adventure: 1 }),
    );
    expect(all.split(", ").length).toBeLessThanOrEqual(6);
    expect(all).not.toContain("balanced");
  });

  it("returns a non-empty phrase for every corner of the space", () => {
    for (const v of [0, 0.34, 0.5, 0.66, 1]) {
      const desc = describeTaste(vec(Object.fromEntries(DIMS.map((d) => [d, v]))));
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
