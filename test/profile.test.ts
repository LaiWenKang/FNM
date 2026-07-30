import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// WHERE A PALATE SURVIVES. Sixteen swipes of onboarding, months of picks and
// verdicts — all of it lives or dies here. A silent failure in this module does
// not crash anything; it just quietly resets people to strangers, and the only
// symptom is that the app never seems to learn.
//
// next-auth and the Postgres driver are mocked because this is about the
// BRANCHING — guest vs signed-in, present vs absent row — which is exactly the
// wiring that has produced the bugs, and which cannot be reached at all with
// the real modules in a unit test.

const auth = vi.hoisted(() => vi.fn(async () => null as { user?: { id?: string } } | null));
const db = vi.hoisted(() => ({
  dbConfigured: true,
  loadProfile: vi.fn(async (_id: string) => null as Record<string, unknown> | null),
  storeProfile: vi.fn(async () => {}),
  deleteProfile: vi.fn(async () => {}),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => db);

const { currentUserId, eraseProfile, readProfile, writeProfile } = await import("@/lib/profile");
const { MAX_RECENT, defaultProfile } = await import("@/lib/profile-shape");

const COOKIE = "fnm_profile";

function reqWith(profile?: unknown) {
  const req = new NextRequest("https://fnm.app/api/recommend");
  if (profile !== undefined) {
    req.cookies.set(COOKIE, typeof profile === "string" ? profile : JSON.stringify(profile));
  }
  return req;
}

const cookieProfile = (res: NextResponse) => JSON.parse(res.cookies.get(COOKIE)!.value);

beforeEach(() => {
  auth.mockResolvedValue(null);
  db.dbConfigured = true;
  db.loadProfile.mockResolvedValue(null);
  db.storeProfile.mockClear();
  db.deleteProfile.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("who is asking", () => {
  it("is nobody for a guest", async () => {
    expect(await currentUserId()).toBeNull();
  });

  it("is the account id when signed in", async () => {
    auth.mockResolvedValue({ user: { id: "u-1" } });
    expect(await currentUserId()).toBe("u-1");
  });

  it("treats a broken auth session as a guest rather than throwing", async () => {
    /* An expired secret or an auth outage must degrade to the guest path, not
       500 the recommendation. The user loses cross-device sync for that
       request; they do not lose their lunch. */
    auth.mockRejectedValue(new Error("JWT malformed"));
    expect(await currentUserId()).toBeNull();
    expect(await readProfile(reqWith())).toEqual(defaultProfile());
  });
});

describe("a guest's profile", () => {
  it("starts from the default when there is no cookie", async () => {
    expect(await readProfile(reqWith())).toEqual(defaultProfile());
  });

  it("round-trips through the cookie", async () => {
    const mine = { ...defaultProfile(), swipeCount: 16, maxKm: 3 };
    const res = NextResponse.json({});
    await writeProfile(res, mine);
    expect(await readProfile(reqWith(cookieProfile(res)))).toMatchObject({ swipeCount: 16, maxKm: 3 });
  });

  it("survives a corrupt cookie instead of throwing", async () => {
    // The cookie is user-supplied bytes. A parse failure here would 500 every
    // single request for that browser, permanently, with no way to recover.
    expect(await readProfile(reqWith("{not json"))).toEqual(defaultProfile());
  });

  it("fills in fields written by an older build", async () => {
    /* Shipping a new profile field must not brick existing users. Spreading
       over the default is what makes `recent` an array rather than undefined
       the first time a pre-verdict profile is read. */
    const old = await readProfile(reqWith({ vector: defaultProfile().vector, swipeCount: 4 }));
    expect(old.swipeCount).toBe(4);
    expect(old.recent).toEqual([]);
    expect(old.priceMax).toBe(3);
  });

  it("never touches the database", async () => {
    await writeProfile(NextResponse.json({}), defaultProfile());
    expect(db.storeProfile).not.toHaveBeenCalled();
  });

  it("keeps the cookie out of reach of scripts and alive for a year", async () => {
    // "Nothing leaves the phone" is the privacy promise; httpOnly is what
    // stops a stray script reading a year of someone's eating history.
    const res = NextResponse.json({});
    await writeProfile(res, defaultProfile());
    const c = res.cookies.get(COOKIE)!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("lax");
    expect(c.maxAge ?? 0).toBeGreaterThan(300 * 24 * 60 * 60);
  });
});

describe("a signed-in profile", () => {
  beforeEach(() => auth.mockResolvedValue({ user: { id: "u-1" } }));

  it("comes from the database when a row exists", async () => {
    db.loadProfile.mockResolvedValue({ swipeCount: 42 });
    // The stored row wins over the cookie — that is the entire point of
    // signing in on a second device.
    const p = await readProfile(reqWith({ ...defaultProfile(), swipeCount: 1 }));
    expect(p.swipeCount).toBe(42);
  });

  it("adopts the guest profile on first sign-in instead of discarding it", async () => {
    /* THE MIGRATION MOMENT. Somebody swipes sixteen cards, likes the app, then
       signs in — and if this branch is wrong, that is the exact instant all
       sixteen are thrown away. */
    db.loadProfile.mockResolvedValue(null);
    const p = await readProfile(reqWith({ ...defaultProfile(), swipeCount: 16 }));
    expect(p.swipeCount).toBe(16);
    expect(db.storeProfile).toHaveBeenCalledWith("u-1", expect.objectContaining({ swipeCount: 16 }));
  });

  it("does not write an empty guest profile over nothing", async () => {
    // Signing in without having swiped should not create a row full of
    // defaults; there is nothing worth migrating.
    db.loadProfile.mockResolvedValue(null);
    await readProfile(reqWith());
    expect(db.storeProfile).not.toHaveBeenCalled();
  });

  it("also fills in defaults for a row written by an older build", async () => {
    db.loadProfile.mockResolvedValue({ swipeCount: 3 });
    expect((await readProfile(reqWith())).recent).toEqual([]);
  });

  it("writes to BOTH the database and the cookie", async () => {
    /* The cookie mirror is not redundant. It is what keeps the app working in
       the same browser if the database is unreachable on the next request. */
    const res = NextResponse.json({});
    await writeProfile(res, { ...defaultProfile(), swipeCount: 7 });
    expect(db.storeProfile).toHaveBeenCalled();
    expect(cookieProfile(res).swipeCount).toBe(7);
  });

  it("falls back to the cookie when no DATABASE_URL is set", async () => {
    db.dbConfigured = false;
    db.loadProfile.mockResolvedValue({ swipeCount: 99 });
    const p = await readProfile(reqWith({ ...defaultProfile(), swipeCount: 5 }));
    expect(p.swipeCount).toBe(5);
    expect(db.loadProfile).not.toHaveBeenCalled();
  });
});

describe("trimming history", () => {
  it("keeps only the most recent meals", async () => {
    // Unbounded growth would push the cookie past the 4 KB browsers accept,
    // at which point the whole profile silently stops persisting.
    const many = Array.from({ length: MAX_RECENT + 15 }, (_, i) => ({
      placeId: `p${i}`,
      cuisine: "teochew",
      at: i,
    }));
    const res = NextResponse.json({});
    await writeProfile(res, { ...defaultProfile(), recent: many });
    const saved = cookieProfile(res).recent;
    expect(saved).toHaveLength(MAX_RECENT);
    // The NEWEST ones, not the oldest — the repeat penalty is about what you
    // just ate.
    expect(saved[saved.length - 1].placeId).toBe(`p${many.length - 1}`);
  });

  it("leaves a short history alone", async () => {
    const res = NextResponse.json({});
    await writeProfile(res, {
      ...defaultProfile(),
      recent: [{ placeId: "p1", cuisine: "teochew", at: 1 }],
    });
    expect(cookieProfile(res).recent).toHaveLength(1);
  });

  it("keeps the cookie small enough for a browser to accept", async () => {
    const res = NextResponse.json({});
    await writeProfile(res, {
      ...defaultProfile(),
      recent: Array.from({ length: MAX_RECENT }, (_, i) => ({
        placeId: `place-with-a-fairly-long-google-id-${i}`,
        cuisine: "hainanese-chicken-rice",
        at: Date.now(),
        flavor: defaultProfile().vector,
        verdict: "again" as const,
      })),
    });
    expect(res.cookies.get(COOKIE)!.value.length).toBeLessThan(4096);
  });
});

describe("erasing it", () => {
  it("clears the device even for a guest", async () => {
    const res = NextResponse.json({});
    await eraseProfile(res);
    expect(cookieProfile(res)).toEqual(defaultProfile());
    expect(db.deleteProfile).not.toHaveBeenCalled();
  });

  it("clears BOTH stores when signed in", async () => {
    /* "Deletable" is a stated promise. Wiping only the cookie would leave the
       row in Postgres and the profile would reappear on the next sign-in —
       a delete button that does not delete. */
    auth.mockResolvedValue({ user: { id: "u-1" } });
    const res = NextResponse.json({});
    await eraseProfile(res);
    expect(db.deleteProfile).toHaveBeenCalledWith("u-1");
    expect(cookieProfile(res)).toEqual(defaultProfile());
  });
});
