import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Fault,
  SubsystemHealth,
  Subsystem,
  classify,
  clearHealth,
  foldIncidents,
  noteFault,
  noteOk,
  verdictFor,
} from "@/lib/health";

// Before this, a revoked API key, a blown quota, a network timeout and a
// perfectly correct zero-key install all produced the same output: silence, a
// local fallback, and a screen that looked fine. These tests are about the
// distinctions that were being lost.

beforeEach(() => {
  clearHealth();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("telling failures apart", () => {
  it("reads a rejected key as auth, not as bad luck", () => {
    expect(classify(null, 401)).toBe("auth");
    expect(classify(null, 403)).toBe("auth");
  });

  it("separates a rate limit from a spent quota", () => {
    // Google answers both with 429, and the difference is the difference
    // between "wait sixty seconds" and "you are done until tomorrow".
    expect(classify(null, 429)).toBe("rate-limit");
    expect(classify(new Error("Quota exceeded for generate_requests"), 429)).toBe("quota");
  });

  it("reads a vendor outage as upstream", () => {
    expect(classify(null, 500)).toBe("upstream");
    expect(classify(null, 503)).toBe("upstream");
  });

  it("recognises the abort the places fetch actually throws", () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    expect(classify(e)).toBe("timeout");
  });

  it("finds the status wherever the SDK happened to put it", () => {
    // Three vendors, three shapes, one thing the operator needs to know.
    expect(classify({ status: 429 })).toBe("rate-limit");
    expect(classify({ statusCode: 403 })).toBe("auth");
    expect(classify({ error: { code: 401 } })).toBe("auth");
  });

  it("reads an API-key complaint in prose", () => {
    expect(classify(new Error("API key not valid. Please pass a valid API key."))).toBe("auth");
  });

  it("reads a rejected Places key that arrives as a 400", () => {
    /* CAUGHT BY RUNNING IT WITH A DEAD KEY. Google answers an invalid Places
       key with 400 — not 401 or 403 — so classifying on the status code alone
       filed the most likely misconfiguration in this app under "unknown",
       while the identical message from the model path was correctly read as
       auth. The reason is in the body, so the body has to be passed in. */
    const body = `{
      "error": {
        "code": 400,
        "message": "API key not valid. Please pass a valid API key.",
        "status": "INVALID_ARGUMENT"
      }
    }`;
    expect(classify(body, 400)).toBe("auth");
  });

  it("still reads a quota message that arrives with a 400", () => {
    expect(classify("Billing has not been enabled for this project", 400)).toBe("quota");
  });

  it("names a missing MODEL separately from a dead key", () => {
    /* FOUND BY THE STATUS PANEL ON A REAL DEPLOYMENT. The key was neither
       rejected nor out of quota and the fault came back "unknown", which tells
       somebody nothing they can act on. A model that does not exist for a
       given key is a CONFIGURATION mistake with a completely different fix. */
    expect(classify(null, 404)).toBe("not-found");
    expect(classify(new Error("models/gemini-9-ultra is not found for API version v1beta"))).toBe("not-found");
    expect(classify(new Error("The model `x` does not exist"))).toBe("not-found");
    expect(classify(new Error("Unsupported model: y"))).toBe("not-found");
  });

  it("admits when it does not know", () => {
    // A wrong category is worse than an honest "unknown" — it sends someone to
    // regenerate a key that was never the problem.
    expect(classify(new Error("something weird happened"))).toBe("unknown");
    expect(classify(null)).toBe("unknown");
  });

  it("does not mistake a normal status for an error code", () => {
    expect(classify({ status: 200 })).toBe("unknown");
  });
});

describe("what the operator should do about it", () => {
  it("calls an unconfigured subsystem off, not broken", () => {
    // THE DISTINCTION THE WHOLE FILE EXISTS FOR. The zero-key install is a
    // supported mode — the one the entire test suite runs in — and flagging it
    // red would train everyone to ignore the status page.
    expect(verdictFor(false, 0, 0)).toBe("off");
    expect(verdictFor(false, 0, 9)).toBe("off");
  });

  it("refuses to call an untested subsystem healthy", () => {
    // Inferring health from an absence of evidence is the exact mistake this
    // is meant to stop.
    expect(verdictFor(true, 0, 0)).toBe("unknown");
  });

  it("calls a configured subsystem that never succeeds failing", () => {
    expect(verdictFor(true, 0, 5)).toBe("failing");
  });

  it("calls a partial failure degraded rather than fine", () => {
    expect(verdictFor(true, 20, 1)).toBe("degraded");
  });

  it("only says healthy when nothing has failed", () => {
    expect(verdictFor(true, 5, 0)).toBe("healthy");
  });
});

describe("recording an outcome", () => {
  const shell = (over: Partial<SubsystemHealth> = {}): SubsystemHealth => ({
    configured: true,
    verdict: "unknown",
    thisInstance: { ok: 0, failed: 0 },
    lastFault: null,
    recent: [],
    ...over,
  });

  const base = (over: Partial<Record<Subsystem, SubsystemHealth>> = {}) => ({
    llm: shell(),
    places: shell(),
    db: shell(),
    ...over,
  });

  it("writes a greppable line to the platform log", () => {
    // The console line is the one record that survives everything, including
    // the database this module also writes to.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    noteFault("llm", "auth", "gemini: API key not valid");
    expect(spy).toHaveBeenCalledWith("[fnm] llm auth: gemini: API key not valid");
  });

  it("keeps the detail short enough to be a log line", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    noteFault("places", "upstream", "x".repeat(5000));
    const line = spy.mock.calls[0][0] as string;
    expect(line.length).toBeLessThan(300);
  });

  it("flattens a pretty-printed vendor error onto one line", () => {
    // Also caught by running it for real: vendors answer with indented JSON,
    // and a log entry that wraps across twelve lines is not greppable — which
    // was the entire point of giving it a prefix.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    noteFault("places", "auth", '400 {\n  "error": {\n    "code": 400\n  }\n}');
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    expect(line).toBe('[fnm] places auth: 400 { "error": { "code": 400 } }');
  });

  it("lets a durable incident overrule a cold instance", () => {
    /* THE ONE THAT MAKES THIS WORK ON SERVERLESS. The instance answering the
       status request is usually not the instance that hit the dead key, so
       without this a fresh box reports a serene "unknown" while every other
       box in the fleet is failing on the same revoked credential. */
    const folded = foldIncidents(base(), [
      { subsystem: "llm", fault: "auth" as Fault, at: "2026-07-30T01:00:00Z", count: 14 },
    ]);
    expect(folded.llm.verdict).toBe("failing");
    expect(folded.llm.recent[0]).toEqual({ fault: "auth", count: 14, last: "2026-07-30T01:00:00Z" });
  });

  it("does not overrule an instance that is demonstrably working", () => {
    // An hour-old blip during a deploy must not condemn a subsystem that is
    // answering fine right now.
    const folded = foldIncidents(base({ llm: shell({ thisInstance: { ok: 12, failed: 0 }, verdict: "healthy" }) }), [
      { subsystem: "llm", fault: "rate-limit" as Fault, at: "2026-07-30T01:00:00Z", count: 3 },
    ]);
    expect(folded.llm.verdict).toBe("healthy");
    expect(folded.llm.recent).toHaveLength(1);
  });

  it("never marks an unconfigured subsystem as failing", () => {
    const folded = foldIncidents(base({ places: shell({ configured: false, verdict: "off" }) }), [
      { subsystem: "places", fault: "auth" as Fault, at: "2026-07-30T01:00:00Z", count: 2 },
    ]);
    expect(folded.places.verdict).toBe("off");
  });

  it("ignores a subsystem it does not know about", () => {
    // Rows written by an older deployment must not crash the status page.
    const folded = foldIncidents(base(), [
      { subsystem: "weather", fault: "upstream" as Fault, at: "2026-07-30T01:00:00Z", count: 1 },
    ]);
    expect(folded.llm.recent).toHaveLength(0);
  });

  it("counts successes and failures separately per subsystem", () => {
    noteOk("places");
    noteOk("places");
    noteFault("llm", "auth", "dead key");
    // A failing model must not drag the places verdict down with it — they are
    // different vendors and different fixes.
    expect(verdictFor(true, 2, 0)).toBe("healthy");
    expect(verdictFor(true, 0, 1)).toBe("failing");
  });
});
