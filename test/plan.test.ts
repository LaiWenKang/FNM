import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AREAS, DEFAULT_AREA, PICKER_AREAS, labelForCoords, nearestArea, searchAreas } from "@/lib/areas";
import {
  MOVED_KM,
  Plan,
  defaultPlan,
  effectiveHour,
  formatHour,
  kmBetween,
  loadPlan,
  mealFor,
  planFromArea,
  planFromCoords,
  planParams,
  planWithHour,
  savePlan,
} from "@/lib/plan";

// WHERE and WHEN are the only two inputs the user gives on purpose, and every
// recommendation is computed from them. A wrong label is cosmetic; a wrong
// coordinate or a stale pinned hour silently changes the answer.

/** localStorage does not exist in a node test environment. */
function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

beforeEach(() => stubStorage());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the area table", () => {
  it("has unique ids and a sane default", () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
    expect(DEFAULT_AREA).toBeDefined();
    expect(PICKER_AREAS.length).toBeGreaterThan(0);
    expect(PICKER_AREAS.length).toBeLessThan(AREAS.length);
  });

  it("places every area inside Singapore", () => {
    // A transposed lat/lng would put a "nearby" pick in the Indian Ocean and
    // the distance term would quietly rank it last forever.
    for (const a of AREAS) {
      expect(a.lat).toBeGreaterThan(1.15);
      expect(a.lat).toBeLessThan(1.48);
      expect(a.lng).toBeGreaterThan(103.6);
      expect(a.lng).toBeLessThan(104.1);
    }
  });
});

describe("finding an area by typing", () => {
  /* EIGHT OF FORTY-NINE WERE REACHABLE. The Change sheet offered eight CBD
     chips, so the app could LABEL you in Yishun or Tampines from a GPS fix but
     you could not CHOOSE either — and the thing you most want to set by hand is
     where you will be at lunchtime, not where you are standing now. */

  it("reaches an area that has no chip", () => {
    for (const name of ["Yishun", "Tampines", "Jurong East", "Woodlands", "Bedok", "Changi Airport"]) {
      expect(searchAreas(name).map((a) => a.label)).toContain(name);
    }
  });

  it("can reach EVERY area in the table", () => {
    // The point of the field is that nothing in the list is unreachable.
    for (const a of AREAS) {
      expect(searchAreas(a.label).map((x) => x.id), `unreachable: ${a.label}`).toContain(a.id);
    }
  });

  it("ignores case, spaces and punctuation on both sides", () => {
    // Nobody types "Choa Chu Kang" with the spacing the table happens to use.
    for (const q of ["choa chu kang", "ChoaChuKang", "choa-chu-kang", "  CHOA CHU KANG  "]) {
      expect(searchAreas(q)[0]?.label, q).toBe("Choa Chu Kang");
    }
  });

  it("matches on a fragment, not just the start", () => {
    expect(searchAreas("kang").map((a) => a.label)).toEqual(
      expect.arrayContaining(["Yio Chu Kang", "Choa Chu Kang"]),
    );
  });

  it("puts a prefix match above a mid-word one", () => {
    // Typing "bu" should offer Bugis before Bukit Batok, not alphabetically.
    expect(searchAreas("bugis")[0].label).toBe("Bugis");
    expect(searchAreas("tampines")[0].label).toBe("Tampines");
  });

  it("prefers the shorter label when both match at the same place", () => {
    // "Bukit" is a prefix of three areas; the exact one a user typed in full
    // must not sit under a longer neighbour.
    expect(searchAreas("bukit timah")[0].label).toBe("Bukit Timah");
  });

  it("returns nothing for an empty query, so the chips stay put", () => {
    expect(searchAreas("")).toEqual([]);
    expect(searchAreas("   ")).toEqual([]);
  });

  it("returns nothing rather than a wrong guess for a place that is not here", () => {
    /* An area picker that silently offers the nearest spelling would send
       somebody to the wrong side of the island. Empty is the honest answer,
       and the sheet says so in words. */
    expect(searchAreas("London")).toEqual([]);
    expect(searchAreas("zzzz")).toEqual([]);
  });

  it("caps the list so the sheet cannot become a scroll", () => {
    // A one-letter query matches most of the island.
    expect(searchAreas("a").length).toBeLessThanOrEqual(8);
    expect(searchAreas("a", 3)).toHaveLength(3);
  });

  it("never returns duplicates", () => {
    const got = searchAreas("bukit");
    expect(new Set(got.map((a) => a.id)).size).toBe(got.length);
  });

  it("returns areas that can actually be selected", () => {
    // Every result has to survive the round trip through planFromArea, or the
    // chip is decorative.
    for (const a of searchAreas("tampines")) {
      expect(planFromArea(a.id, defaultPlan()).label).toBe(a.label);
    }
  });
});

