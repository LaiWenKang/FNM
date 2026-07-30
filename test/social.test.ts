import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED,
  extractLocal,
  extractUrl,
  idFor,
  isFoodForTest,
  platformOf,
  resolvePlace,
} from "@/lib/social";

// PASTE → PLATFORM → CAPTION → PLACE → COORDINATES. The user's half of this is
// a single paste of whatever the share sheet produced, which means every stage
// below is parsing hostile input: mixed scripts, hashtag walls, tracking
// params, and share blobs that wrap the URL in prose.

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("recognising the platform", () => {
  it("names each supported platform", () => {
    expect(platformOf("https://www.tiktok.com/@a/video/123")).toBe("tiktok");
    expect(platformOf("https://v.douyin.com/abc/")).toBe("douyin");
    expect(platformOf("https://www.iesdouyin.com/share/video/1")).toBe("douyin");
    expect(platformOf("https://www.xiaohongshu.com/explore/abc")).toBe("rednote");
    expect(platformOf("https://xhslink.com/abc")).toBe("rednote");
    expect(platformOf("https://www.instagram.com/p/abc/")).toBe("instagram");
  });

  it("falls back to 'other' rather than guessing", () => {
    expect(platformOf("https://example.com/food")).toBe("other");
    expect(platformOf("")).toBe("other");
  });

  it("is case-insensitive, because share sheets are not consistent", () => {
    expect(platformOf("HTTPS://WWW.TIKTOK.COM/@a/video/1")).toBe("tiktok");
  });
});

describe("finding the link in a share blob", () => {
  it("separates the URL from the caption around it", () => {
    /* THE SHARE SHEET PASTES PROSE, not a bare URL — which is why the box
       accepts the whole blob. Demanding a clean URL would fail on the single
       most common way this feature is used. */
    const { link, rest } = extractUrl(
      'Check out this laksa 🔥 https://www.tiktok.com/@a/video/123 amazing stuff',
    );
    expect(link).toBe("https://www.tiktok.com/@a/video/123");
    expect(rest).toContain("Check out this laksa");
    expect(rest).toContain("amazing stuff");
    expect(rest).not.toContain("http");
  });

  it("keeps the whole text as caption when there is no URL", () => {
    const { link, rest } = extractUrl("just a note about laksa");
    expect(link).toBeNull();
    expect(rest).toBe("just a note about laksa");
  });

  it("takes the first URL when there are several", () => {
    const { link } = extractUrl("a https://one.com/x b https://two.com/y");
    expect(link).toBe("https://one.com/x");
  });

  it("keeps query strings, which carry the post id on some platforms", () => {
    const { link } = extractUrl("look https://xhslink.com/a?id=42&t=1 nice");
    expect(link).toBe("https://xhslink.com/a?id=42&t=1");
  });
});

describe("the caption fallback with no model", () => {
  it("strips hashtags, links and CJK brackets", () => {
    const out = extractLocal("【必吃】Tian Tian Chicken Rice #sgfood #foodie https://x.com/a");
    expect(out.placeName).toContain("Tian Tian Chicken Rice");
    expect(out.placeName).not.toContain("#");
    expect(out.placeName).not.toContain("http");
    expect(out.placeName).not.toContain("【");
  });

  it("refuses to claim it identified a dish", () => {
    /* The local path produces a SEARCH STRING, not a finding. Asserting a dish
       name here would put an invented dish on the saved card, and the resolver
       is the thing that decides whether any of it is real. */
    expect(extractLocal("Amazing char kway teow").dishName).toBeNull();
    expect(extractLocal("Amazing char kway teow").areaHint).toBeNull();
  });

  it("returns nothing at all for a caption that is only hashtags", () => {
    expect(extractLocal("#sgfood #foodie #yummy")).toEqual({
      placeName: null,
      dishName: null,
      areaHint: null,
    });
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(extractLocal("").placeName).toBeNull();
    expect(extractLocal("     ").placeName).toBeNull();
  });

  it("caps the length so a caption wall cannot become a search query", () => {
    expect(extractLocal("x".repeat(500)).placeName!.length).toBeLessThanOrEqual(60);
  });

  it("handles a non-Latin caption without mangling it", () => {
    // Rednote and Douyin captions are mostly Chinese; dropping them would make
    // two of the four supported platforms useless.
    const out = extractLocal("天天海南鸡饭 #新加坡美食");
    expect(out.placeName).toContain("天天海南鸡饭");
    expect(out.placeName).not.toContain("#");
  });
});

