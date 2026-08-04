import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// ONE BAD SECOND MUST NOT BECOME HOURS OF "DATABASE DOWN". Every storage
// module memoises its CREATE TABLE with `ready ??= (...)()` — and `??=` will
// happily memoise a REJECTED promise. Before the fix, a single cold-start
// timeout on the first request pinned that rejection for the life of the
// instance: every later call re-threw it, every caller's catch read it as
// "storage is down", and a perfectly healthy database went unused until the
// instance happened to be recycled.

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/serverless", () => ({ neon: () => sqlMock }));

vi.stubEnv("DATABASE_URL", "postgres://test.invalid/db");
const { loadProfile } = await import("@/lib/db");

afterAll(() => vi.unstubAllEnvs());

describe("schema creation after a transient failure", () => {
  // One test, deliberately: `ready` is module state, so the phases only mean
  // anything in sequence — fail once, recover, then stay settled.
  it("retries on the next call, then settles and never re-runs", async () => {
    sqlMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    // First touch fails — the caller degrades gracefully, as designed.
    expect(await loadProfile("u1")).toBeNull();

    // The database recovers. The NEXT call must reach it.
    sqlMock.mockResolvedValue([{ profile: { swipeCount: 7 } }]);
    expect(await loadProfile("u1")).toEqual({ swipeCount: 7 });

    // And a settled success is settled: no third CREATE on later calls.
    await loadProfile("u2");
    const creates = sqlMock.mock.calls.filter((c) => String(c[0]).includes("CREATE TABLE"));
    expect(creates).toHaveLength(2); // the failed attempt, the successful one
  });
});
