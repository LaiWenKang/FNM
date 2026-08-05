import { describe, expect, it } from "vitest";
import { Place, SEED_PLACES } from "@/lib/data/seed";
import { vec } from "@/lib/flavor";
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
    const fit = cravingFit(wingstop, { text: "a", terms: ["a"], groups: [["a"]], vector: {}, avoid: [] });
    expect(fit.score).toBe(0);
  });

  it("does not let 'spicy' match 'McSpicy'", () => {
    /* THE REPORTED BUG, PINNED. Searching "spicy soup" in the CBD returned a
       McDonald's: matching was raw substring, "mcspicy".includes("spicy") is
       true, so a burger scored a direct hit on a soup craving and its +31
       bonus carried it past everything actually near the diner. */
    const mcd: Place = {
      ...wingstop,
      id: "cbd-mcdonalds",
      name: "McDonald's (One Raffles Place, 24h)",
      cuisine: "fast-food",
      dishes: [{ id: "mcd-mcspicy", name: "McSpicy", flavor: vec({ heat: 0.7 }), priceSgd: 9 }],
    };
    expect(cravingFit(mcd, parseCravingLocal("spicy soup")).score).toBe(0);
    expect(cravingFit(mcd, parseCravingLocal("spicy soup")).hit).toBeNull();
  });

  it("still matches a whole word inside a longer name", () => {
    // The boundary rule must not become so strict it stops finding real food.
    const laksa: Place = { ...wingstop, id: "l", name: "928 Yishun Laksa", dishes: [] };
    expect(cravingFit(laksa, parseCravingLocal("laksa")).score).toBeGreaterThan(0);
  });

  it("pays a half-match half the bonus", () => {
    /* A flat 0.7 for any single hit meant matching one word of two was worth
       70% of matching both — near enough that distance and rating decided it
       instead of the food. */
    const soupOnly: Place = { ...wingstop, id: "s", name: "Fishball Soup Stall", dishes: [] };
    const both: Place = { ...wingstop, id: "b", name: "Spicy Soup House", dishes: [] };
    const half = cravingFit(soupOnly, parseCravingLocal("spicy soup")).score;
    const full = cravingFit(both, parseCravingLocal("spicy soup")).score;
    expect(full).toBe(1);
    expect(half).toBeCloseTo(0.5, 5);
  });

  it("treats a lexicon's synonyms as alternatives, not as extra requirements", () => {
    /* "salad" expands to salad/grain/poke. Those are three ways of naming ONE
       thing the diner asked for, so matching any of them is a complete answer
       — counting them as three requirements scored a real salad 1-in-3 and
       let the learned palate overrule what was typed. */
    const c = parseCravingLocal("salad");
    expect(c.terms.length).toBeGreaterThan(1);
    expect(c.groups).toHaveLength(1);
    expect(cravingFit(salad, c).score).toBe(1);
  });

  it("credits a place Google returned FOR the craving, whatever its name says", () => {
    /* THE SECOND HALF OF THE REPORTED BUG. Searching "spicy soup" surfaced
       Xiao Long Kan Hotpot — correct — and the card printed "nothing nearby
       matches spicy soup" directly above it, because the name contains neither
       word. Google matched it on category, menu and reviews; that is better
       evidence about a kitchen than its signage. */
    const hotpot: Place = {
      ...wingstop,
      id: "g-hotpot",
      name: "Xiao Long Kan Hotpot Clarke Quay",
      cuisine: "restaurant",
      dishes: [],
      cravingEvidence: 0.55,
    };
    const fit = cravingFit(hotpot, parseCravingLocal("spicy soup"));
    expect(fit.score).toBeCloseTo(0.55, 5);
    // Something must be nameable, or the UI still says nothing matched.
    expect(fit.hit).toBe("spicy soup");
  });

  it("keeps a literal match worth clearly more than mere provenance", () => {
    /* Set by watching it fail: at 0.8 the top text hit outscored the ramen bar
       down the road, because a big hawker centre is loosely relevant to every
       food query and Google returns it for all of them. */
    const named: Place = { ...wingstop, id: "g-named", name: "Torasho Ramen Bar", dishes: [] };
    const merely: Place = { ...wingstop, id: "g-hawker", name: "Lau Pa Sat", dishes: [], cravingEvidence: 0.55 };
    const c = parseCravingLocal("ramen");
    expect(cravingFit(named, c).score).toBeGreaterThan(cravingFit(merely, c).score + 0.3);
  });

  it("takes the stronger signal, never the sum", () => {
    // A place that both reads right and was returned for the craving is not
    // twice as relevant; adding them would push ordinary matches to the top.
    const both: Place = {
      ...wingstop,
      id: "g-both",
      name: "Spicy Soup House",
      dishes: [],
      cravingEvidence: 0.6,
    };
    expect(cravingFit(both, parseCravingLocal("spicy soup")).score).toBe(1);
  });

  it("leaves places the craving search never returned completely alone", () => {
    const plain: Place = { ...wingstop, id: "g-plain", name: "Kopitiam Corner", dishes: [] };
    expect(cravingFit(plain, parseCravingLocal("spicy soup")).score).toBe(0);
  });

  it("does nothing at all with no craving", () => {
    expect(cravingFit(wingstop, null).score).toBe(0);
  });
});