describe("is this actually food", () => {
  it("accepts anything Google tags as a kind of restaurant", () => {
    /* THE GUARD BETWEEN LUNCH AND A CLOTHING SHOP. A caption naming a mall
       resolves to the mall unless this holds. */
    expect(isFoodForTest(["ramen_restaurant"])).toBe(true);
    expect(isFoodForTest(["japanese_restaurant", "point_of_interest"])).toBe(true);
  });

  it("rejects places that are plainly not food", () => {
    expect(isFoodForTest(["clothing_store"])).toBe(false);
    expect(isFoodForTest(["shopping_mall", "point_of_interest"])).toBe(false);
  });

  it("rejects an empty or missing type list rather than assuming", () => {
    // No evidence is not evidence of food.
    expect(isFoodForTest([])).toBe(false);
    expect(isFoodForTest(undefined)).toBe(false);
  });
});

describe("the id derived from a link", () => {
  it("is stable, so re-pasting the same post updates rather than duplicates", () => {
    const link = "https://www.tiktok.com/@a/video/123";
    expect(idFor(link)).toBe(idFor(link));
  });

  it("differs between posts", () => {
    expect(idFor("https://a.com/1")).not.toBe(idFor("https://a.com/2"));
  });

  it("is always a safe token", () => {
    for (const link of ["https://a.com/'; DROP TABLE saved;--", "", "https://a.com/日本語"]) {
      expect(idFor(link)).toMatch(/^s[a-z0-9]+$/);
    }
  });

  it("caps the saved list at something a person could actually revisit", () => {
    expect(MAX_SAVED).toBeGreaterThan(10);
    expect(MAX_SAVED).toBeLessThanOrEqual(200);
  });
});

describe("resolving a name to a real place", () => {
  it("does nothing without a Places key", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(await resolvePlace("Tian Tian", { lat: 1.28, lng: 103.85 })).toBeNull();
  });

  it("does nothing for an empty query", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    expect(await resolvePlace("   ", { lat: 1.28, lng: 103.85 })).toBeNull();
  });

  it("returns null rather than a non-food match", async () => {
    /* An unresolved post is honest — it sits in the list as a name. A post
       resolved to a shopping mall gets a MAP PIN and joins the candidate pool,
       so the app would eventually recommend walking to a mall for lunch. */
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            {
              id: "m1",
              displayName: { text: "Big Mall" },
              location: { latitude: 1.28, longitude: 103.85 },
              types: ["shopping_mall"],
            },
          ],
        }),
      }) as unknown as Response),
    );
    expect(await resolvePlace("Big Mall", { lat: 1.28, lng: 103.85 })).toBeNull();
  });

  it("resolves a genuine restaurant", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            {
              id: "r1",
              displayName: { text: "Tian Tian Chicken Rice" },
              location: { latitude: 1.2805, longitude: 103.8455 },
              types: ["restaurant", "chinese_restaurant"],
            },
          ],
        }),
      }) as unknown as Response),
    );
    const got = await resolvePlace("Tian Tian", { lat: 1.28, lng: 103.85 });
    expect(got?.name).toBe("Tian Tian Chicken Rice");
    expect(got?.lat).toBeCloseTo(1.2805, 3);
  });

  it("survives a rejected key without throwing", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "bad");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "denied" }) as unknown as Response),
    );
    await expect(resolvePlace("x", { lat: 1.28, lng: 103.85 })).resolves.toBeNull();
  });

  it("survives a network failure", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(resolvePlace("x", { lat: 1.28, lng: 103.85 })).resolves.toBeNull();
  });

  it("survives an empty result set", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ places: [] }) }) as unknown as Response),
    );
    await expect(resolvePlace("nowhere", { lat: 1.28, lng: 103.85 })).resolves.toBeNull();
  });
});
