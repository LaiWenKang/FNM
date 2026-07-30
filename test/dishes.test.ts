import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/data/seed";

// TIER 2 OF THE DISH CATALOGUE: mine review text for dishes people actually
// recommend. It is an UPGRADE to a card that already works, never a dependency
// of one — so every failure path has to return the place untouched, and every
// success path has to be defensible, because a fabricated dish name on a card
// is the app inventing a menu.

const ask = vi.hoisted(() =>
  vi.fn(async (_opts: { system: string; user: string; maxTokens: number }) => null as string | null),
);
const llmConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, ask, llmConfigured };
});

const { clearDishCache, enrichPicks, withMinedDishes } = await import("@/lib/dishes");

const place = (over: Partial<Place> = {}): Place => ({
  id: "g-abc",
  name: "Test Ramen",
  cuisine: "japanese",
  lat: 1.2841,
  lng: 103.8515,
  priceLevel: 2,
  flavor: { heat: 0.5, sweet: 0.5, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.5 },
  openHour: 0,
  closeHour: 24,
  sheltered: true,
  dishes: [],
  source: "google",
  ...over,
});

const reviewsReturn = (reviews: string[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reviews: reviews.map((text) => ({ text: { text } })) }),
    }) as unknown as Response),
  );

beforeEach(() => {
  // The dish cache is keyed on place id and lives for the whole process, so
  // without this every test after the first reads the previous one's answer.
  clearDishCache();
  ask.mockReset();
  llmConfigured.mockReturnValue(true);
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
  vi.stubEnv("DATABASE_URL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  reviewsReturn(["The tonkotsu is unmissable"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("when mining should not run at all", () => {
  it("skips everything without a model configured", async () => {
    /* The Google Details call is the EXPENSIVE half of this path, in the
       priciest SKU. Making the trip to fetch reviews nobody can read would
       cost money for nothing. */
    llmConfigured.mockReturnValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const input = [place()];
    expect(await enrichPicks(input)).toBe(input);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves curated places alone", async () => {
    // Tier-1 places already carry hand-checked dishes; mining them would
    // replace known-good data with a guess.
    const curated = place({ source: "curated", id: "seed-x" });
    expect(await withMinedDishes(curated)).toBe(curated);
    expect(ask).not.toHaveBeenCalled();
  });

  it("leaves a place that already has dishes alone", async () => {
    const has = place({
      dishes: [{ id: "d1", name: "Existing", flavor: place().flavor, priceSgd: 10 }],
    });
    expect(await withMinedDishes(has)).toBe(has);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("what comes back from the model", () => {
  const mined = async (reply: unknown) => {
    ask.mockResolvedValue(typeof reply === "string" ? reply : JSON.stringify(reply));
    return withMinedDishes(place());
  };

  it("keeps a well-formed dish", async () => {
    const out = await mined([
      { name: "Tonkotsu Ramen", priceSgd: 16, flavor: { heat: 0.2, soupy: 0.9, rich: 0.9 } },
    ]);
    expect(out.dishes).toHaveLength(1);
    expect(out.dishes[0].name).toBe("Tonkotsu Ramen");
    expect(out.dishes[0].priceSgd).toBe(16);
  });

  it("drops a dish with too little flavour data to rank", async () => {
    /* A dish with an all-neutral vector is WORSE than no dish: it gets matched
       against the palate on invented middles and can outrank a real one. */
    const out = await mined([{ name: "Mystery Plate", flavor: { heat: 0.5 } }]);
    expect(out.dishes).toHaveLength(0);
  });

  it("drops a dish with no usable name", async () => {
    const out = await mined([
      { name: "", flavor: { heat: 0.2, soupy: 0.9, rich: 0.9 } },
      { name: "x", flavor: { heat: 0.2, soupy: 0.9, rich: 0.9 } },
      { flavor: { heat: 0.2, soupy: 0.9, rich: 0.9 } },
    ]);
    expect(out.dishes).toHaveLength(0);
  });

  it("clamps flavour values a model put outside the unit range", async () => {
    const out = await mined([
      { name: "Nuclear Curry", flavor: { heat: 9, soupy: -3, rich: 0.5, sweet: 0.4 } },
    ]);
    expect(out.dishes[0].flavor.heat).toBe(1);
    expect(out.dishes[0].flavor.soupy).toBe(0);
  });

  it("ignores non-numeric flavour values instead of poisoning the vector", async () => {
    const out = await mined([
      { name: "Odd One", flavor: { heat: "very", soupy: null, rich: 0.8, sweet: 0.4, fried: 0.2 } },
    ]);
    expect(out.dishes).toHaveLength(1);
    expect(Number.isFinite(out.dishes[0].flavor.heat)).toBe(true);
  });

  it("clamps an absurd price and zeroes an unusable one", async () => {
    // "~$99999.00" on a hawker card is the kind of number that destroys trust
    // in every other number on the screen.
    const out = await mined([
      { name: "Gold Leaf Laksa", priceSgd: 999999, flavor: { heat: 0.8, soupy: 0.9, rich: 0.7 } },
      { name: "No Price Mee", priceSgd: "cheap", flavor: { heat: 0.3, soupy: 0.2, rich: 0.4 } },
    ]);
    expect(out.dishes[0].priceSgd).toBeLessThanOrEqual(200);
    expect(out.dishes[1].priceSgd).toBe(0);
  });

  it("takes at most three dishes however many it is handed", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      name: `Dish ${i}`,
      flavor: { heat: 0.5, soupy: 0.6, rich: 0.7 },
    }));
    expect((await mined(many)).dishes.length).toBeLessThanOrEqual(3);
  });

  it("gives each dish a unique id scoped to its place", async () => {
    const out = await mined([
      { name: "Alpha Bowl", flavor: { heat: 0.1, soupy: 0.2, rich: 0.3 } },
      { name: "Beta Bowl", flavor: { heat: 0.4, soupy: 0.5, rich: 0.6 } },
    ]);
    const ids = out.dishes.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("g-abc")).toBe(true);
  });

  it("survives prose wrapped around the JSON", async () => {
    const out = await mined(
      'Sure! Here are the dishes:\n[{"name":"Tonkotsu","flavor":{"heat":0.2,"soupy":0.9,"rich":0.9}}]\nHope that helps!',
    );
    expect(out.dishes).toHaveLength(1);
  });

  it("returns the place untouched for unparseable output", async () => {
    const before = place();
    ask.mockResolvedValue("I'm afraid I can't help with that.");
    expect(await withMinedDishes(before)).toEqual(before);
  });

  it("returns the place untouched when the model is unreachable", async () => {
    const before = place();
    ask.mockResolvedValue(null);
    expect(await withMinedDishes(before)).toEqual(before);
  });

  it("accepts an explicit empty array as a real answer", async () => {
    // "The reviews name no specific dish" is a correct outcome, not a failure.
    const out = await mined([]);
    expect(out.dishes).toHaveLength(0);
  });
});

