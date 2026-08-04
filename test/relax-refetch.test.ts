import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { vec } from "@/lib/flavor";
import { clearRateLimit } from "@/lib/ratelimit";
import type { Place } from "@/lib/data/seed";

// "WIDENED THE SEARCH TO ~3 KM" HAS TO MEAN A WIDER SEARCH. The relax loop
// used to re-filter a pool fetched once at the profile's own radius, so the
// note described a refetch that never happened: the curated catalogue widened,
// the live search did not, and a user in a quiet neighbourhood was told
// "nothing within 8 km" on the strength of a 1.5 km fetch. These tests pin the
// contract from the outside — through the route — so the copy and the fetch
// can never drift apart again.

const getCandidatePlaces = vi.hoisted(() =>
  vi.fn(async (_lat: number, _lng: number, _maxKm: number, _hourSg: number): Promise<Place[]> => []),
);

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/context", () => ({
  buildContext: vi.fn(async () => ({
    hourSg: 12,
    mealPeriod: "lunch",
    raining: false,
    forecast: null,
  })),
}));
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  getCandidatePlaces,
}));
// Identity stubs: enrichment is not under test, and the real modules would
// spend live Places/LLM calls the moment a key is stubbed into the env.
vi.mock("@/lib/enrich", () => ({ enrichGenerics: vi.fn(async (p: Place[]) => p) }));
vi.mock("@/lib/dishes", () => ({ enrichPicks: vi.fn(async (p: Place[]) => p) }));

const { GET } = await import("@/app/api/recommend/route");

const ORIGIN = { lat: 1.2841, lng: 103.8515 };

const place = (id: string, latOffset: number): Place => ({
  id,
  name: `Kitchen ${id}`,
  cuisine: "japanese",
  lat: ORIGIN.lat + latOffset,
  lng: ORIGIN.lng,
  priceLevel: 2,
  flavor: vec({ soupy: 0.6, rich: 0.5 }),
  openHour: 0,
  closeHour: 24,
  sheltered: true,
  dishes: [],
  source: "google",
  rating: 4.4,
  ratingCount: 120,
  flavorKnown: true,
  hoursKnown: true,
});

// ~2 km north of the origin: outside the default 1.5 km, inside the 3 km step.
const FAR = place("g-far", 0.018);
// Walking distance, for the common path.
const NEAR = place("g-near", 0.002);

const request = (extra = "") =>
  GET(new NextRequest(`https://fnm.app/api/recommend?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}${extra}`));

beforeEach(() => {
  getCandidatePlaces.mockReset();
  clearRateLimit();
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the relax loop and the live fetch", () => {
  it("refetches wider when the strict radius finds nothing, and says so", async () => {
    getCandidatePlaces.mockImplementation(async (_lat, _lng, maxKm: number) =>
      maxKm > 1.5 ? [FAR] : [],
    );
    const res = await request();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.best.placeId).toBe("g-far");
    expect(body.note).toBe("widened the search to ~3 km");
    // The note is now a description of something that happened: a second,
    // wider fetch — not a re-filter of the pool the first fetch returned.
    expect(getCandidatePlaces).toHaveBeenCalledTimes(2);
    expect(getCandidatePlaces.mock.calls[1][2]).toBe(3);
  });

  it("spends exactly one fetch on the common path", async () => {
    getCandidatePlaces.mockResolvedValue([NEAR]);
    const res = await request();
    const body = await res.json();

    expect(body.best.placeId).toBe("g-near");
    expect(body.note).toBeNull();
    expect(getCandidatePlaces).toHaveBeenCalledTimes(1);
  });

  it("never refetches without a key — the pool cannot widen", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    getCandidatePlaces.mockResolvedValue([]);
    const res = await request();

    expect(res.status).toBe(404);
    expect(getCandidatePlaces).toHaveBeenCalledTimes(1);
  });

  it("stops refetching past the 5 km cap instead of burning calls that cannot differ", async () => {
    getCandidatePlaces.mockResolvedValue([]);
    const res = await request();

    expect(res.status).toBe(404);
    // 1.5 km (base) → 3 km → 8 km (capped to 5). The 50 and 120 km steps rank
    // the island-wide catalogue only; a third refetch would return the same
    // capped circle, so it must not be made.
    expect(getCandidatePlaces).toHaveBeenCalledTimes(3);
    expect(getCandidatePlaces.mock.calls.map((c) => c[2])).toEqual([1.5, 3, 8]);
  });

  it("does not claim to know your taste from a string it could not read", async () => {
    /* "i want something to eat" is all stop-words: zero terms, zero flavour,
       zero avoids. A non-null parse used to flip palateKnown anyway, so the
       very first sentence on the card — "matches your taste" — was built on a
       string that told the app nothing. */
    getCandidatePlaces.mockResolvedValue([NEAR]);
    const res = await request(`&craving=${encodeURIComponent("i want something to eat")}`);
    const body = await res.json();
    expect(body.palateKnown).toBe(false);
    expect(body.craving).toBeNull();
    expect(body.note).toContain("Couldn't find a food wish");
  });

  it("counts a readable craving as real taste knowledge", async () => {
    getCandidatePlaces.mockResolvedValue([NEAR]);
    const body = await (await request("&craving=ramen")).json();
    expect(body.palateKnown).toBe(true);
    expect(body.craving?.text).toBe("ramen");
  });

  it("cuts off a loop before it can spend the quota", async () => {
    // The endpoint is unauthenticated and each call spends real money; the
    // 31st request inside a minute gets a 429, not a Places bill.
    getCandidatePlaces.mockResolvedValue([NEAR]);
    let last: Response = await request();
    for (let i = 0; i < 30; i += 1) last = await request();
    expect(last.status).toBe(429);
    expect(getCandidatePlaces).toHaveBeenCalledTimes(30);
  });
});
