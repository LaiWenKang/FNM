import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adviceFor, featureStatus } from "@/lib/features";
import { Fault, clearHealth, noteFault, noteOk } from "@/lib/health";

// WHAT IS SWITCHED ON, WITHOUT A DASHBOARD.
//
// The health work made failures legible — but only through GET /api/stats,
// behind STATS_TOKEN, as JSON. That is the right gate for pick rates and
// device ids, and the wrong one for "why is this app not writing me sentences
// any more". Answering that took an environment variable, a redeploy and a
// phone squinting at JSON, so a revoked key stayed undiagnosed not because the
// app did not know but because knowing was gated behind a chore.

beforeEach(() => {
  clearHealth();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("advice, which is the reason categories exist", () => {
  it("tells you to regenerate for auth and to wait for a rate limit", () => {
    /* A red light that does not distinguish "your key is dead" from "you are
       going too fast" is just anxiety with a colour. */
    expect(adviceFor("auth")).toMatch(/regenerate/i);
    expect(adviceFor("rate-limit")).toMatch(/clears on its own/i);
  });

  it("distinguishes a spent allowance from a burst limit", () => {
    // The distinction Google collapses into one 429, and the one that decides
    // whether you wait a minute or wait a day.
    expect(adviceFor("quota")).toMatch(/resets daily|billing/i);
    expect(adviceFor("quota")).not.toBe(adviceFor("rate-limit"));
  });

  it("says there is nothing to do when there is nothing to do", () => {
    expect(adviceFor("upstream")).toMatch(/nothing to fix/i);
  });

  it("has advice for every fault the classifier can produce", () => {
    // A category with no advice is a dead end on the screen.
    const all: Fault[] = [
      "auth", "rate-limit", "quota", "timeout", "upstream", "bad-response", "not-found", "unknown",
    ];
    for (const f of all) expect(adviceFor(f), f).toBeTruthy();
  });

  it("points a model-name mistake at the model name", () => {
    // Different fix from a dead key entirely, which is why it stopped being
    // filed under "unknown".
    expect(adviceFor("not-found")).toMatch(/GEMINI_MODEL|model name/i);
  });

  it("still points SOMEWHERE even when the cause is unrecognised", () => {
    /* "We do not know" is a dead end on a screen. The platform log has the
       vendor's own words under a greppable prefix, so say so. */
    expect(adviceFor("unknown")).toMatch(/\[fnm\]|log/i);
  });

  it("has nothing to say when nothing failed", () => {
    expect(adviceFor(null)).toBeNull();
  });
});

describe("the status list", () => {
  it("covers every optional capability, each with what is LOST", () => {
    /* Never a bare red light. "Off" is the correct state for most installs, so
       the row has to say what it costs rather than just glow. */
    return featureStatus().then((list) => {
      expect(list).toHaveLength(3);
      for (const f of list) {
        expect(f.label.length).toBeGreaterThan(0);
        expect(f.fallback.length).toBeGreaterThan(0);
      }
    });
  });

  it("calls an unconfigured capability off, not broken", async () => {
    // The zero-key install is supported, and flagging it red would train
    // somebody to ignore the whole panel.
    for (const f of await featureStatus()) expect(f.verdict).toBe("off");
  });

  it("reports a configured, working capability as healthy", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    noteOk("llm");
    const llm = (await featureStatus())[0];
    expect(llm.configured).toBe(true);
    expect(llm.verdict).toBe("healthy");
    expect(llm.fault).toBeNull();
  });

  it("reports a dead key as failing, WITH the fault category", async () => {
    /* THE WHOLE POINT. This is the sentence that was previously only reachable
       by setting an env var and reading JSON. */
    vi.stubEnv("GEMINI_API_KEY", "g-dead");
    noteFault("llm", "auth", "gemini rejected the key");
    const llm = (await featureStatus())[0];
    expect(llm.verdict).toBe("failing");
    expect(llm.fault).toBe("auth");
    expect(adviceFor(llm.fault)).toMatch(/regenerate/i);
  });

  it("names which vendor is selected, where there is a choice", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    expect((await featureStatus())[0].provider).toBe("gemini");
  });

  it("keeps one subsystem's failure out of another's row", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "p-1");
    noteFault("places", "auth", "places key rejected");
    const [llm, places] = await featureStatus();
    expect(places.verdict).toBe("failing");
    expect(llm.verdict).toBe("unknown");
    expect(llm.fault).toBeNull();
  });

  it("NEVER carries the vendor's own error text", async () => {
    /* A provider message can quote fragments of the request back, and has no
       business on a user's screen. The category is the whole payload. */
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    noteFault("llm", "auth", "API key AIzaSy-SECRET-LOOKING-STRING not valid");
    const blob = JSON.stringify(await featureStatus());
    expect(blob).not.toContain("AIzaSy");
    expect(blob).not.toContain("SECRET");
  });

  it("carries no metrics — those stay behind the token", async () => {
    // Pick rates, counts and device ids are the shape of the business. This
    // panel is deliberately only "is it on, is it working, what kind of fail".
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    noteOk("llm");
    noteFault("llm", "timeout", "slow");
    const keys = new Set(Object.keys((await featureStatus())[0]));
    expect(keys).toEqual(new Set(["label", "fallback", "configured", "verdict", "fault", "provider"]));
  });
});
