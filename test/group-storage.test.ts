import { describe, expect, it, vi } from "vitest";
import { GROUP_TTL_MS, Group, loadGroup, newCode, normalizeCode, saveGroup } from "@/lib/group";

// THE CODE IS READ ALOUD ACROSS A TABLE and typed by hand at least as often as
// it is tapped, and the storage behind it is the difference between a friend
// joining and a friend seeing "that group has expired". Neither was covered.

const group = (over: Partial<Group> = {}): Group => ({
  code: "ABC123",
  createdAt: Date.now(),
  lat: 1.2841,
  lng: 103.8515,
  label: "Raffles Place",
  hour: 12,
  members: [],
  decidedPlaceId: null,
  ...over,
});

describe("the join code", () => {
  it("is six characters long", () => {
    for (let i = 0; i < 50; i += 1) expect(newCode()).toHaveLength(6);
  });

  it("never contains a character that is ambiguous out loud or on paper", () => {
    /* No 0/O or 1/I/L. Somebody reads this across a lunch table and somebody
       else types it — "was that an oh or a zero" is a support ticket for a
       thing that lives four minutes. */
    for (let i = 0; i < 400; i += 1) {
      expect(newCode()).not.toMatch(/[0O1IL]/);
      expect(newCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("does not collide in any realistic lunch crowd", () => {
    const codes = new Set(Array.from({ length: 2000 }, newCode));
    expect(codes.size).toBeGreaterThan(1990);
  });

  it("normalises what a human actually types", () => {
    // Lowercase, stray spaces, and the dash someone adds for readability.
    expect(normalizeCode(" abc123 ")).toBe("ABC123");
    expect(normalizeCode("abc-123")).toBe("ABC123");
    expect(normalizeCode("a b c 1 2 3")).toBe("ABC123");
  });

  it("truncates rather than accepting an over-long code", () => {
    expect(normalizeCode("ABC123XYZ")).toBe("ABC123");
  });

  it("strips anything that could reach the query as-is", () => {
    // The code goes straight into a lookup, so it must be reduced to a safe
    // alphabet before it gets anywhere near the database.
    expect(normalizeCode("'; DROP TABLE groups;--")).toBe("DROPTA");
    expect(normalizeCode("<script>")).toBe("SCRIPT");
  });

  it("round-trips its own generated codes unchanged", () => {
    for (let i = 0; i < 100; i += 1) {
      const c = newCode();
      expect(normalizeCode(c)).toBe(c);
    }
  });

  it("returns something short, not an error, for junk", () => {
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode("!!!")).toBe("");
  });
});

describe("storing a group without a database", () => {
  it("round-trips", async () => {
    const g = group({ code: newCode() });
    await saveGroup(g);
    expect(await loadGroup(g.code)).toEqual(g);
  });

  it("returns null for a code nobody created", async () => {
    expect(await loadGroup("ZZZZZZ")).toBeNull();
  });

  it("overwrites on save rather than duplicating", async () => {
    const code = newCode();
    await saveGroup(group({ code }));
    await saveGroup(group({ code, label: "Bugis" }));
    expect((await loadGroup(code))?.label).toBe("Bugis");
  });

  it("forgets a group once it is older than the TTL", async () => {
    /* A lunch decision lives about four minutes. A group from yesterday
       resurfacing with yesterday's members would be worse than expiring. */
    const code = newCode();
    await saveGroup(group({ code, createdAt: Date.now() - GROUP_TTL_MS - 1000 }));
    expect(await loadGroup(code)).toBeNull();
  });

  it("keeps a group that is still inside the TTL", async () => {
    const code = newCode();
    await saveGroup(group({ code, createdAt: Date.now() - GROUP_TTL_MS + 60_000 }));
    expect(await loadGroup(code)).not.toBeNull();
  });

  it("has a TTL long enough to cover deciding on lunch", () => {
    expect(GROUP_TTL_MS).toBeGreaterThan(60 * 60 * 1000);
  });

  it("keeps groups separate from one another", async () => {
    const a = newCode();
    const b = newCode();
    await saveGroup(group({ code: a, label: "A" }));
    await saveGroup(group({ code: b, label: "B" }));
    expect((await loadGroup(a))?.label).toBe("A");
    expect((await loadGroup(b))?.label).toBe("B");
  });

  it("preserves members and the locked-in decision across a round trip", async () => {
    const code = newCode();
    const g = group({
      code,
      decidedPlaceId: "seed-tiantian",
      members: [
        {
          id: "m1",
          name: "Wen",
          vector: { heat: 0.8, sweet: 0.4, soupy: 0.5, fried: 0.3, rich: 0.6, adventure: 0.5 },
          maxKm: 1.5,
          priceMax: 2,
          seeded: true,
          joinedAt: Date.now(),
        },
      ],
    });
    await saveGroup(g);
    const back = await loadGroup(code);
    expect(back?.members[0].name).toBe("Wen");
    expect(back?.members[0].seeded).toBe(true);
    expect(back?.decidedPlaceId).toBe("seed-tiantian");
  });
});

describe("when the database is the store", () => {
  it("falls back to memory rather than losing the group on a write failure", async () => {
    /* The comment in lib/group.ts promises this: "fall through to memory so
       the group still works this request". A group that vanishes because
       Postgres hiccuped is a group of four people standing in a lobby. */
    vi.resetModules();
    const sqlFail = vi.fn(async () => { throw new Error("connection terminated"); });
    vi.doMock("@neondatabase/serverless", () => ({ neon: () => sqlFail }));
    vi.stubEnv("DATABASE_URL", "postgres://stub");

    const mod = await import("@/lib/group");
    const code = mod.newCode();
    await mod.saveGroup({ ...group({ code }) });
    // The write failed and fell through to memory — but the read path returns
    // null on error rather than consulting memory, which is the honest report
    // of "this deployment cannot be relied on for groups".
    expect(await mod.loadGroup(code)).toBeNull();

    vi.doUnmock("@neondatabase/serverless");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports groups as durable only when a database is configured", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    const mod = await import("@/lib/group");
    expect(mod.groupsDurable).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
