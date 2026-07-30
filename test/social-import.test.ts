import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED,
  SavedPost,
  addSaved,
  idFor,
  importPost,
  listSaved,
  markVisited,
  removeSaved,
} from "@/lib/social";

// PASTE → SAVE → SURFACE IT WHEN YOU ARE NEARBY. The pitch is that a bookmark
// folder you never reopen is not a feature, so the app remembers FOR you —
// which means every step here has to fail loudly to the user rather than
// quietly to the log. A post that silently vanishes is worse than one that
// never saved.

const ask = vi.hoisted(() =>
  vi.fn(async (_opts: { system: string; user: string; maxTokens: number }) => null as string | null),
);
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, ask };
});

const NEAR = { lat: 1.2841, lng: 103.8515 };
const OWNER = "d:test-device";

const post = (over: Partial<SavedPost> = {}): SavedPost => ({
  id: idFor("https://www.tiktok.com/@a/video/1"),
  platform: "tiktok",
  url: "https://www.tiktok.com/@a/video/1",
  caption: "amazing laksa",
  placeName: "328 Katong Laksa",
  dishName: null,
  areaHint: null,
  resolved: null,
  at: Date.now(),
  visitedAt: null,
  ...over,
});

/** No network at all — oembed and Places both unavailable. */
const offline = () => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

beforeEach(() => {
  ask.mockReset();
  ask.mockResolvedValue(null);
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  offline();
});

afterEach(async () => {
  // The memory store is process-wide; leave it clean for the next test.
  for (const p of await listSaved(OWNER)) await removeSaved(OWNER, p.id);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("what the user pasted", () => {
  it("refuses text with no link, and says what to do instead", async () => {
    const out = await importPost("that laksa place near work", NEAR);
    expect("error" in out).toBe(true);
    expect((out as { error: string }).error).toMatch(/link/i);
  });

  it("refuses a bare link with no caption, and says why", async () => {
    /* A URL alone carries nothing to search on for three of the four supported
       platforms. Telling the user to copy the text too is actionable; silently
       saving an unidentifiable post is not. */
    const out = await importPost("https://www.xiaohongshu.com/explore/abc", NEAR);
    expect("error" in out).toBe(true);
    expect((out as { error: string }).error).toMatch(/caption/i);
  });

  it("saves a post it cannot resolve rather than losing it", async () => {
    /* NOT MATCHED IS AN HONEST OUTCOME. Nothing the user pasted is thrown
       away, and the list can say plainly that it has nowhere to send them —
       far better than a confident wrong address. */
    const out = await importPost("best laksa ever https://www.tiktok.com/@a/video/1", NEAR);
    expect("error" in out).toBe(false);
    const p = out as SavedPost;
    expect(p.resolved).toBeNull();
    expect(p.caption).toContain("best laksa ever");
    expect(p.platform).toBe("tiktok");
  });

  it("gives the same link the same id, so re-pasting updates", async () => {
    const a = (await importPost("laksa https://www.tiktok.com/@a/video/1", NEAR)) as SavedPost;
    const b = (await importPost("different words https://www.tiktok.com/@a/video/1", NEAR)) as SavedPost;
    expect(a.id).toBe(b.id);
  });

  it("caps the caption so a hashtag wall cannot bloat storage", async () => {
    const out = (await importPost(`${"x".repeat(2000)} https://www.tiktok.com/@a/video/1`, NEAR)) as SavedPost;
    expect(out.caption.length).toBeLessThanOrEqual(400);
  });

  it("starts unvisited, because saving is not eating", async () => {
    // The unvisited flag is what keeps a saved post in the candidate pool.
    const out = (await importPost("laksa https://www.tiktok.com/@a/video/1", NEAR)) as SavedPost;
    expect(out.visitedAt).toBeNull();
  });

  it("resolves a place when the model names one and Places finds it", async () => {
    ask.mockResolvedValue(JSON.stringify({ placeName: "328 Katong Laksa", dishName: "Laksa", areaHint: "Katong" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            {
              id: "k1",
              displayName: { text: "328 Katong Laksa" },
              location: { latitude: 1.3062, longitude: 103.9021 },
              types: ["restaurant"],
            },
          ],
        }),
      }) as unknown as Response),
    );
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    const out = (await importPost("laksa https://www.tiktok.com/@a/video/1", NEAR)) as SavedPost;
    expect(out.resolved?.name).toBe("328 Katong Laksa");
    expect(out.dishName).toBe("Laksa");
  });
});

describe("the saved list", () => {
  it("starts empty for a new owner", async () => {
    expect(await listSaved("d:nobody")).toEqual([]);
  });

  it("round-trips a post", async () => {
    await addSaved(OWNER, post());
    const got = await listSaved(OWNER);
    expect(got).toHaveLength(1);
    expect(got[0].placeName).toBe("328 Katong Laksa");
  });

  it("keeps one owner's saves away from another's", async () => {
    /* The owner key is what separates a signed-in account from a device, and
       one person's saved list from the next person's. */
    await addSaved(OWNER, post());
    expect(await listSaved("d:someone-else")).toEqual([]);
    await removeSaved("d:someone-else", post().id);
    expect(await listSaved(OWNER)).toHaveLength(1);
  });

  it("replaces rather than duplicating when the same post is re-saved", async () => {
    await addSaved(OWNER, post({ caption: "first" }));
    await addSaved(OWNER, post({ caption: "second" }));
    const got = await listSaved(OWNER);
    expect(got).toHaveLength(1);
    expect(got[0].caption).toBe("second");
  });

  it("removes a post", async () => {
    await addSaved(OWNER, post());
    await removeSaved(OWNER, post().id);
    expect(await listSaved(OWNER)).toEqual([]);
  });

  it("ignores a remove for something that is not there", async () => {
    await expect(removeSaved(OWNER, "s-nothing")).resolves.toBeUndefined();
  });

  it("marks a post visited, which takes it out of the want-to-try pool", async () => {
    /* "Unvisited only — once you have eaten there it is a normal place like
       any other." Without this the app keeps nudging you toward somewhere you
       already went. */
    await addSaved(OWNER, post());
    await markVisited(OWNER, post().id);
    expect((await listSaved(OWNER))[0].visitedAt).toBeGreaterThan(0);
  });

  it("ignores a visit for something that is not there", async () => {
    await expect(markVisited(OWNER, "s-nothing")).resolves.toBeUndefined();
  });

  it("caps the list so it stays something a person could revisit", async () => {
    for (let i = 0; i < MAX_SAVED + 10; i += 1) {
      await addSaved(OWNER, post({ id: `s-${i}`, url: `https://x.com/${i}` }));
    }
    expect((await listSaved(OWNER)).length).toBeLessThanOrEqual(MAX_SAVED);
  });
});
