import { describe, expect, it } from "vitest";
import { SEED_PLACES } from "@/lib/data/seed";
import { placeFromSaved } from "@/lib/places";
import { extractLocal, extractUrl, idFor, platformOf } from "@/lib/social";

describe("catalogue integrity", () => {
  it("has no duplicate place ids", () => {
    const ids = SEED_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate dish ids within a place", () => {
    for (const p of SEED_PLACES) {
      const ids = p.dishes.map((d) => d.id);
      expect(new Set(ids).size, p.name).toBe(ids.length);
    }
  });

  it("keeps every flavour value inside 0..1", () => {
    for (const p of SEED_PLACES) {
      for (const [dim, v] of Object.entries(p.flavor)) {
        expect(v, `${p.name}.${dim}`).toBeGreaterThanOrEqual(0);
        expect(v, `${p.name}.${dim}`).toBeLessThanOrEqual(1);
      }
      for (const d of p.dishes) {
        for (const [dim, v] of Object.entries(d.flavor)) {
          expect(v, `${p.name}/${d.name}.${dim}`).toBeGreaterThanOrEqual(0);
          expect(v, `${p.name}/${d.name}.${dim}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("keeps opening hours in range", () => {
    for (const p of SEED_PLACES) {
      expect(p.openHour, p.name).toBeGreaterThanOrEqual(0);
      expect(p.openHour, p.name).toBeLessThanOrEqual(24);
      expect(p.closeHour, p.name).toBeGreaterThanOrEqual(0);
      expect(p.closeHour, p.name).toBeLessThanOrEqual(24);
    }
  });

  it("keeps at least one place open at every hour, so the app can never dead-end", () => {
    for (let h = 0; h < 24; h += 1) {
      const open = SEED_PLACES.filter((p) =>
        p.closeHour > p.openHour ? h >= p.openHour && h < p.closeHour : h >= p.openHour || h < p.closeHour,
      );
      expect(open.length, `nothing open at ${h}:00`).toBeGreaterThan(0);
    }
  });
});

describe("saved posts become real candidates", () => {
  const resolved = {
    placeId: "g-abc",
    name: "That Place From The Video",
    lat: 1.3,
    lng: 103.85,
    address: null,
    rating: 4.5,
    ratingCount: 120,
  };

  it("carries the want-to-try flag and the dish the post was about", () => {
    const p = placeFromSaved(resolved, "Chilli Crab");
    expect(p.wantToTry).toBe(true);
    expect(p.savedDish).toBe("Chilli Crab");
  });

  it("does NOT claim to know hours or flavour it never had", () => {
    const p = placeFromSaved(resolved, null);
    expect(p.hoursKnown).toBe(false);
    expect(p.flavorKnown).toBe(false);
  });
});

describe("social link parsing", () => {
  it("identifies each platform", () => {
    expect(platformOf("https://www.tiktok.com/@x/video/123")).toBe("tiktok");
    expect(platformOf("https://v.douyin.com/abc/")).toBe("douyin");
    expect(platformOf("http://xhslink.com/a/abc")).toBe("rednote");
    expect(platformOf("https://www.xiaohongshu.com/explore/123")).toBe("rednote");
    expect(platformOf("https://example.com/food")).toBe("other");
  });

  it("pulls the url out of a real share blob and keeps the caption", () => {
    // This is verbatim the shape Rednote puts on the clipboard.
    const { link, rest } = extractUrl("「超好吃的叻沙」 http://xhslink.com/a/abcdef 复制本条信息");
    expect(link).toBe("http://xhslink.com/a/abcdef");
    expect(rest).toContain("叻沙");
  });

  it("reports no link rather than guessing", () => {
    expect(extractUrl("just some text").link).toBeNull();
  });

  it("gives the same post the same id, so re-pasting updates instead of duplicating", () => {
    expect(idFor("https://a.com/1")).toBe(idFor("https://a.com/1"));
    expect(idFor("https://a.com/1")).not.toBe(idFor("https://a.com/2"));
  });

  it("strips hashtags and urls from a caption without an API key", () => {
    const out = extractLocal("Best laksa at Sungei Road #sgfood #foodie https://x.com/a");
    expect(out.placeName).not.toContain("#");
    expect(out.placeName).not.toContain("http");
    expect(out.placeName).toContain("laksa");
  });
});