describe("labelling a GPS fix", () => {
  it("names the area you are standing in", () => {
    expect(labelForCoords(DEFAULT_AREA.lat, DEFAULT_AREA.lng)).toBe(DEFAULT_AREA.label);
  });

  it("says 'Near' only in the middle band", () => {
    // 2–5 km from the nearest centroid. Found by sweeping the island rather
    // than by offsetting a CBD area — the table is dense downtown, so nudging
    // 3 km north of Raffles Place just lands you inside a DIFFERENT area.
    const { km } = nearestArea(1.21, 103.82);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(5);
    expect(labelForCoords(1.21, 103.82).startsWith("Near ")).toBe(true);
  });

  it("names the area outright once you are inside it", () => {
    const { area, km } = nearestArea(1.2841, 103.8515);
    expect(km).toBeLessThan(2);
    expect(labelForCoords(1.2841, 103.8515)).toBe(area.label);
  });

  it("NEVER shows raw coordinates, anywhere on earth", () => {
    /* THE FIELD-TEST BUG, PINNED. A user in Yishun was shown "1.392, 103.853"
       as their location. Raw coordinates are not a place name, and the fix has
       to hold outside Singapore too — where no table can help and the honest
       answer is a readable one. */
    for (const [lat, lng] of [[1.4294, 103.8353], [51.5074, -0.1278], [-33.86, 151.2], [0, 0]]) {
      const label = labelForCoords(lat, lng);
      expect(label).not.toMatch(/-?\d+\.\d{3,}/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a readable phrase far from Singapore", () => {
    expect(labelForCoords(51.5074, -0.1278)).toBe("Your location");
  });
});

describe("distance", () => {
  it("is zero for the same point", () => {
    expect(kmBetween(1.28, 103.85, 1.28, 103.85)).toBe(0);
  });

  it("is symmetric and roughly right", () => {
    const a = kmBetween(1.2841, 103.8515, 1.3005, 103.856);
    const b = kmBetween(1.3005, 103.856, 1.2841, 103.8515);
    expect(a).toBeCloseTo(b, 1);
    // Raffles Place → Bugis is about 2 km.
    expect(a).toBeGreaterThan(1);
    expect(a).toBeLessThan(3);
  });

  it("has a movement threshold small enough to matter and large enough to be quiet", () => {
    // Below MOVED_KM the app must not refetch. GPS jitter is tens of metres.
    expect(MOVED_KM).toBeGreaterThan(0.05);
    expect(MOVED_KM).toBeLessThan(1);
  });
});

describe("choosing where", () => {
  it("keeps following GPS after an automatic fix", () => {
    const p = planFromCoords(1.3005, 103.856, defaultPlan());
    expect(p.locationMode).toBe("auto");
    expect(p.label).toBe("Bugis");
  });

  it("pins the location once the user picks an area", () => {
    /* THE POINT OF locationMode. Without the flip to "manual", the next GPS
       fix silently overwrites a deliberate choice — the user picks Chinatown,
       walks ten metres, and is back in Raffles Place. */
    const p = planFromArea("chinatown", defaultPlan());
    expect(p.locationMode).toBe("manual");
    expect(p.label).toBe("Chinatown");
  });

  it("falls back to the default area for an unknown id", () => {
    // The id can come from storage written by an older build.
    expect(planFromArea("atlantis", defaultPlan()).label).toBe(DEFAULT_AREA.label);
  });
});

describe("choosing when", () => {
  it("means 'now' by default", () => {
    expect(defaultPlan().hour).toBeNull();
    expect(effectiveHour(defaultPlan())).toBe(new Date().getHours());
  });

  it("uses a pinned hour when there is one", () => {
    expect(effectiveHour(planWithHour(defaultPlan(), 19))).toBe(19);
  });

  it("treats a pinned midnight as pinned, not as absent", () => {
    // `plan.hour ?? clock` rather than `plan.hour || clock` — hour 0 is real.
    expect(effectiveHour(planWithHour(defaultPlan(), 0))).toBe(0);
  });

  it("clears the timestamp when the pin is removed", () => {
    const pinned = planWithHour(defaultPlan(), 19);
    expect(planWithHour(pinned, null).hourSetAt).toBeNull();
  });

  it("expires a pinned hour rather than letting it haunt tomorrow", () => {
    /* A pinned time is a same-session intent. Without expiry, someone who
       planned dinner at 7pm on Monday opens the app on Tuesday morning and is
       shown dinner options — the app confidently answering last night's
       question. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00+08:00"));
    savePlan(planWithHour(defaultPlan(), 19));
    vi.setSystemTime(new Date("2026-07-31T12:00:00+08:00"));
    expect(loadPlan().hour).toBeNull();
  });

  it("keeps a pin that is still fresh and same-day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00+08:00"));
    savePlan(planWithHour(defaultPlan(), 19));
    vi.setSystemTime(new Date("2026-07-30T13:00:00+08:00"));
    expect(loadPlan().hour).toBe(19);
  });
});

describe("loading a stored plan", () => {
  it("returns the default when nothing is stored", () => {
    expect(loadPlan()).toEqual(defaultPlan());
  });

  it("survives corrupt storage instead of crashing the app", () => {
    stubStorage({ fnm_plan: "{not json" });
    expect(loadPlan()).toEqual(defaultPlan());
  });

  it("fills in fields a stored plan from an older build is missing", () => {
    // Shipping a new field must not brick every existing user's plan.
    stubStorage({ fnm_plan: JSON.stringify({ lat: 1.3, lng: 103.8 }) });
    const p = loadPlan();
    expect(p.lat).toBe(1.3);
    expect(p.locationMode).toBe("auto");
    expect(p.hour).toBeNull();
  });

  it("does not throw when storage is blocked in private mode", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
    });
    expect(() => loadPlan()).not.toThrow();
    expect(() => savePlan(defaultPlan())).not.toThrow();
  });

  it("returns the default on the server, where there is no window", () => {
    vi.stubGlobal("window", undefined);
    expect(loadPlan()).toEqual(defaultPlan());
  });
});

describe("formatting", () => {
  it("renders noon and midnight the way people say them", () => {
    // 0 → "12am" and 12 → "12pm"; naive `hour % 12` gives "0am".
    expect(formatHour(0)).toBe("12am");
    expect(formatHour(12)).toBe("12pm");
    expect(formatHour(13)).toBe("1pm");
    expect(formatHour(23)).toBe("11pm");
    expect(formatHour(9)).toBe("9am");
  });

  it("never renders an hour as 0 or 13+ on the clock face", () => {
    for (let h = 0; h < 24; h += 1) {
      const n = Number(formatHour(h).replace(/[ap]m/, ""));
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("agrees with the server's meal periods at every hour", () => {
    /* TWO IMPLEMENTATIONS OF ONE RULE. `mealFor` runs on the client for the
       plan bar and `mealPeriod` runs on the server for scoring. If they ever
       drift, the bar says "lunch" while the engine recommends supper. */
    const server = (h: number) =>
      h >= 6 && h < 11 ? "breakfast" : h >= 11 && h < 15 ? "lunch" : h >= 15 && h < 21 ? "dinner" : "supper";
    for (let h = 0; h < 24; h += 1) expect(mealFor(h)).toBe(server(h));
  });
});

describe("the query the plan becomes", () => {
  it("carries every input the engine needs", () => {
    const p: Plan = { ...defaultPlan(), lat: 1.3, lng: 103.8, label: "Somewhere", hour: 19, hourSetAt: Date.now() };
    expect(planParams(p)).toEqual({ lat: "1.3", lng: "103.8", hour: "19", label: "Somewhere" });
  });

  it("resolves 'now' to a concrete hour before sending", () => {
    // The server must never have to guess which clock the user meant.
    const params = planParams(defaultPlan());
    expect(Number(params.hour)).toBe(new Date().getHours());
  });
});
