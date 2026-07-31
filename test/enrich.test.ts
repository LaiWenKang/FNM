import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/data/seed";
import { CUISINES, cuisineFamily, isCuisine } from "@/lib/cuisine";
import { DIMS } from "@/lib/flavor";

// THE TABLE COVERS A THIRD OF REALITY.
//
// Measured against production across eight areas: nine of fourteen live picks
// had no flavour data, and the same nine fell through to the generic cuisine
// "restaurant". Google tags a great many Singapore places `restaurant` / `food`
// and nothing more, and a hand-maintained type map cannot read a NAME.
//
// The second consequence is worse than the first. lib/scoring.ts compares
// `meal.cuisine === place.cuisine`, so every place that fell through shares one
// string and they all count as repeats of each other.

const ask = vi.hoisted(() =>
  vi.fn(async (_opts: { system: string; user: string; maxTokens: number }) => null as string | null),
);
const llmConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, ask, llmConfigured };
});

const { clearEnrichCache, coerceEnrichment, enrichGenerics, enrichmentFor, withEnrichment } =
  await import("@/lib/enrich");
const { clearHealth, noteFault, noteOk } = await import("@/lib/health");

const place = (over: Partial<Place> = {}): Place => ({
  id: "g-abc",
  name: "Qiu Lian Ban Mian",
  cuisine: "restaurant",
  lat: 1.2841,
  lng: 103.8515,
  priceLevel: 1,
  flavor: { heat: 0.5, sweet: 0.5, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.5 },
  openHour: 0,
  closeHour: 24,
  sheltered: true,
  dishes: [],
  source: "google",
  flavorKnown: false,
  ...over,
});

const goodFlavor = { heat: 0.2, sweet: 0.3, soupy: 0.9, fried: 0.2, rich: 0.4, adventure: 0.2 };