describe("sharpening the place's own flavour", () => {
  it("replaces the type estimate with the mean of the mined dishes", async () => {
    /* THE CATALOGUE IMPROVES AS IT IS USED. The coarse type-based vector is a
       guess; three named dishes are evidence, and the next request for this
       place ranks on the evidence. */
    // Names of two characters or more — a single letter is rejected by the
    // same guard the "no usable name" test above pins.
    ask.mockResolvedValue(
      JSON.stringify([
        { name: "Fire Curry", flavor: { heat: 1, soupy: 1, rich: 1, sweet: 1, fried: 1, adventure: 1 } },
        { name: "Plain Rice", flavor: { heat: 0, soupy: 0, rich: 0, sweet: 0, fried: 0, adventure: 0 } },
      ]),
    );
    const out = await withMinedDishes(place());
    expect(out.dishes).toHaveLength(2);
    expect(out.flavor.heat).toBeCloseTo(0.5, 5);
    expect(out.flavor.adventure).toBeCloseTo(0.5, 5);
    expect(out.flavorKnown).toBe(true);
  });

  it("leaves the estimate alone when nothing was mined", async () => {
    // Overwriting a type estimate with an empty mean would replace a rough
    // guess with a wrong one.
    ask.mockResolvedValue("[]");
    const before = place();
    const out = await withMinedDishes(before);
    expect(out.flavor).toEqual(before.flavor);
  });
});

describe("staying out of the way", () => {
  it("returns the originals when the budget expires", async () => {
    /* A slow vendor must not hold up a hungry person's page. Anything still
       outstanding simply stays restaurant-level. */
    ask.mockImplementation(() => new Promise(() => {}));
    const input = [place()];
    const out = await enrichPicks(input, 40);
    expect(out).toEqual(input);
  });

  it("does not let one place's failure lose the others", async () => {
    ask.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(
      JSON.stringify([{ name: "Good One", flavor: { heat: 0.5, soupy: 0.6, rich: 0.7 } }]),
    );
    const out = await enrichPicks([place({ id: "g-1" }), place({ id: "g-2" })], 5000);
    expect(out).toHaveLength(2);
  });

  it("survives the reviews fetch failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const before = place();
    expect(await withMinedDishes(before)).toEqual(before);
  });

  it("does not call the model when there is nothing to read", async () => {
    // No reviews and no editorial summary means no evidence; asking anyway
    // invites exactly the invented menu item the prompt forbids.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
    );
    await withMinedDishes(place());
    expect(ask).not.toHaveBeenCalled();
  });
});
