import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNearbyCache, getCandidatePlaces } from "@/lib/places";
import { SEED_PLACES } from "@/lib/data/seed";
import { clearHealth } from "@/lib/health";

// WHERE LIVE DATA BECOMES APP DATA — and, by the project's own account, where
// the bugs that reached production actually lived. Every field here is a
// translation from Google's vocabulary into this app's, and each one has a
// wrong answer that looks perfectly plausible on the card.
//
// Driven through the real fetch seam rather than by exporting the private
// helpers: the mapping is only correct if the wiring around it is, and the
// wiring is the part that has broken before.

const KEY = "GOOGLE_PLACES_API_KEY";

function googleReturns(places: unknown[]) {
  // Args typed so a test can assert WHICH endpoint was called and with what
  // body — the difference between a proximity search and a text search.
  const spy = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok: true, status: 200, json: async () => ({ places }) }) as unknown as Response,
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

const place = (over: Record<string, unknown> = {}) => ({
  id: "abc123",
  displayName: { text: "Test Kitchen" },
  location: { latitude: 1.2841, longitude: 103.8515 },
  types: ["restaurant"],
  currentOpeningHours: { openNow: true },
  ...over,
});

/** Only the places that came from Google, not the curated catalogue. */
const live = (all: Awaited<ReturnType<typeof getCandidatePlaces>>) =>
  all.filter((p) => p.source === "google");

beforeEach(() => {
  clearHealth();
  clearNearbyCache();
  vi.stubEnv(KEY, "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("with no key at all", () => {
  it("still returns the curated catalogue", async () => {
    // The zero-key install is a supported mode, not a degraded one.
    vi.unstubAllEnvs();
    vi.stubEnv(KEY, "");
    const all = await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(all.length).toBe(SEED_PLACES.length);
    expect(live(all)).toHaveLength(0);
  });
});

describe("places nobody can walk into", () => {
  it("drops a restricted-access caterer", async () => {
    /* THE PRODUCTION FAILURE, PINNED. "InstaChef at Grande Vista (Restricted
       Access)" was served as the TOP PICK — a caterer inside a private
       development. Google tags it a restaurant because it is one; it is simply
       not one this user can enter, and recommending it fails the product's
       only job. */
    googleReturns([
      place({ id: "1", displayName: { text: "InstaChef at Grande Vista (Restricted Access)" } }),
      place({ id: "2", displayName: { text: "Normal Cafe" } }),
    ]);
    const names = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12)).map((p) => p.name);
    expect(names).toEqual(["Normal Cafe"]);
  });

  it("drops staff canteens, members-only clubs and crew messes", async () => {
    googleReturns(
      [
        "Tower Staff Canteen",
        "The Boardroom (Members Only)",
        "Harbour Crew Mess",
        "ACME Employees Only Cafe",
        "Marina Private Club",
      ].map((text, i) => place({ id: String(i), displayName: { text } })),
    );
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))).toHaveLength(0);
  });

  it("does not over-match innocent names", async () => {
    // The filter is deliberately narrow. "Members" in a restaurant's name is
    // not the same as "members only", and dropping real food is its own bug.
    googleReturns(
      ["Club Street Laksa", "Staff of Life Bakery", "Private Kitchen by Chef Tan", "The Restricted Palate"].map(
        (text, i) => place({ id: String(i), displayName: { text } }),
      ),
    );
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))).toHaveLength(4);
  });
});

