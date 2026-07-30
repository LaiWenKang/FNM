import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeConfigured, placeById, suggestPlaces } from "@/lib/geocode";
import { searchAreas } from "@/lib/areas";
import { clearHealth } from "@/lib/health";
import { defaultPlan, planFromPlace } from "@/lib/plan";

// A SEARCH BOX THAT BEHAVES LIKE A SEARCH BOX.
//
// The first cut used Places TEXT SEARCH, which answers "find this thing" once
// you have finished describing it — the wrong verb for a field somebody is
// typing into. Autocomplete narrows while you type, and is billed per SESSION
// rather than per request, so it is both the better feel and the cheaper call.
// The session token is what makes that pricing hold, which is why it is
// asserted here rather than assumed.

const KEY = "GOOGLE_PLACES_API_KEY";
const TOKEN = "11111111-2222-3333-4444-555555555555";

const respondsWith = (body: unknown, ok = true, status = 200) => {
  const spy = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response,
  );
  vi.stubGlobal("fetch", spy);
  return spy;
};

const prediction = (main: string, secondary: string | null, id = "ChIJ_test") => ({
  placePrediction: {
    placeId: id,
    text: { text: main },
    structuredFormat: {
      mainText: { text: main },
      ...(secondary ? { secondaryText: { text: secondary } } : {}),
    },
  },
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

describe("suggesting while you type", () => {
  it("returns the main and secondary halves separately", async () => {
    /* A Maps dropdown is two lines for a reason: "Micron" is three buildings
       in Singapore, and the road is the only thing that tells them apart. */
    respondsWith({
      suggestions: [prediction("Micron Semiconductor Asia", "1 North Coast Drive, Singapore")],
    });
    const [s] = await suggestPlaces("micron", TOKEN);
    expect(s.main).toBe("Micron Semiconductor Asia");
    expect(s.secondary).toBe("1 North Coast Drive");
    expect(s.id).toBe("ChIJ_test");
  });

  it("starts from TWO characters, not three", async () => {
    // The whole point of autocomplete is that the list narrows as you type. A
    // three-character floor makes the first third of the interaction dead.
    const spy = respondsWith({ suggestions: [prediction("Bugis", "Singapore")] });
    expect(await suggestPlaces("mi", TOKEN)).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
  });

  it("still refuses a single character", async () => {
    // One letter matches the whole island and is never a real intent.
    const spy = respondsWith({ suggestions: [] });
    expect(await suggestPlaces("m", TOKEN)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the session token, which is what makes this cheap", async () => {
    /* Autocomplete bills per SESSION: every keystroke from the first letter to
       the selection shares one token and bills once. Dropping it would bill
       each keystroke separately — the same money as text search, with none of
       the benefit. */
    const spy = respondsWith({ suggestions: [] });
    await suggestPlaces("micron", TOKEN);
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string).sessionToken).toBe(TOKEN);
  });

  it("restricts to Singapore by region code", async () => {
    // Cleaner than a bounding box: it excludes Johor without clipping Tuas.
    const spy = respondsWith({ suggestions: [] });
    await suggestPlaces("micron", TOKEN);
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string).includedRegionCodes).toEqual(["sg"]);
  });

  it("falls back to the flat text when there is no structured format", async () => {
    respondsWith({ suggestions: [{ placePrediction: { placeId: "x", text: { text: "Somewhere" } } }] });
    expect((await suggestPlaces("some", TOKEN))[0].main).toBe("Somewhere");
  });

  it("skips a prediction with no id, since it could never be selected", async () => {
    // Without a place id there is nothing to exchange for coordinates, so the
    // row would look identical to the others and do nothing when tapped.
    respondsWith({
      suggestions: [{ placePrediction: { text: { text: "No Id" } } }, prediction("Fine", null, "ok")],
    });
    const got = await suggestPlaces("fine", TOKEN);
    expect(got).toHaveLength(1);
    expect(got[0].main).toBe("Fine");
  });

  it("copes with a prediction that has no secondary line", async () => {
    respondsWith({ suggestions: [prediction("Bugis", null)] });
    expect((await suggestPlaces("bugis", TOKEN))[0].secondary).toBeNull();
  });

  it("keeps the list short enough to sit under a text field", async () => {
    respondsWith({
      suggestions: Array.from({ length: 20 }, (_, i) => prediction(`Place ${i}`, "Road", `id${i}`)),
    });
    expect((await suggestPlaces("place", TOKEN)).length).toBeLessThanOrEqual(6);
  });

  it("truncates a very long name rather than breaking the row", async () => {
    respondsWith({ suggestions: [prediction("X".repeat(300), "Y".repeat(300))] });
    const [got] = await suggestPlaces("xxx", TOKEN);
    expect(got.main.length).toBeLessThanOrEqual(40);
    expect(got.secondary!.length).toBeLessThanOrEqual(52);
  });
});

