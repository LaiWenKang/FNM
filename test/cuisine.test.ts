import { describe, expect, it } from "vitest";
import { CUISINES, Cuisine, cuisineFamily, cuisineFromGoogle, cuisineLabel, isCuisine } from "@/lib/cuisine";
import { SEED_PLACES } from "@/lib/data/seed";
import { CUISINE_GLYPH, dishGlyph } from "@/lib/glyphs";

// `cuisine` was a bare string holding three different kinds of label at once,
// and the damage was all silent: things that should have matched didn't, and
// nothing ever errored.

describe("the vocabulary is closed", () => {
  it("every curated place uses a cuisine that exists", () => {
    for (const p of SEED_PLACES) {
      expect(isCuisine(p.cuisine), `${p.name} → ${p.cuisine}`).toBe(true);
    }
  });

  it("every cuisine belongs to a family and has a label", () => {
    for (const [id, entry] of Object.entries(CUISINES)) {
      expect(entry.label.length, id).toBeGreaterThan(0);
      expect(cuisineFamily(id)).toBe(entry.family);
    }
  });

  it("labels something it has never heard of rather than showing a gap", () => {
    expect(cuisineLabel("teochew")).toBe("Teochew");
    expect(cuisineLabel("some_new_thing")).toBe("some new thing");
  });
});

describe("families are what the repeat penalty compares", () => {
  it("groups sushi and ramen together, and keeps pizza out", () => {
    // Ramen the day after sushi is "Japanese twice". That is the question
    // worth asking; exact-label equality could not ask it.
    expect(cuisineFamily("sushi")).toBe(cuisineFamily("ramen"));
    expect(cuisineFamily("sushi")).not.toBe(cuisineFamily("pizza"));
  });

  it("puts a curated place and a live Google place in the SAME family", () => {
    // The cross-tier break: curated said "japanese", Google said
    // "japanese_restaurant", and no comparison in the app could see through it.
    const live = cuisineFromGoogle(["japanese_restaurant", "restaurant"]);
    expect(cuisineFamily(live)).toBe(cuisineFamily("japanese"));
  });

  it("does not lump unrelated food together via the catch-all", () => {
    expect(cuisineFamily("thai")).not.toBe(cuisineFamily("french"));
  });
});

describe("Google's types map to ours", () => {
  it("prefers the specific type over the generic one", () => {
    expect(cuisineFromGoogle(["sushi_restaurant", "japanese_restaurant", "restaurant"])).toBe("sushi");
    expect(cuisineFromGoogle(["ramen_restaurant", "japanese_restaurant"])).toBe("ramen");
  });

  it("reads food_court as a hawker centre", () => {
    // The costly omission: Google tags Singapore's hawker centres `food_court`,
    // so the most characteristic eating place in the country had no category.
    expect(cuisineFromGoogle(["food_court", "restaurant"])).toBe("hawker-centre");
  });

  it("falls back to a plain restaurant rather than inventing a cuisine", () => {
    expect(cuisineFromGoogle(["point_of_interest", "establishment"])).toBe("restaurant");
    expect(cuisineFromGoogle([])).toBe("restaurant");
    expect(cuisineFromGoogle(undefined, undefined)).toBe("restaurant");
  });

  it("always returns something in the vocabulary", () => {
    for (const types of [["bakery"], ["dessert_shop"], ["pub"], ["nonsense_type"], ["cafe"]]) {
      expect(isCuisine(cuisineFromGoogle(types))).toBe(true);
    }
  });
});

describe("glyphs resolve for both tiers", () => {
  it("draws something specific for a live Google place", () => {
    // Every live result used to miss the cuisine table and fall through to the
    // flavour archetype, so the specific drawings were dead code for most picks.
    const live = cuisineFromGoogle(["korean_restaurant"]);
    expect(CUISINE_GLYPH[live]).toBeDefined();
    expect(dishGlyph(null, live, null)).toBe(CUISINE_GLYPH[live]);
  });

  it("never returns undefined, whatever it is handed", () => {
    expect(dishGlyph(null, null, null)).toBeTruthy();
    expect(dishGlyph("no-such-dish", "no-such-cuisine", null)).toBeTruthy();
    expect(dishGlyph(undefined, undefined, { soupy: 0.9, fried: 0.1, rich: 0.2 })).toBeTruthy();
  });

  it("has a glyph for every cuisine a curated place uses", () => {
    for (const p of SEED_PLACES) {
      expect(CUISINE_GLYPH[p.cuisine as Cuisine], `${p.cuisine}`).toBeDefined();
    }
  });
});