describe("opening hours", () => {
  const withPeriods = (periods: unknown[]) =>
    place({ regularOpeningHours: { periods } });

  it("reads the period that actually covers the hour being planned for", async () => {
    googleReturns([
      withPeriods([
        { open: { hour: 6 }, close: { hour: 10 } },
        { open: { hour: 11 }, close: { hour: 15 } },
      ]),
    ]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect([p.openHour, p.closeHour]).toEqual([11, 15]);
    expect(p.hoursKnown).toBe(true);
  });

  it("handles a place that closes after midnight", async () => {
    // 22:00 → 02:00. A naive `hour >= open && hour < close` reports it shut at
    // 1am, which is exactly when a supper recommendation matters.
    googleReturns([withPeriods([{ open: { hour: 22 }, close: { hour: 2 } }])]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 1));
    expect([p.openHour, p.closeHour]).toEqual([22, 2]);
    expect(p.hoursKnown).toBe(true);
  });

  it("treats a period with no close as open-ended, not as closed", async () => {
    googleReturns([withPeriods([{ open: { hour: 0 } }])]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(p.closeHour).toBe(24);
    expect(p.hoursKnown).toBe(true);
  });

  it("admits when the hours are a placeholder rather than a reading", async () => {
    /* THE HONESTY FLAG. An earlier cut wrote every live place as 0→24 and the
       card rendered that as a fact — "Open 24h" on a place that shuts at six.
       `hoursKnown: false` is what lets the UI decline to state it. */
    googleReturns([place()]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(p.hoursKnown).toBe(false);
    expect([p.openHour, p.closeHour]).toEqual([0, 24]);
  });

  it("falls back to the first period rather than the placeholder when one exists", async () => {
    // Better a real published window that does not cover this hour than a
    // fabricated 24/7.
    googleReturns([withPeriods([{ open: { hour: 8 }, close: { hour: 17 } }])]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 23));
    expect([p.openHour, p.closeHour]).toEqual([8, 17]);
    expect(p.hoursKnown).toBe(true);
  });
});

describe("flavour from Google's types", () => {
  it("refuses to seed a vector from types that say nothing", async () => {
    /* `restaurant`, `food`, `establishment` carry no flavour information.
       Treating them as signal would give every live place a confident-looking
       palate the app never actually read. */
    googleReturns([place({ types: ["restaurant", "food", "point_of_interest", "establishment"] })]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(p.flavorKnown).toBe(false);
  });

  it("marks flavour known when an informative type is present", async () => {
    googleReturns([place({ types: ["ramen_restaurant", "restaurant"], primaryType: "ramen_restaurant" })]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(p.flavorKnown).toBe(true);
  });

  it("lands a place between the two cuisines it is tagged with", async () => {
    googleReturns([
      place({ id: "a", types: ["ramen_restaurant"] }),
      place({ id: "b", types: ["japanese_restaurant"] }),
      place({ id: "c", types: ["ramen_restaurant", "japanese_restaurant"] }),
    ]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    const [a, b, c] = ["a", "b", "c"].map((id) => got.find((p) => p.id === `g-${id}`)!);
    for (const dim of ["heat", "soupy", "rich"] as const) {
      const lo = Math.min(a.flavor[dim], b.flavor[dim]);
      const hi = Math.max(a.flavor[dim], b.flavor[dim]);
      expect(c.flavor[dim]).toBeGreaterThanOrEqual(lo);
      expect(c.flavor[dim]).toBeLessThanOrEqual(hi);
    }
  });

  it("gives every live place a canonical cuisine, not a raw Google type", async () => {
    /* `japanese_restaurant` matched nothing a curated place used, so live
       results shared no category with the catalogue: the repeat penalty never
       fired across tiers and every live place fell through the glyph table. */
    googleReturns([place({ types: ["japanese_restaurant"], primaryType: "japanese_restaurant" })]);
    const [p] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(p.cuisine).not.toContain("_restaurant");
    expect(p.cuisine.length).toBeGreaterThan(0);
  });
});

describe("the rest of the mapping", () => {
  it("translates each Google price band", async () => {
    googleReturns([
      place({ id: "1", priceLevel: "PRICE_LEVEL_INEXPENSIVE" }),
      place({ id: "2", priceLevel: "PRICE_LEVEL_MODERATE" }),
      place({ id: "3", priceLevel: "PRICE_LEVEL_EXPENSIVE" }),
      place({ id: "4", priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }),
    ]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(got.map((p) => p.priceLevel)).toEqual([1, 2, 3, 4]);
  });

  it("assumes mid-price when Google gives no band", async () => {
    googleReturns([place()]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))[0].priceLevel).toBe(2);
  });

  it("never asserts shelter without evidence", async () => {
    /* Shelter decides whether we send someone out in the rain, so asserting it
       on no evidence is how the app soaks somebody. `dineIn` is the honest
       proxy; absent means false, not true. */
    googleReturns([place({ id: "1", dineIn: true }), place({ id: "2" }), place({ id: "3", dineIn: false })]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12)).map((p) => p.sheltered)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps ratings when they exist and reports zero count when they do not", async () => {
    googleReturns([place({ id: "1", rating: 4.6, userRatingCount: 900 }), place({ id: "2" })]);
    const [a, b] = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect([a.rating, a.ratingCount]).toEqual([4.6, 900]);
    expect([b.rating, b.ratingCount]).toEqual([null, 0]);
  });

  it("drops results missing a location or a name instead of rendering a hole", async () => {
    googleReturns([
      place({ id: "1", location: undefined }),
      place({ id: "2", displayName: undefined }),
      place({ id: "3" }),
    ]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))).toHaveLength(1);
  });

  it("drops anything Google says is closed right now", async () => {
    googleReturns([place({ id: "1", currentOpeningHours: { openNow: false } }), place({ id: "2" })]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))).toHaveLength(1);
  });

  it("namespaces live ids so they cannot collide with curated ones", async () => {
    googleReturns([place()]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))[0].id).toBe("g-abc123");
  });
});

