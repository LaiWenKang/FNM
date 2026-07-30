import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContext, getWeather, mealPeriod, sgHour } from "@/lib/context";

// Context decides the weather term, which hours count as open, and which meal
// the app thinks it is recommending. Every one of those is wrong at a boundary
// if the arithmetic is off by an hour, and none of it was covered.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Singapore time", () => {
  it("adds eight hours to UTC", () => {
    expect(sgHour(new Date("2026-07-30T04:00:00Z"))).toBe(12);
  });

  it("wraps past midnight instead of returning 25", () => {
    // THE OFF-BY-ONE-DAY BUG THIS GUARDS. 20:00 UTC is 04:00 the next day in
    // Singapore; without the modulo it is hour 28, which is not a time and
    // would fall through every open-hours comparison in the app.
    expect(sgHour(new Date("2026-07-30T20:00:00Z"))).toBe(4);
    expect(sgHour(new Date("2026-07-30T16:00:00Z"))).toBe(0);
  });

  it("never returns an hour outside 0–23", () => {
    for (let h = 0; h < 24; h += 1) {
      const v = sgHour(new Date(Date.UTC(2026, 6, 30, h)));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(24);
    }
  });
});

describe("meal periods", () => {
  it("names each period at its middle", () => {
    expect(mealPeriod(8)).toBe("breakfast");
    expect(mealPeriod(12)).toBe("lunch");
    expect(mealPeriod(19)).toBe("dinner");
    expect(mealPeriod(2)).toBe("supper");
  });

  it("puts every boundary hour on exactly one side", () => {
    // Boundaries are where meal-period bugs live, and the app's whole pitch is
    // knowing what meal it is.
    expect(mealPeriod(5)).toBe("supper");
    expect(mealPeriod(6)).toBe("breakfast");
    expect(mealPeriod(10)).toBe("breakfast");
    expect(mealPeriod(11)).toBe("lunch");
    expect(mealPeriod(14)).toBe("lunch");
    expect(mealPeriod(15)).toBe("dinner");
    expect(mealPeriod(20)).toBe("dinner");
    expect(mealPeriod(21)).toBe("supper");
  });

  it("covers all 24 hours with no gaps", () => {
    const seen = new Set<string>();
    for (let h = 0; h < 24; h += 1) {
      const p = mealPeriod(h);
      expect(p).toBeTruthy();
      seen.add(p);
    }
    expect(seen).toEqual(new Set(["breakfast", "lunch", "dinner", "supper"]));
  });
});

describe("weather", () => {
  const payload = {
    area_metadata: [
      { name: "Ang Mo Kio", label_location: { latitude: 1.375, longitude: 103.839 } },
      { name: "City", label_location: { latitude: 1.2841, longitude: 103.8515 } },
    ],
    items: [
      {
        forecasts: [
          { area: "Ang Mo Kio", forecast: "Fair (Day)" },
          { area: "City", forecast: "Thundery Showers" },
        ],
      },
    ],
  };

  const ok = (body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response));

  it("picks the forecast for the nearest reporting area", async () => {
    ok(payload);
    // Standing in the CBD must not be given Ang Mo Kio's weather.
    expect(await getWeather(1.2841, 103.8515)).toEqual({
      raining: true,
      forecast: "Thundery Showers",
    });
  });

  it("reads showers and thunder as rain, and fair weather as not", async () => {
    ok(payload);
    expect((await getWeather(1.375, 103.839)).raining).toBe(false);
  });

  it("reports no forecast rather than guessing when NEA is down", async () => {
    /* THE HONEST-FAILURE RULE. `forecast: null` means "we do not know"; the app
       shows nothing rather than claiming sunshine. Returning `raining: false`
       alongside it is the safe default — it withholds the shelter bonus rather
       than inventing one. */
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response));
    expect(await getWeather(1.28, 103.85)).toEqual({ raining: false, forecast: null });
  });

  it("survives a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect((await getWeather(1.28, 103.85)).forecast).toBeNull();
  });

  it("survives a 200 with a payload shaped nothing like the contract", async () => {
    // Government APIs change shape without warning. An unhandled read here
    // would take down every recommendation.
    ok({ nonsense: true });
    expect((await getWeather(1.28, 103.85)).forecast).toBeNull();
  });

  it("survives an empty forecast list", async () => {
    ok({ area_metadata: [], items: [] });
    expect((await getWeather(1.28, 103.85)).forecast).toBeNull();
  });
});

describe("buildContext", () => {
  const noWeather = () =>
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

  it("honours the hour the client is planning for", async () => {
    // The client sends the hour it is actually planning FOR — a user picking
    // "dinner at 7" from a phone in another timezone must not get server time.
    noWeather();
    expect((await buildContext(1.28, 103.85, 19)).hourSg).toBe(19);
    expect((await buildContext(1.28, 103.85, 19)).mealPeriod).toBe("dinner");
  });

  it("accepts hour 0 rather than treating it as absent", async () => {
    // The classic falsy-zero bug: midnight is a real planning hour, and
    // `hourOverride || sgHour()` would silently discard it.
    noWeather();
    expect((await buildContext(1.28, 103.85, 0)).hourSg).toBe(0);
  });

  it("clamps an out-of-range hour instead of propagating it", async () => {
    noWeather();
    expect((await buildContext(1.28, 103.85, 99)).hourSg).toBe(23);
    expect((await buildContext(1.28, 103.85, -5)).hourSg).toBe(0);
  });

  it("ignores a non-numeric hour and falls back to the clock", async () => {
    noWeather();
    const c = await buildContext(1.28, 103.85, NaN);
    expect(Number.isFinite(c.hourSg)).toBe(true);
    expect(c.hourSg).toBeGreaterThanOrEqual(0);
    expect(c.hourSg).toBeLessThan(24);
  });

  it("floors a fractional hour", async () => {
    noWeather();
    expect((await buildContext(1.28, 103.85, 12.9)).hourSg).toBe(12);
  });

  it("still returns a usable context with the weather service down", async () => {
    // Weather is an enhancement. Losing it must never cost a recommendation.
    noWeather();
    const c = await buildContext(1.28, 103.85, 12);
    expect(c).toEqual({ hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null });
  });
});
