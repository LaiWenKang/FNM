import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// THE DURABLE HALF. Every one of these modules reads DATABASE_URL at import
// time and every one of them swallows its own failures on purpose, so the
// Postgres branches had never executed in a test — which is a poor place for a
// blind spot, because "swallows failures" and "silently does nothing at all"
// look identical from the outside.
//
// The driver is stubbed with a tagged-template spy. That also lets these
// assert something no live database could: that user-supplied values arrive as
// PARAMETERS rather than concatenated into the SQL text.

interface Call {
  text: string;
  values: unknown[];
}

function makeSql(rows: unknown[] = []) {
  const calls: Call[] = [];
  let fail = false;
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      if (fail) throw new Error("connection terminated unexpectedly");
      return rows;
    },
    { calls, setFail: (v: boolean) => { fail = v; } },
  );
  return sql;
}

async function withDb<T>(rows: unknown[], run: (sql: ReturnType<typeof makeSql>) => Promise<T>): Promise<T> {
  vi.resetModules();
  const sql = makeSql(rows);
  vi.doMock("@neondatabase/serverless", () => ({ neon: () => sql }));
  vi.stubEnv("DATABASE_URL", "postgres://stub/db");
  try {
    return await run(sql);
  } finally {
    vi.doUnmock("@neondatabase/serverless");
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the profile store", () => {
  it("reports itself configured only with a URL", async () => {
    await withDb([], async () => {
      expect((await import("@/lib/db")).dbConfigured).toBe(true);
    });
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    expect((await import("@/lib/db")).dbConfigured).toBe(false);
  });

  it("creates its table on first use, and only once", async () => {
    /* "No migration step to run" is the design. Re-running the DDL on every
       query would add a round trip to every recommendation. */
    await withDb([], async (sql) => {
      const db = await import("@/lib/db");
      await db.loadProfile("u-1");
      await db.loadProfile("u-2");
      await db.storeProfile("u-3", { swipeCount: 1 } as never);
      expect(sql.calls.filter((c) => c.text.includes("CREATE TABLE"))).toHaveLength(1);
    });
  });

  it("passes the user id as a parameter, never as SQL text", async () => {
    /* The id comes from an auth provider, but it is still data. If it ever
       reached the query as text, an account name could rewrite the statement. */
    await withDb([], async (sql) => {
      const db = await import("@/lib/db");
      await db.loadProfile("'; DROP TABLE profiles;--");
      const q = sql.calls.find((c) => c.text.includes("SELECT profile"))!;
      expect(q.values).toContain("'; DROP TABLE profiles;--");
      expect(q.text).not.toContain("DROP TABLE profiles");
    });
  });

  it("returns the stored profile", async () => {
    await withDb([{ profile: { swipeCount: 42 } }], async () => {
      expect(await (await import("@/lib/db")).loadProfile("u-1")).toEqual({ swipeCount: 42 });
    });
  });

  it("returns null for a user with no row", async () => {
    await withDb([], async () => {
      expect(await (await import("@/lib/db")).loadProfile("nobody")).toBeNull();
    });
  });

  it("never lets a storage hiccup break a recommendation", async () => {
    await withDb([], async (sql) => {
      const db = await import("@/lib/db");
      sql.setFail(true);
      await expect(db.loadProfile("u-1")).resolves.toBeNull();
      await expect(db.storeProfile("u-1", {} as never)).resolves.toBeUndefined();
      await expect(db.deleteProfile("u-1")).resolves.toBeUndefined();
    });
  });

  it("upserts rather than failing on a second save", async () => {
    // Without ON CONFLICT the second swipe of a session throws a primary-key
    // violation and the profile stops saving for good.
    await withDb([], async (sql) => {
      await (await import("@/lib/db")).storeProfile("u-1", { swipeCount: 2 } as never);
      expect(sql.calls.some((c) => /ON CONFLICT/i.test(c.text))).toBe(true);
    });
  });

  it("really deletes, so the delete button is not a lie", async () => {
    await withDb([], async (sql) => {
      await (await import("@/lib/db")).deleteProfile("u-1");
      const q = sql.calls.find((c) => /DELETE FROM profiles/i.test(c.text))!;
      expect(q.values).toContain("u-1");
    });
  });
});

