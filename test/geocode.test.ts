import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeConfigured, lookupPlaces } from "@/lib/geocode";
import { searchAreas } from "@/lib/areas";
import { clearHealth } from "@/lib/health";
import { defaultPlan, planFromPlace } from "@/lib/plan";

// THE TABLE CANNOT HOLD A WORKPLACE. Typing "Micron" — a real place where real
// people eat lunch every day — answered "No area called Micron. Try a nearby
// MRT or town name", which is the app telling somebody that where they are is
// not a valid place to be. Offices, campuses, business parks and MRT exits
// number in the tens of thousands; no hardcoded list reaches them.

const KEY = "GOOGLE_PLACES_API_KEY";

const googleReturns = (places: unknown[]) => {
  const spy = vi.fn(
    async (_url: string, _init: RequestInit) =>
      ({ ok: true, status: 200, json: async () => ({ places }) }) as unknown as Response,
  );
  vi.stubGlobal("fetch", spy);
  return spy;
};

const place = (name: string, over: Record<string, unknown> = {}) => ({
  displayName: { text: name },
  location: { latitude: 1.4382, longitude: 103.7891 },
  formattedAddress: "1 Woodlands Industrial Park D1, Singapore 738406",
  ...over,
});

beforeEach(() => {
  clearHealth();
  vi.stubEnv(KEY, "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the gap this fills", () => {
  it("confirms the area table genuinely cannot answer these", () => {
    // Not hypothetical: these are the shapes of thing people type, and every
    // one of them is a real lunch location.
    for (const q of ["Micron", "Changi Business Park", "Mapletree Business City", "one-north", "Seletar Aerospace"]) {
      expect(searchAreas(q), q).toEqual([]);
    }
  });
});

describe("looking a place up", () => {
  it("returns a usable location", async () => {
    googleReturns([place("Micron Semiconductor Asia")]);
    const [got] = await lookupPlaces("Micron");
    expect(got.label).toBe("Micron Semiconductor Asia");
    expect(got.lat).toBeCloseTo(1.4382, 3);
    expect(got.lng).toBeCloseTo(103.7891, 3);
  });

  it("keeps the road but drops the postal code", async () => {
    // "Singapore 738406" is noise in a 390px sheet; the road name is the part
    // that tells two branches of the same company apart.
    googleReturns([place("Micron Semiconductor Asia")]);
    const [got] = await lookupPlaces("Micron");
    expect(got.address).toBe("1 Woodlands Industrial Park D1");
    expect(got.address).not.toMatch(/\d{6}/);
  });

  it("returns several so a repeated name can be told apart", async () => {
    /* THE REASON ADDRESSES ARE SHOWN AT ALL. "Micron" is more than one
       building; silently picking the first would send somebody across the
       island for lunch. */
    googleReturns([
      place("Micron Semiconductor Asia", { formattedAddress: "1 Woodlands Industrial Park D1, Singapore 738406" }),
      place("Micron Technology", { formattedAddress: "990 Bendemeer Rd, Singapore 339942" }),
    ]);
    const got = await lookupPlaces("Micron");
    expect(got).toHaveLength(2);
    expect(new Set(got.map((g) => g.address)).size).toBe(2);
  });

  it("restricts the search to Singapore", async () => {
    /* RESTRICT, not bias. Lunch is somewhere you can reach before it gets
       cold, so a same-named building in another country is never the answer —
       and offering one would be worse than offering nothing. */
    const spy = googleReturns([place("Somewhere")]);
    await lookupPlaces("Micron");
    const body = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(body.locationRestriction).toBeDefined();
    expect(body.locationBias).toBeUndefined();
  });

  it("asks for the narrowest field mask that answers the question", async () => {
    // Every extra field moves this into a pricier Places SKU for information
    // nobody on the sheet reads.
    const spy = googleReturns([place("Somewhere")]);
    await lookupPlaces("Micron");
    const mask = (spy.mock.calls[0][1].headers as Record<string, string>)["X-Goog-FieldMask"];
    expect(mask).toBe("places.displayName,places.location,places.formattedAddress");
  });

  it("does NOT filter to food, unlike the saved-post resolver", async () => {
    /* There the filter stops a caption resolving to a shopping mall. Here the
       mall IS the answer — it is where the person will be standing. */
    googleReturns([place("Jewel Changi Airport", { types: ["shopping_mall"] })]);
    expect(await lookupPlaces("Jewel")).toHaveLength(1);
  });

  it("caps how many it returns", async () => {
    googleReturns(Array.from({ length: 20 }, (_, i) => place(`Place ${i}`)));
    expect((await lookupPlaces("a b c")).length).toBeLessThanOrEqual(5);
    expect(await lookupPlaces("a b c", 2)).toHaveLength(2);
  });

  it("truncates a very long name rather than breaking the layout", async () => {
    googleReturns([place("X".repeat(300))]);
    expect((await lookupPlaces("Micron"))[0].label.length).toBeLessThanOrEqual(40);
  });

  it("skips results with no coordinates", async () => {
    // A name with nowhere to go is not a location.
    googleReturns([place("No Location", { location: undefined }), place("Fine")]);
    expect(await lookupPlaces("Micron")).toHaveLength(1);
  });

  it("copes with a missing address", async () => {
    googleReturns([place("Nameless Road", { formattedAddress: undefined })]);
    expect((await lookupPlaces("Micron"))[0].address).toBeNull();
  });
});

describe("staying cheap and quiet", () => {
  it("does not call anybody without a key", async () => {
    vi.stubEnv(KEY, "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await lookupPlaces("Micron")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(geocodeConfigured()).toBe(false);
  });

  it("does not call anybody for a query too short to mean anything", async () => {
    // Every keystroke below three characters would be a paid call matching
    // half the island.
    const spy = googleReturns([place("x")]);
    expect(await lookupPlaces("mi")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns nothing rather than throwing when the key is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "denied" }) as unknown as Response),
    );
    await expect(lookupPlaces("Micron")).resolves.toEqual([]);
  });

  it("records WHY it failed, so a dead key is visible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"API key not valid"}}',
      }) as unknown as Response),
    );
    await lookupPlaces("Micron");
    expect(spy.mock.calls[0][0]).toContain("[fnm] places auth");
  });

  it("survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(lookupPlaces("Micron")).resolves.toEqual([]);
  });

  it("survives a 200 shaped nothing like the contract", async () => {
    googleReturns(undefined as unknown as unknown[]);
    await expect(lookupPlaces("Micron")).resolves.toEqual([]);
  });
});

describe("pinning what was found", () => {
  it("keeps the name the user searched for, not the area it sits in", async () => {
    /* `labelForCoords` would answer "Woodlands" for the building somebody
       typed "Micron" to find — technically true, and not what they asked for.
       What they typed is what the plan bar should read back. */
    const p = planFromPlace(1.4382, 103.7891, "Micron Semiconductor Asia", defaultPlan());
    expect(p.label).toBe("Micron Semiconductor Asia");
    expect(p.lat).toBe(1.4382);
  });

  it("pins it, so the next GPS fix does not overwrite the choice", async () => {
    expect(planFromPlace(1.4382, 103.7891, "Micron", defaultPlan()).locationMode).toBe("manual");
  });

  it("caps the label so it cannot break the plan bar", async () => {
    expect(planFromPlace(1.4, 103.8, "X".repeat(200), defaultPlan()).label.length).toBeLessThanOrEqual(40);
  });

  it("leaves the rest of the plan alone", async () => {
    const base = { ...defaultPlan(), hour: 19, hourSetAt: 123 };
    const p = planFromPlace(1.4, 103.8, "Micron", base);
    expect(p.hour).toBe(19);
    expect(p.hourSetAt).toBe(123);
  });
});
