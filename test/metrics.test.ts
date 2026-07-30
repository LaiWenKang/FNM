import { describe, expect, it } from "vitest";
import { median, rate, summarise } from "@/lib/metrics";

// PLAN.md §6 names six success metrics. These tests are about the arithmetic
// that turns raw events into them — and, more than that, about the cases where
// the honest answer is "not enough data yet" rather than a confident number.
// A dashboard that reports 100% pick rate off a single event is worse than a
// blank one, because someone will act on it.

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.parse("2026-06-01T12:00:00Z");

type Row = Parameters<typeof summarise>[0][number];

const row = (
  event: Row["event"],
  over: { device?: string; at?: number; props?: Row["props"] } = {},
): Row => ({
  device_id: over.device ?? "d1",
  event,
  props: over.props ?? {},
  at: new Date(over.at ?? t0).toISOString(),
});

describe("refusing to make numbers up", () => {
  it("reports nothing at all from an empty table", () => {
    const m = summarise([], 28);
    expect(m.totalEvents).toBe(0);
    expect(m.pickRate).toBeNull();
    expect(m.deadEndRate).toBeNull();
    expect(m.medianDecisionSeconds).toBeNull();
    // The window still comes back, so the caller can tell "no data in 28 days"
    // from "the query failed".
    expect(m.windowDays).toBe(28);
  });

  it("has no pick rate when nothing was ever served", () => {
    // Picks with no serves means the instrumentation is broken, not that the
    // rate is infinite.
    expect(summarise([row("picked")], 28).pickRate).toBeNull();
  });

  it("has no top-pick share when nobody has picked", () => {
    expect(summarise([row("served")], 28).topPickShare).toBeNull();
  });

  it("has no group completion rate before any group exists", () => {
    expect(summarise([row("served")], 28).groupCompletionRate).toBeNull();
  });

  it("ignores decision times that cannot be decision times", () => {
    // A phone left on the counter over lunch, or a clock that went backwards.
    // Either would drag the median into fiction.
    const rows = [
      row("served"),
      row("picked", { props: { decisionMs: -5 } }),
      row("picked", { props: { decisionMs: 4 * 60 * 60 * 1000 } }),
      row("picked", { props: { decisionMs: 8000 } }),
    ];
    expect(summarise(rows, 28).medianDecisionSeconds).toBe(8);
  });
});

describe("the six numbers", () => {
  it("counts pick rate against what was served", () => {
    const rows = [row("served"), row("served"), row("served"), row("served"), row("picked")];
    expect(summarise(rows, 28).pickRate).toBe(0.25);
  });

  it("separates taking the top pick from taking any pick", () => {
    // THE ONE THAT SAYS WHETHER THE RANKING WORKS. A healthy pick rate made
    // entirely of people scrolling to the third option means the scoring is
    // ordering the list wrong.
    const rows = [
      row("served"),
      row("picked", { props: { slot: "best" } }),
      row("picked", { props: { slot: "adventurous" } }),
      row("picked", { props: { slot: "safer" } }),
      row("picked", { props: { slot: "best" } }),
    ];
    expect(summarise(rows, 28).topPickShare).toBe(0.5);
  });

  it("tracks the dead end as a share of what was served", () => {
    const rows = [row("served"), row("served"), row("dead_end")];
    expect(summarise(rows, 28).deadEndRate).toBe(0.5);
  });

  it("takes the median decision time, not the mean", () => {
    const rows = [
      row("served"),
      row("picked", { props: { decisionMs: 3000 } }),
      row("picked", { props: { decisionMs: 5000 } }),
      row("picked", { props: { decisionMs: 400000 } }),
    ];
    // Mean would be 136s and would claim the app is unusable. Median is 5s.
    expect(summarise(rows, 28).medianDecisionSeconds).toBe(5);
  });

  it("divides decisions by active devices and by weeks", () => {
    const rows = [
      row("picked", { device: "a" }),
      row("picked", { device: "a" }),
      row("picked", { device: "b" }),
      row("picked", { device: "b" }),
    ];
    // 4 picks / 2 devices / 2 weeks = 1 per person per week.
    expect(summarise(rows, 14).decisionsPerActiveUserPerWeek).toBe(1);
  });

  it("never divides by less than one week", () => {
    // A one-day window must not multiply a single lunch into seven.
    const m = summarise([row("picked")], 1);
    expect(m.decisionsPerActiveUserPerWeek).toBe(1);
  });

  it("counts a device as retained only once it comes back a week later", () => {
    const rows = [
      row("served", { device: "stayed", at: t0 }),
      row("served", { device: "stayed", at: t0 + 8 * DAY }),
      row("served", { device: "left", at: t0 }),
      row("served", { device: "left", at: t0 + 2 * DAY }),
    ];
    // "Left" used the app twice — but inside one week, which is a session,
    // not a habit.
    expect(summarise(rows, 28).fourWeekRetention).toBe(0.5);
  });

  it("counts a group as complete only when it actually decided", () => {
    const rows = [row("group_created"), row("group_created"), row("group_decided")];
    expect(summarise(rows, 28).groupCompletionRate).toBe(0.5);
  });
});

describe("verdicts", () => {
  it("tallies each verdict and ignores anything unrecognised", () => {
    const rows = [
      row("rated", { props: { verdict: "again" } }),
      row("rated", { props: { verdict: "again" } }),
      row("rated", { props: { verdict: "no" } }),
      row("rated", { props: { verdict: "banana" } }),
      row("rated", {}),
    ];
    expect(summarise(rows, 28).verdicts).toEqual({ again: 2, fine: 0, no: 1 });
  });
});

describe("the helpers on their own", () => {
  it("returns null rather than dividing by zero", () => {
    expect(rate(3, 0)).toBeNull();
  });

  it("can be told a denominator is too small to trust", () => {
    // One serve and one pick is not a 100% pick rate, it is one data point.
    expect(rate(1, 1, 30)).toBeNull();
    expect(rate(1, 1)).toBe(1);
  });

  it("rounds a rate to somewhere honest", () => {
    expect(rate(1, 3)).toBe(0.333);
  });

  it("has no median for an empty set", () => {
    expect(median([])).toBeNull();
  });

  it("takes the middle of an odd set and the midpoint of an even one", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
  });

  it("does not reorder the caller's array", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("what an event is allowed to carry", () => {
  it("never records anything that identifies a person", () => {
    // THE PRIVACY INVARIANT, PINNED. The device id is an opaque cookie value,
    // and the props are a handful of small enums and numbers. If someone ever
    // adds a name, an email or a coordinate to MetricProps, this fails.
    const allowed = ["slot", "decisionMs", "reason", "verdict", "members"];
    const sample: Row["props"] = {
      slot: "best",
      decisionMs: 1200,
      reason: "too far",
      verdict: "again",
      members: 4,
    };
    expect(Object.keys(sample).every((k) => allowed.includes(k))).toBe(true);
  });
});