describe("the metrics store", () => {
  it("records an event with the device id as a parameter", async () => {
    await withDb([], async (sql) => {
      const { track } = await import("@/lib/metrics");
      const { NextRequest } = await import("next/server");
      const req = new NextRequest("https://fnm.app/api/pick");
      req.cookies.set("fnm_member", "abc123def456ghi789jk");
      await track(req, "picked", { slot: "best", decisionMs: 4200 });
      const insert = sql.calls.find((c) => /INSERT INTO events/i.test(c.text))!;
      expect(insert.values[0]).toBe("abc123def456ghi789jk");
      expect(insert.values[1]).toBe("picked");
      expect(JSON.parse(insert.values[2] as string)).toEqual({ slot: "best", decisionMs: 4200 });
    });
  });

  it("never throws, because a lost event is worth less than a lunch", async () => {
    await withDb([], async (sql) => {
      const { track } = await import("@/lib/metrics");
      const { NextRequest } = await import("next/server");
      sql.setFail(true);
      await expect(track(new NextRequest("https://fnm.app/x"), "served")).resolves.toBeUndefined();
    });
  });

  it("reads a window back and summarises it", async () => {
    const at = new Date().toISOString();
    await withDb(
      [
        { device_id: "a", event: "served", props: {}, at },
        { device_id: "a", event: "picked", props: { slot: "best" }, at },
      ],
      async () => {
        const m = await (await import("@/lib/metrics")).metrics(28);
        expect(m.pickRate).toBe(1);
        expect(m.topPickShare).toBe(1);
        expect(m.totalEvents).toBe(2);
      },
    );
  });

  it("THROWS on a read failure rather than reporting a quiet month", async () => {
    /* Deliberately unlike `track`. A page of zeroes is indistinguishable from
       "nobody used the app", which is the most expensive way for the stats
       endpoint to be wrong — so the caller is made to handle it. */
    await withDb([], async (sql) => {
      const { metrics } = await import("@/lib/metrics");
      sql.setFail(true);
      await expect(metrics(28)).rejects.toThrow();
    });
  });

  it("builds the interval with make_interval, not string concatenation", async () => {
    /* The driver sends parameters untyped, so `$1 || ' days'` is an ambiguous
       `unknown || unknown` that Postgres refuses to resolve — which would have
       turned every stats read into the silent-zeroes case above. */
    await withDb([], async (sql) => {
      await (await import("@/lib/metrics")).metrics(14);
      const q = sql.calls.find((c) => /SELECT device_id/i.test(c.text))!;
      expect(q.text).toContain("make_interval");
      expect(q.values).toContain(14);
    });
  });
});

describe("the incident log", () => {
  it("writes a fault to the table", async () => {
    await withDb([], async (sql) => {
      const h = await import("@/lib/health");
      h.noteFault("llm", "auth", "gemini rejected the key");
      await new Promise((r) => setTimeout(r, 0));
      const insert = sql.calls.find((c) => /INSERT INTO incidents/i.test(c.text));
      expect(insert?.values).toEqual(["llm", "auth", "gemini rejected the key"]);
    });
  });

  it("throttles a repeating fault instead of writing a row per request", async () => {
    /* A dead key fails on EVERY request. Writing a row each time turns an
       outage into a second, self-inflicted one. */
    await withDb([], async (sql) => {
      const h = await import("@/lib/health");
      for (let i = 0; i < 25; i += 1) h.noteFault("places", "auth", `attempt ${i}`);
      await new Promise((r) => setTimeout(r, 0));
      expect(sql.calls.filter((c) => /INSERT INTO incidents/i.test(c.text))).toHaveLength(1);
    });
  });

  it("throttles per fault kind, so a NEW problem is still recorded", async () => {
    await withDb([], async (sql) => {
      const h = await import("@/lib/health");
      h.noteFault("llm", "auth", "one");
      h.noteFault("llm", "quota", "two");
      h.noteFault("places", "auth", "three");
      await new Promise((r) => setTimeout(r, 0));
      expect(sql.calls.filter((c) => /INSERT INTO incidents/i.test(c.text))).toHaveLength(3);
    });
  });

  it("still logs to the console when the incident write fails", async () => {
    // The console line is the record that survives the database this module
    // also writes to.
    await withDb([], async (sql) => {
      const h = await import("@/lib/health");
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      sql.setFail(true);
      h.noteFault("db", "upstream", "boom");
      await new Promise((r) => setTimeout(r, 0));
      expect(spy.mock.calls.some((c) => String(c[0]).startsWith("[fnm] db upstream"))).toBe(true);
    });
  });

  it("folds durable incidents into the report and reports durable: true", async () => {
    await withDb(
      [{ subsystem: "llm", fault: "auth", count: "7", at: "2026-07-30T01:00:00Z" }],
      async () => {
        const h = await import("@/lib/health");
        const report = await h.health({ llm: true, places: false, db: true });
        expect(report.durable).toBe(true);
        expect(report.subsystems.llm.recent[0]).toEqual({
          fault: "auth",
          count: 7,
          last: "2026-07-30T01:00:00Z",
        });
        // A cold instance must not report "unknown" while the fleet is failing.
        expect(report.subsystems.llm.verdict).toBe("failing");
        expect(report.subsystems.places.verdict).toBe("off");
      },
    );
  });

  it("names the database itself as failing when the report query dies", async () => {
    // The database is a subsystem too, so a failure here IS the finding.
    await withDb([], async (sql) => {
      const h = await import("@/lib/health");
      sql.setFail(true);
      const report = await h.health({ llm: false, places: false, db: true });
      expect(report.durable).toBe(false);
      expect(report.subsystems.db.verdict).toBe("failing");
    });
  });
});