describe("turning a choice into coordinates", () => {
  const details = {
    displayName: { text: "Micron Semiconductor Asia" },
    location: { latitude: 1.4561, longitude: 103.7922 },
    formattedAddress: "1 N Coast Dr, Singapore 757432",
  };

  it("returns a usable location", async () => {
    respondsWith(details);
    const got = await placeById("ChIJ_test", TOKEN);
    expect(got?.label).toBe("Micron Semiconductor Asia");
    expect(got?.lat).toBeCloseTo(1.4561, 4);
    expect(got?.address).toBe("1 N Coast Dr");
  });

  it("closes the session it was opened with", async () => {
    // The details call is what ends an autocomplete session; sending a
    // different token would leave the session open and bill twice.
    const spy = respondsWith(details);
    await placeById("ChIJ_test", TOKEN);
    expect(spy.mock.calls[0][0]).toContain(`sessionToken=${TOKEN}`);
  });

  it("asks for the three fields the plan bar needs and nothing else", async () => {
    const spy = respondsWith(details);
    await placeById("ChIJ_test", TOKEN);
    const mask = (spy.mock.calls[0][1]!.headers as Record<string, string>)["X-Goog-FieldMask"];
    expect(mask).toBe("displayName,location,formattedAddress");
  });

  it("escapes the id rather than pasting it into a URL", async () => {
    const spy = respondsWith(details);
    await placeById("weird/id?x=1", TOKEN);
    expect(spy.mock.calls[0][0]).not.toContain("?x=1&");
    expect(spy.mock.calls[0][0]).toContain("weird%2Fid%3Fx%3D1");
  });

  it("returns null rather than a place with nowhere to go", async () => {
    respondsWith({ displayName: { text: "Nowhere" } });
    expect(await placeById("ChIJ_test", TOKEN)).toBeNull();
  });

  it("returns null for an empty id", async () => {
    const spy = respondsWith(details);
    expect(await placeById("  ", TOKEN)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("staying cheap and quiet", () => {
  it("does not call anybody without a key", async () => {
    vi.stubEnv(KEY, "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await suggestPlaces("micron", TOKEN)).toEqual([]);
    expect(await placeById("x", TOKEN)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(geocodeConfigured()).toBe(false);
  });

  it("returns nothing rather than throwing when the key is rejected", async () => {
    respondsWith({ error: { message: "denied" } }, false, 403);
    await expect(suggestPlaces("micron", TOKEN)).resolves.toEqual([]);
    respondsWith({ error: { message: "denied" } }, false, 403);
    await expect(placeById("x", TOKEN)).resolves.toBeNull();
  });

  it("records WHY it failed, so a dead key is visible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    respondsWith({ error: { message: "API key not valid" } }, false, 400);
    await suggestPlaces("micron", TOKEN);
    expect(spy.mock.calls[0][0]).toContain("[fnm] places auth");
  });

  it("survives a network failure on both calls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(suggestPlaces("micron", TOKEN)).resolves.toEqual([]);
    await expect(placeById("x", TOKEN)).resolves.toBeNull();
  });

  it("survives a 200 shaped nothing like the contract", async () => {
    respondsWith({ nonsense: true });
    await expect(suggestPlaces("micron", TOKEN)).resolves.toEqual([]);
  });
});

describe("pinning what was chosen", () => {
  it("keeps the name the user searched for, not the area it sits in", () => {
    /* `labelForCoords` would answer "Woodlands" for the building somebody
       typed "Micron" to find — technically true, and not what they asked. */
    const p = planFromPlace(1.4561, 103.7922, "Micron Semiconductor Asia", defaultPlan());
    expect(p.label).toBe("Micron Semiconductor Asia");
    expect(p.lat).toBe(1.4561);
  });

  it("pins it, so the next GPS fix does not overwrite the choice", () => {
    expect(planFromPlace(1.4561, 103.7922, "Micron", defaultPlan()).locationMode).toBe("manual");
  });

  it("caps the label so it cannot break the plan bar", () => {
    expect(planFromPlace(1.4, 103.8, "X".repeat(200), defaultPlan()).label.length).toBeLessThanOrEqual(40);
  });

  it("leaves the rest of the plan alone", () => {
    const base = { ...defaultPlan(), hour: 19, hourSetAt: 123 };
    const p = planFromPlace(1.4, 103.8, "Micron", base);
    expect(p.hour).toBe(19);
    expect(p.hourSetAt).toBe(123);
  });
});