beforeEach(() => {
  clearEnrichCache();
  clearHealth();
  ask.mockReset();
  llmConfigured.mockReturnValue(true);
  vi.stubEnv("DATABASE_URL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("the bug this fixes", () => {
  it("shows why a generic cuisine breaks the repeat penalty", () => {
    /* scoring.ts: `meal.cuisine === place.cuisine` fires the same-cuisine
       knock. With both sides fallen through to "restaurant", an Indian meal
       yesterday makes an unrelated Japanese place today look like a repeat. */
    const a = place({ id: "g-1", name: "Some Indian Place" });
    const b = place({ id: "g-2", name: "Some Japanese Place" });
    expect(a.cuisine).toBe(b.cuisine);
    expect(cuisineFamily(a.cuisine)).toBe(cuisineFamily(b.cuisine));

    // Once each is placed properly they stop colliding.
    const ea = withEnrichment(a, { cuisine: "indian", flavor: goodFlavor });
    const eb = withEnrichment(b, { cuisine: "japanese", flavor: goodFlavor });
    expect(ea.cuisine).not.toBe(eb.cuisine);
    expect(cuisineFamily(ea.cuisine)).not.toBe(cuisineFamily(eb.cuisine));
  });
});

describe("what a model reply must clear", () => {
  it("accepts a well-formed answer", () => {
    const got = coerceEnrichment({ cuisine: "teochew", flavor: goodFlavor, confident: true });
    expect(got?.cuisine).toBe("teochew");
    expect(got?.flavor.soupy).toBe(0.9);
  });

  it("refuses a cuisine outside the app's own vocabulary", () => {
    /* THE WHOLE POINT OF A CLOSED LIST. A cuisine not in CUISINES has no
       family, so it breaks the repeat penalty in a NEW way, and it falls
       through the glyph table — this bug recreated one layer up. */
    for (const bad of ["asian", "restaurant-ish", "Nyonya-Peranakan-Fusion", "hawker food", "西餐", ""]) {
      expect(coerceEnrichment({ cuisine: bad, flavor: goodFlavor }), bad).toBeNull();
    }
  });

  it("refuses the generic bucket, which is the non-answer being replaced", () => {
    /* "restaurant" IS in the vocabulary — it is the fallthrough the type table
       already produces. Accepting it back from the model would spend a call to
       write down exactly what the place already said, and would re-create the
       cuisine collision this whole module exists to fix. */
    expect(coerceEnrichment({ cuisine: "restaurant", flavor: goodFlavor })).toBeNull();
  });

  it("accepts every REAL cuisine the app defines", () => {
    // If the vocabulary grows, the validator must not need editing too — the
    // one exclusion is the generic bucket, covered above.
    for (const c of Object.keys(CUISINES).filter((c) => c !== "restaurant")) {
      expect(coerceEnrichment({ cuisine: c, flavor: goodFlavor }), c).not.toBeNull();
    }
  });

  it("takes the model's own admission of doubt seriously", () => {
    /* AN UNSURE ANSWER IS WORSE THAN NO ANSWER. A guessed cuisine does not sit
       inertly in the record — it feeds the repeat penalty and the glyph, so a
       wrong one actively misranks tomorrow's lunch. */
    expect(coerceEnrichment({ cuisine: "japanese", flavor: goodFlavor, confident: false })).toBeNull();
  });

  it("still accepts an answer that simply did not mention confidence", () => {
    // Absent is not the same as false; only an explicit refusal counts.
    expect(coerceEnrichment({ cuisine: "japanese", flavor: goodFlavor })).not.toBeNull();
  });

  it("rejects a vector too sparse to be worth replacing an estimate with", () => {
    /* A vector with one or two axes filled is mostly neutral padding — which
       is exactly the uninformative estimate this exists to replace. */
    expect(coerceEnrichment({ cuisine: "japanese", flavor: { heat: 0.2 } })).toBeNull();
    expect(coerceEnrichment({ cuisine: "japanese", flavor: { heat: 0.2, soupy: 0.9 } })).toBeNull();
    expect(coerceEnrichment({ cuisine: "japanese", flavor: { heat: 0.2, soupy: 0.9, rich: 0.4 } })).toBeNull();
    expect(
      coerceEnrichment({ cuisine: "japanese", flavor: { heat: 0.2, soupy: 0.9, rich: 0.4, sweet: 0.3 } }),
    ).not.toBeNull();
  });

  it("clamps values a model put outside the unit range", () => {
    const got = coerceEnrichment({
      cuisine: "sichuan",
      flavor: { ...goodFlavor, heat: 9, rich: -3 },
    });
    expect(got?.flavor.heat).toBe(1);
    expect(got?.flavor.rich).toBe(0);
  });

  it("ignores non-numeric axes rather than poisoning the vector", () => {
    const got = coerceEnrichment({
      cuisine: "japanese",
      flavor: { ...goodFlavor, heat: "very" as unknown as number },
    });
    // Five real axes still clears the bar, and every axis stays finite.
    expect(got).not.toBeNull();
    for (const d of DIMS) expect(Number.isFinite(got!.flavor[d])).toBe(true);
  });

  it("tolerates case and whitespace from the model", () => {
    expect(coerceEnrichment({ cuisine: "  Teochew ", flavor: goodFlavor })?.cuisine).toBe("teochew");
  });

  it("returns null for nothing at all", () => {
    expect(coerceEnrichment(null)).toBeNull();
    expect(coerceEnrichment({})).toBeNull();
  });

  it("only ever produces a cuisine the rest of the app understands", () => {
    const got = coerceEnrichment({ cuisine: "hokkien", flavor: goodFlavor });
    expect(isCuisine(got!.cuisine)).toBe(true);
    expect(cuisineFamily(got!.cuisine)).not.toBe("other");
  });
});

describe("applying it", () => {
  it("replaces the estimate and says the flavour is now known", () => {
    const out = withEnrichment(place(), { cuisine: "teochew", flavor: goodFlavor });
    expect(out.cuisine).toBe("teochew");
    expect(out.flavor.soupy).toBe(0.9);
    expect(out.flavorKnown).toBe(true);
  });

  it("leaves the place untouched when there is no answer", () => {
    // Keeping flavorKnown: false is what lets the card say "not known".
    const before = place();
    expect(withEnrichment(before, null)).toBe(before);
  });
});

describe("who gets asked about", () => {
  it("asks only about places the table could not answer", async () => {
    /* A curated place has a hand-checked vector and a live place with a real
       type match already knows what it is. Asking about either would spend
       money to replace good data with a guess. */
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichGenerics([
      place({ id: "curated", source: "curated", flavorKnown: true }),
      place({ id: "g-known", flavorKnown: true }),
      place({ id: "g-generic", flavorKnown: false }),
    ]);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ask.mock.calls[0][0].user).name).toBe("Qiu Lian Ban Mian");
  });

  it("does nothing at all without a model configured", async () => {
    llmConfigured.mockReturnValue(false);
    const input = [place()];
    expect(await enrichGenerics(input)).toBe(input);
    expect(ask).not.toHaveBeenCalled();
  });

  it("does nothing when every place already knows itself", async () => {
    const input = [place({ flavorKnown: true })];
    expect(await enrichGenerics(input)).toBe(input);
    expect(ask).not.toHaveBeenCalled();
  });

  it("keeps the array order, so the caller's indices still line up", async () => {
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    const out = await enrichGenerics([
      place({ id: "a", flavorKnown: true, name: "A" }),
      place({ id: "b", flavorKnown: false, name: "B" }),
      place({ id: "c", flavorKnown: true, name: "C" }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out[1].cuisine).toBe("teochew");
  });

  it("returns the originals when the budget expires", async () => {
    // A slow vendor must never hold up a hungry person's page.
    ask.mockImplementation(() => new Promise(() => {}));
    const input = [place()];
    const out = await enrichGenerics(input, 40);
    expect(out[0].flavorKnown).toBe(false);
  });

  it("does not let one place's failure lose the others", async () => {
    ask
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(JSON.stringify({ cuisine: "japanese", flavor: goodFlavor }));
    const out = await enrichGenerics([place({ id: "g-1" }), place({ id: "g-2" })], 5000);
    expect(out).toHaveLength(2);
    expect(out.some((p) => p.flavorKnown)).toBe(true);
  });
});

describe("not paying for a dead key on every request", () => {
  /* THIS is the one enrichment that runs over the WHOLE candidate pool, so a
     revoked credential would mean a dozen doomed round-trips per
     recommendation — each queued, each waited on, each logged — taxing every
     lunch for work that cannot succeed. */

  it("stops asking once the model has failed repeatedly and never answered", async () => {
    for (let i = 0; i < 3; i += 1) noteFault("llm", "auth", "dead key");
    const input = [place()];
    expect(await enrichGenerics(input)).toBe(input);
    expect(ask).not.toHaveBeenCalled();
  });

  it("does NOT trip on a single failure, because a timeout happens", async () => {
    noteFault("llm", "timeout", "slow");
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichGenerics([place()]);
    expect(ask).toHaveBeenCalled();
  });

  it("does NOT trip on a subsystem that has ever succeeded", async () => {
    // Intermittent is not dead. One good answer proves the key is real.
    noteOk("llm");
    for (let i = 0; i < 10; i += 1) noteFault("llm", "rate-limit", "busy");
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichGenerics([place()]);
    expect(ask).toHaveBeenCalled();
  });

  it("is not confused by another subsystem's failures", async () => {
    for (let i = 0; i < 10; i += 1) noteFault("places", "auth", "dead places key");
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichGenerics([place()]);
    expect(ask).toHaveBeenCalled();
  });
});

describe("asking once, ever", () => {
  it("does not ask twice about the same place", async () => {
    /* THE COST ARGUMENT. This runs before ranking over the whole candidate
       pool, which is only affordable because a given restaurant is asked about
       once and the answer is kept. */
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichmentFor(place());
    await enrichmentFor(place());
    await enrichmentFor(place());
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("remembers a NULL too, so an unplaceable name is not re-asked forever", async () => {
    // A place the model could not identify will not become identifiable
    // tomorrow, and re-asking on every view is the expensive mistake.
    ask.mockResolvedValue(JSON.stringify({ cuisine: "japanese", flavor: goodFlavor, confident: false }));
    expect(await enrichmentFor(place())).toBeNull();
    expect(await enrichmentFor(place())).toBeNull();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps different places apart", async () => {
    ask
      .mockResolvedValueOnce(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }))
      .mockResolvedValueOnce(JSON.stringify({ cuisine: "japanese", flavor: goodFlavor }));
    expect((await enrichmentFor(place({ id: "g-1" })))?.cuisine).toBe("teochew");
    expect((await enrichmentFor(place({ id: "g-2" })))?.cuisine).toBe("japanese");
  });
});

describe("what the model is told", () => {
  it("is handed the name, which is the signal the table cannot read", async () => {
    ask.mockResolvedValue(JSON.stringify({ cuisine: "teochew", flavor: goodFlavor }));
    await enrichmentFor(place({ name: "Qiu Lian Ban Mian" }));
    expect(JSON.parse(ask.mock.calls[0][0].user).name).toBe("Qiu Lian Ban Mian");
  });

  it("is given the vocabulary to choose from, not asked to invent one", async () => {
    ask.mockResolvedValue("{}");
    await enrichmentFor(place());
    const system = ask.mock.calls[0][0].system;
    for (const c of ["teochew", "hokkien", "japanese"]) expect(system).toContain(c);
  });

  it("is told that a wrong answer is worse than none", async () => {
    ask.mockResolvedValue("{}");
    await enrichmentFor(place());
    expect(ask.mock.calls[0][0].system).toMatch(/confident=false|worse than none/);
  });

  it("does not pass the useless generic type through as a hint", async () => {
    // "restaurant" is the absence of a type, not a type. Sending it invites
    // the model to answer with the same non-answer.
    ask.mockResolvedValue("{}");
    await enrichmentFor(place({ cuisine: "restaurant" }));
    expect(JSON.parse(ask.mock.calls[0][0].user).googleTypes).toEqual([]);
  });
});