describe("merging with the curated catalogue", () => {
  it("keeps the curated entry when Google returns the same restaurant", async () => {
    // The curated record has real dish data; Google's has none. Preferring the
    // live duplicate would silently lose the menu.
    const dup = SEED_PLACES[0];
    googleReturns([place({ id: "dup", displayName: { text: dup.name } })]);
    const all = await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(all.filter((p) => p.name.toLowerCase() === dup.name.toLowerCase())).toHaveLength(1);
    expect(all.find((p) => p.name === dup.name)!.source).not.toBe("google");
  });

  it("matches duplicates case-insensitively", async () => {
    const dup = SEED_PLACES[0];
    googleReturns([place({ id: "dup", displayName: { text: dup.name.toUpperCase() } })]);
    const all = await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(all.length).toBe(SEED_PLACES.length);
  });
});

describe("the two-minute nearby cache", () => {
  // Two people at the same MRT exit — or one curl loop — used to cost one
  // paid search EACH. The cache is also half of the answer to the audit's
  // "unauthenticated endpoint spends money flat out" finding.

  it("answers a repeat of the same spot from memory", async () => {
    const spy = googleReturns([place()]);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("hands back clones, so one request's flags cannot leak into another", async () => {
    /* The recommend route marks pool entries with wantToTry from the
       REQUESTER'S saved list. Sharing cached objects would surface one
       device's bookmarks in a stranger's ranking — a privacy bug wearing a
       performance optimisation's clothes. */
    googleReturns([place()]);
    const first = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))[0];
    first.wantToTry = true;
    const second = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))[0];
    expect(second.wantToTry).toBeFalsy();
  });

  it("expires, because 'open now' is only true for so long", async () => {
    vi.useFakeTimers();
    try {
      const spy = googleReturns([place()]);
      await getCandidatePlaces(1.2841, 103.8515, 2, 12);
      vi.advanceTimersByTime(121_000);
      await getCandidatePlaces(1.2841, 103.8515, 2, 12);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys on the radius, so a widened relax step is a real refetch", async () => {
    const spy = googleReturns([place()]);
    await getCandidatePlaces(1.2841, 103.8515, 1.5, 12);
    await getCandidatePlaces(1.2841, 103.8515, 3, 12);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("remembers a genuinely empty street", async () => {
    const spy = googleReturns([]);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never remembers an outage as an empty street", async () => {
    // A timeout cached for two minutes would tell everyone at Raffles Place
    // that no restaurants exist during exactly the lunch rush that caused it.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    googleReturns([place()]);
    expect(live(await getCandidatePlaces(1.2841, 103.8515, 2, 12))).toHaveLength(1);
  });
});

describe("asking Google for what the diner actually wants", () => {
  /* THE REPORTED BUG. "spicy soup near me" on Google returns spicy soup; the
     app returned a McDonald's. The cause was not the scorer — it was that the
     craving never left the building. getCandidatePlaces only ever ran a
     proximity search, so a craving could re-rank the twenty nearest doors and
     nothing more. */

  const bodyOf = (spy: ReturnType<typeof googleReturns>, i: number) =>
    JSON.parse(String(spy.mock.calls[i][1]?.body ?? "{}"));
  const urlOf = (spy: ReturnType<typeof googleReturns>, i: number) => String(spy.mock.calls[i][0]);

  it("sends the craving to Google's TEXT search, not just the nearby one", async () => {
    const spy = googleReturns([place()]);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12, "spicy soup");

    const endpoints = spy.mock.calls.map((_, i) => urlOf(spy, i));
    expect(endpoints.some((u) => u.includes("searchText"))).toBe(true);
    expect(endpoints.some((u) => u.includes("searchNearby"))).toBe(true);

    const textCall = spy.mock.calls.findIndex((_, i) => urlOf(spy, i).includes("searchText"));
    expect(bodyOf(spy, textCall).textQuery).toBe("spicy soup");
  });

  it("biases the text search to the diner rather than restricting it", async () => {
    // A restriction returns NOTHING when the street has no spicy soup, and an
    // empty answer is worse than a near-miss the scorer can rank down.
    const spy = googleReturns([place()]);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12, "ramen");
    const i = spy.mock.calls.findIndex((_, n) => urlOf(spy, n).includes("searchText"));
    expect(bodyOf(spy, i).locationBias).toBeTruthy();
    expect(bodyOf(spy, i).locationRestriction).toBeUndefined();
  });

  it("costs exactly one call when nothing was asked for", async () => {
    // The ordinary "Eat now" path must not start paying for a second SKU.
    const spy = googleReturns([place()]);
    await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(urlOf(spy, 0)).toContain("searchNearby");
  });

  it("keeps both branches of a chain, deduping only on id", async () => {
    /* Two McDonald's are two different places that share a name. Deduping the
       merged pool by NAME would silently drop the nearer one. */
    googleReturns([
      place({ id: "a", displayName: { text: "McDonald's" } }),
      place({ id: "b", displayName: { text: "McDonald's" } }),
    ]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12, "burger"));
    expect(got.filter((p) => p.name === "McDonald's")).toHaveLength(2);
  });

  it("carries Google's relevance rank through as craving evidence", async () => {
    /* Position in a text-search result IS information: the top hit is what
       Google thinks best answers the craving, the last is a stretch. Without
       it a place whose name never says "soup" can serve nothing else and still
       score zero. */
    googleReturns([
      place({ id: "a", displayName: { text: "Best Match" } }),
      place({ id: "b", displayName: { text: "Middling" } }),
      place({ id: "c", displayName: { text: "Stretch" } }),
    ]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12, "spicy soup"));
    const ev = (n: string) => got.find((p) => p.name === n)!.cravingEvidence!;
    expect(ev("Best Match")).toBeCloseTo(0.55, 5);
    expect(ev("Stretch")).toBeCloseTo(0.2, 5);
    expect(ev("Best Match")).toBeGreaterThan(ev("Middling"));
    expect(ev("Middling")).toBeGreaterThan(ev("Stretch"));
  });

  it("gives nearby-only results no craving evidence at all", async () => {
    googleReturns([place()]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12));
    expect(got[0].cravingEvidence).toBeUndefined();
  });

  it("returns each place once when both searches find it", async () => {
    googleReturns([place({ id: "same" })]);
    const got = live(await getCandidatePlaces(1.2841, 103.8515, 2, 12, "test kitchen"));
    expect(got.filter((p) => p.id === "g-same")).toHaveLength(1);
  });
});

describe("when Google fails", () => {
  it("still serves the catalogue on a rejected key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, text: async () => "API key not valid" }) as unknown as Response),
    );
    const all = await getCandidatePlaces(1.2841, 103.8515, 2, 12);
    expect(all.length).toBe(SEED_PLACES.length);
  });

  it("still serves the catalogue on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect((await getCandidatePlaces(1.2841, 103.8515, 2, 12)).length).toBe(SEED_PLACES.length);
  });

  it("survives a 200 whose body is not the shape Google documents", async () => {
    googleReturns(undefined as unknown as unknown[]);
    expect((await getCandidatePlaces(1.2841, 103.8515, 2, 12)).length).toBe(SEED_PLACES.length);
  });
});
