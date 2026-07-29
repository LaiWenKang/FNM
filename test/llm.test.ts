import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jsonArray, jsonObject, llmConfigured, llmProvider } from "@/lib/llm";

// The provider shim's whole job is to make "which vendor" a one-line env
// decision instead of a dependency baked into four files. What matters is that
// the routing is right and that NOTHING here can throw — every caller has a
// local fallback, and a null is how it gets used.

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("which model answers", () => {
  it("uses no model at all when no key is set", () => {
    expect(llmProvider()).toBeNull();
    expect(llmConfigured()).toBe(false);
  });

  it("uses Gemini when only its key is set", () => {
    process.env.GEMINI_API_KEY = "test";
    expect(llmProvider()).toBe("gemini");
    expect(llmConfigured()).toBe(true);
  });

  it("uses Anthropic when only its key is set", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    expect(llmProvider()).toBe("anthropic");
  });

  it("prefers Anthropic when both are set", () => {
    // It is the paid tier, and the one whose terms do not include training on
    // the prompt. Someone who has paid for it meant to use it.
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.GEMINI_API_KEY = "test";
    expect(llmProvider()).toBe("anthropic");
  });

  it("treats an empty-string key as no key", () => {
    // Vercel hands back "" for a variable that exists but was never filled in,
    // and a truthiness check that got this wrong would route every request to a
    // vendor with no credentials.
    process.env.GEMINI_API_KEY = "";
    expect(llmProvider()).toBeNull();
  });
});

describe("reading what comes back", () => {
  it("finds an object inside whatever prose wraps it", () => {
    // Models are told to return ONLY JSON and mostly comply. "Mostly" is why
    // this exists.
    expect(jsonObject(`Here you go:\n{"a":1}\nHope that helps!`)).toEqual({ a: 1 });
    expect(jsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds an array the same way", () => {
    expect(jsonArray('Sure — [{"name":"laksa"}]')).toEqual([{ name: "laksa" }]);
  });

  it("returns null rather than throwing on anything unparseable", () => {
    // Every caller treats null as "use the local answer". A throw here would
    // instead surface as a failed request.
    for (const bad of [null, "", "no json here", "{not: valid}", "[1,2", "{"]) {
      expect(() => jsonObject(bad)).not.toThrow();
      expect(jsonObject(bad)).toBeNull();
    }
  });

  it("does not mistake an object for an array", () => {
    expect(jsonArray('{"a":1}')).toBeNull();
  });

  it("survives a reply that is only a prose refusal", () => {
    expect(jsonObject("I can't help with that.")).toBeNull();
    expect(jsonArray("I can't help with that.")).toBeNull();
  });
});
