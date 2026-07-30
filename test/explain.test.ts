import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/lib/context";
import { SEED_PLACES } from "@/lib/data/seed";
import { vec } from "@/lib/flavor";
import { defaultProfile } from "@/lib/profile-shape";
import { recommend } from "@/lib/scoring";

// THE ONE SENTENCE ANYONE ACTUALLY READS. Everything else on the card is a
// number or a bar; this is the app speaking, and prose sounds certain in a way
// a hatched grey bar does not. Two rules govern it: never claim something the
// engine did not compute, and never restate what the card already shows.

const ask = vi.hoisted(() =>
  vi.fn(async (_opts: { system: string; user: string; maxTokens: number }) => null as string | null),
);
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, ask };
});

const { explain } = await import("@/lib/explain");

const CTX: Context = { hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null };
const RAIN: Context = { ...CTX, raining: true, forecast: "Thundery Showers" };
const ORIGIN = { lat: 1.2841, lng: 103.8515 };

const warm = () => ({ ...defaultProfile(), maxKm: 50, swipeCount: 16, vector: vec({ heat: 0.9, rich: 0.85 }) });
const pickIn = (ctx: Context, profile = warm(), palateKnown = true) =>
  recommend(profile, SEED_PLACES, ctx, ORIGIN, [], null, palateKnown)!.best;

beforeEach(() => {
  ask.mockReset();
  ask.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

describe("with no model configured", () => {
  it("still produces a sentence", async () => {
    // The zero-key path is a supported mode, not a degraded one; a blank
    // "why" line would read as a rendering fault.
    const line = await explain(pickIn(CTX), warm(), CTX);
    expect(line.length).toBeGreaterThan(0);
    expect(line.endsWith(".")).toBe(true);
  });

  it("starts with a capital letter", async () => {
    expect(await explain(pickIn(CTX), warm(), CTX)).toMatch(/^[A-Z0-9]/);
  });

  it("quotes the SAME number the ring draws", async () => {
    /* The card cannot show 92 and say 89% four lines apart. Both come from
       `matchScore` for exactly this reason. */
    const pick = pickIn(CTX);
    expect(await explain(pick, warm(), CTX)).toContain(`${pick.matchScore}%`);
  });

  it("adds the weather clause when it rained into the decision", async () => {
    // The "why" has to ADD information — the meta row already shows walk time
    // and price, so restating those would waste the only sentence there is.
    const line = await explain(pickIn(RAIN), warm(), RAIN);
    expect(line).toMatch(/rain|dry/i);
  });

  it("adds at most one extra clause, so it stays one sentence", async () => {
    const line = await explain(pickIn(RAIN), warm(), RAIN);
    expect(line.split(" — and ").length).toBeLessThanOrEqual(2);
  });

  it("names the palate once there is one", async () => {
    expect(await explain(pickIn(CTX), warm(), CTX, true)).toContain("palate");
  });

  it("names no palate before the diner has told us anything", async () => {
    /* describeTaste reads the neutral vector as "balanced" and the template
       stated it as a finding — so the first sentence a new diner ever read
       asserted a taste the app had not been told. */
    const cold = { ...defaultProfile(), maxKm: 50 };
    const line = await explain(pickIn(CTX, cold, false), cold, CTX, false);
    expect(line).not.toContain("palate");
    expect(line).toMatch(/\d+% match/);
  });
});

describe("with a model", () => {
  it("prefers the model's sentence", async () => {
    ask.mockResolvedValue("Wingstop's Mango Habanero, five minutes away and exactly your kind of heat.");
    expect(await explain(pickIn(CTX), warm(), CTX)).toContain("Mango Habanero");
  });

  it("trims whitespace the model left behind", async () => {
    ask.mockResolvedValue("  A good call today.  \n");
    expect(await explain(pickIn(CTX), warm(), CTX)).toBe("A good call today.");
  });

  it("falls back on an empty answer rather than printing nothing", async () => {
    ask.mockResolvedValue("   ");
    expect((await explain(pickIn(CTX), warm(), CTX)).length).toBeGreaterThan(0);
  });

  it("tells the model the score it must not re-derive", async () => {
    ask.mockResolvedValue("ok");
    const pick = pickIn(CTX);
    await explain(pick, warm(), CTX);
    expect(JSON.parse(ask.mock.calls[0][0].user).matchScore).toBe(pick.matchScore);
    expect(ask.mock.calls[0][0].system).toMatch(/matchScore exactly/);
  });

  it("withholds the taste entirely when there is none, rather than sending 'balanced'", async () => {
    /* Handing a fluent model `userTaste: "balanced"` and asking why the pick
       suits this person invites exactly the sentence the template was fixed
       for — stated more confidently, because it is prose from a model. */
    ask.mockResolvedValue("ok");
    const cold = { ...defaultProfile(), maxKm: 50 };
    await explain(pickIn(CTX, cold, false), cold, CTX, false);
    const sent = JSON.parse(ask.mock.calls[0][0].user);
    expect(sent.userTaste).toBeUndefined();
    expect(ask.mock.calls[0][0].system).toMatch(/NOT set up a taste profile/);
  });

  it("sends the taste when there IS one", async () => {
    ask.mockResolvedValue("ok");
    await explain(pickIn(CTX), warm(), CTX, true);
    expect(JSON.parse(ask.mock.calls[0][0].user).userTaste).toBeTruthy();
  });

  it("asks for something short enough to fit the card", async () => {
    ask.mockResolvedValue("ok");
    await explain(pickIn(CTX), warm(), CTX);
    expect(ask.mock.calls[0][0].system).toMatch(/under \d+ words/);
  });

  it("relies on ask() returning null rather than catching for itself", async () => {
    /* Deliberately NOT a "never throws" test. The swallowing lives in ask(),
       which is where the failure can also be CLASSIFIED and recorded — see
       test/llm-providers. Catching a second time here would just hide the
       same error from the one place that reports it. This pins the contract
       explain depends on: null in, template out. */
    ask.mockResolvedValue(null);
    const line = await explain(pickIn(CTX), warm(), CTX);
    expect(line.length).toBeGreaterThan(0);
    expect(line).toContain("%");
  });
});
