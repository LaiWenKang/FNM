import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearModelCache, geminiModel, pickModel } from "@/lib/gemini-model";

// ASK THE PROVIDER WHAT IT HAS.
//
// The default was the string "gemini-2.5-flash", written once and left. On the
// real deployment it came back NOT FOUND for the key in use — so every
// model-backed feature was switched off by a stale constant while the key
// itself was perfectly good, and it took building a status panel to notice.
//
// Third time this codebase has hit the same shape: a hand-maintained table that
// reality moved out from under. Forty-nine areas could not name an office. A
// type map could not name two thirds of the restaurants Google returned. A
// pinned model name could not survive its vendor's release cycle.

const model = (name: string, methods: string[] = ["generateContent"]) => ({
  name: `models/${name}`,
  supportedGenerationMethods: methods,
});

const listReturns = (models: unknown[], ok = true) => {
  const spy = vi.fn(
    async (_url: string) =>
      ({ ok, status: ok ? 200 : 403, json: async () => ({ models }) }) as unknown as Response,
  );
  vi.stubGlobal("fetch", spy);
  return spy;
};

beforeEach(() => {
  clearModelCache();
  vi.stubEnv("GEMINI_API_KEY", "g-1");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("choosing from what the key can actually call", () => {
  it("prefers the cheapest flash-class model", () => {
    expect(
      pickModel([model("gemini-2.5-pro"), model("gemini-2.0-flash"), model("gemini-2.0-flash-lite")]),
    ).toBe("gemini-2.0-flash-lite");
  });

  it("takes flash over pro even when pro is listed first", () => {
    // These questions are extraction and one-line summaries. Paying for a
    // reasoning model to do them would be a quiet, recurring waste.
    expect(pickModel([model("gemini-2.5-pro"), model("gemini-2.5-flash")])).toBe("gemini-2.5-flash");
  });

  it("prefers the plain name over a longer preview of the same tier", () => {
    expect(
      pickModel([model("gemini-2.0-flash-preview-image-generation"), model("gemini-2.0-flash")]),
    ).toBe("gemini-2.0-flash");
  });

  it("skips a model that cannot generate content at all", () => {
    /* Embedding models sort suspiciously well by name, and picking one would
       fail on every single call with an error that looks nothing like the
       cause. */
    expect(
      pickModel([model("text-embedding-004", ["embedContent"]), model("gemini-2.0-flash")]),
    ).toBe("gemini-2.0-flash");
  });

  it("skips models that cannot do this app's job", () => {
    // Vision, TTS, image and audio variants are all listed alongside the text
    // ones and none of them answer a JSON question.
    const chosen = pickModel([
      model("gemini-2.0-flash-exp-image-generation"),
      model("gemini-2.5-flash-preview-tts"),
      model("gemini-2.0-flash-live-001"),
      model("gemini-2.0-flash"),
    ]);
    expect(chosen).toBe("gemini-2.0-flash");
  });

  it("falls back to anything that generates content rather than refusing", () => {
    // A working app on an odd model beats a correct app that does nothing.
    expect(pickModel([model("some-future-model")])).toBe("some-future-model");
  });

  it("returns null when the key can call nothing useful", () => {
    expect(pickModel([])).toBeNull();
    expect(pickModel([model("text-embedding-004", ["embedContent"])])).toBeNull();
  });

  it("strips the models/ prefix the API returns", () => {
    expect(pickModel([model("gemini-2.0-flash")])).not.toContain("models/");
  });

  it("tolerates the newer supportedActions spelling", () => {
    expect(
      pickModel([{ name: "models/gemini-2.0-flash", supportedActions: ["generateContent"] }]),
    ).toBe("gemini-2.0-flash");
  });

  it("keeps a model that lists no methods at all", () => {
    // Absent is not the same as "cannot" — refusing here would discard the
    // only candidate on a payload shape we simply have not seen.
    expect(pickModel([{ name: "models/gemini-2.0-flash" }])).toBe("gemini-2.0-flash");
  });
});

describe("discovering it once", () => {
  it("asks Google and returns the choice", async () => {
    listReturns([model("gemini-2.0-flash")]);
    expect(await geminiModel()).toBe("gemini-2.0-flash");
  });

  it("asks only once per instance", async () => {
    const spy = listReturns([model("gemini-2.0-flash")]);
    await geminiModel();
    await geminiModel();
    await geminiModel();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("asks only once under a burst, not once per caller", async () => {
    /* Enrichment fans out over a dozen places at once. A dozen simultaneous
       ListModels calls to answer one question would be its own small bug. */
    const spy = listReturns([model("gemini-2.0-flash")]);
    await Promise.all(Array.from({ length: 12 }, () => geminiModel()));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("NEVER overrules an explicit choice", async () => {
    /* Somebody who names a model has made a decision. Quietly ignoring it
       would be a worse bug than the one this fixes, because they would have no
       way to tell the app was disregarding them. */
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-pro");
    const spy = listReturns([model("gemini-2.0-flash")]);
    expect(await geminiModel()).toBe("gemini-2.5-pro");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when discovery fails", async () => {
    // The caller falls back to a literal — a stale guess still beats not
    // asking at all, and the status panel reports whatever happens next.
    listReturns([], false);
    expect(await geminiModel()).toBeNull();
  });

  it("returns null on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await geminiModel()).toBeNull();
  });

  it("does not ask without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const spy = listReturns([model("gemini-2.0-flash")]);
    expect(await geminiModel()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("retries next time rather than caching a failure", async () => {
    // A transient outage must not switch the model off for the life of the
    // instance.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    expect(await geminiModel()).toBeNull();
    listReturns([model("gemini-2.0-flash")]);
    expect(await geminiModel()).toBe("gemini-2.0-flash");
  });

  it("sends the key as a parameter, escaped", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key/with?chars");
    const spy = listReturns([model("gemini-2.0-flash")]);
    await geminiModel();
    expect(spy.mock.calls[0][0]).toContain("key%2Fwith%3Fchars");
  });
});