describe("the fairness ledger", () => {
  it("reports itself durable with a database", async () => {
    await withDb([], async () => {
      expect((await import("@/lib/fairness")).fairnessDurable).toBe(true);
    });
  });

  it("writes one row per member per meal", async () => {
    await withDb([], async (sql) => {
      const f = await import("@/lib/fairness");
      await f.recordMeal([
        { memberId: "a", score: 80 },
        { memberId: "b", score: 40 },
      ]);
      const inserts = sql.calls.filter((c) => /INSERT INTO group_fairness/i.test(c.text));
      expect(inserts).toHaveLength(2);
      // The member id is a parameter, and the deficit is a number.
      expect(inserts[0].values[0]).toBe("a");
      expect(typeof inserts[0].values[1]).toBe("number");
    });
  });

  it("gives the short straw to whoever scored below the meal's mean", async () => {
    await withDb([], async (sql) => {
      const f = await import("@/lib/fairness");
      await f.recordMeal([
        { memberId: "happy", score: 90 },
        { memberId: "unhappy", score: 30 },
      ]);
      const inserts = sql.calls.filter((c) => /INSERT INTO group_fairness/i.test(c.text));
      const byId = Object.fromEntries(inserts.map((c) => [c.values[0], c.values[1] as number]));
      expect(byId.unhappy).toBeGreaterThan(0);
      expect(byId.happy).toBeLessThanOrEqual(0);
    });
  });

  it("reads debts back keyed by member", async () => {
    // `at` is stored as epoch millis, not a timestamp string.
    await withDb([{ member_id: "a", deficit: 12, at: Date.now() }], async () => {
      const owed = await (await import("@/lib/fairness")).debts(["a", "b"]);
      expect(owed.a).toBeGreaterThan(0);
      expect(owed.b ?? 0).toBe(0);
    });
  });

  it("returns an empty ledger rather than throwing when the query fails", async () => {
    /* Without a ledger the blend is the plain average it has always been —
       correct, just not rotated. Throwing would cost the group its decision. */
    await withDb([], async (sql) => {
      const f = await import("@/lib/fairness");
      sql.setFail(true);
      // Every requested member is present with a zero debt — the caller
      // indexes by id, so a missing key would read as undefined downstream.
      await expect(f.debts(["a"])).resolves.toEqual({ a: 0 });
      await expect(
        f.recordMeal([
          { memberId: "a", score: 50 },
          { memberId: "b", score: 90 },
        ]),
      ).resolves.toBeUndefined();
    });
  });

  it("asks for nothing when the group is empty", async () => {
    await withDb([], async (sql) => {
      const f = await import("@/lib/fairness");
      await f.debts([]);
      expect(sql.calls.filter((c) => /SELECT/i.test(c.text))).toHaveLength(0);
    });
  });
});
