import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Group } from "@/lib/group";

// THE MEMBER ID IS A BEARER CREDENTIAL. It is the only thing that identifies a
// device, so whoever presents it in a cookie IS that device — including its
// saved list of restaurants and addresses. The group endpoints used to
// broadcast every member's raw id to anyone holding a six-character code:
// fetch the lobby, copy a victim's id into your own fnm_member cookie, and
// GET /api/saved read their saved places while DELETE erased them. These tests
// pin the fix from the attacker's side of the wire.

const store = vi.hoisted(() => ({ group: null as Group | null }));

vi.mock("@/lib/group", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/group")>()),
  loadGroup: vi.fn(async () => store.group),
  saveGroup: vi.fn(async (g: Group) => {
    store.group = g;
  }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
// Hermetic: the decide POST's fairness-ledger branch builds context and
// fetches candidates, and neither belongs on the network in a unit test.
vi.mock("@/lib/context", () => ({
  buildContext: vi.fn(async () => ({ hourSg: 12, mealPeriod: "lunch", raining: false, forecast: null })),
}));
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  getCandidatePlaces: vi.fn(async () => []),
}));

const { GET: lobby } = await import("@/app/api/group/route");
const { POST: decide } = await import("@/app/api/group/decide/route");
const { publicMemberId } = await import("@/lib/member");

const HOST_ID = "aaaabbbbccccddddeeeeffff";
const GUEST_ID = "0000111122223333444455556";

const member = (id: string, name: string) => ({
  id,
  name,
  vector: { heat: 0.5, sweet: 0.5, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.5 },
  maxKm: 1.5,
  priceMax: 3 as const,
  seeded: true,
  joinedAt: 1,
});

beforeEach(() => {
  store.group = {
    code: "ABC234",
    createdAt: 1,
    lat: 1.2841,
    lng: 103.8515,
    label: "Raffles Place",
    hour: null,
    members: [member(HOST_ID, "Host"), member(GUEST_ID, "Guest")],
    decidedPlaceId: null,
  };
});

afterEach(() => vi.clearAllMocks());

const asMember = (id: string | null, body: unknown) => {
  const req = new NextRequest("https://fnm.app/api/group/decide", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (id) req.cookies.set("fnm_member", id);
  return req;
};

describe("what the lobby reveals", () => {
  it("never contains a raw member id anywhere in the body", async () => {
    const res = await lobby(new NextRequest("https://fnm.app/api/group?code=ABC234"));
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    expect(text).not.toContain(HOST_ID);
    expect(text).not.toContain(GUEST_ID);
  });

  it("gives each member a stable public handle instead", async () => {
    const res = await lobby(new NextRequest("https://fnm.app/api/group?code=ABC234"));
    const body = await res.json();
    expect(body.members.map((m: { id: string }) => m.id)).toEqual([
      publicMemberId(HOST_ID),
      publicMemberId(GUEST_ID),
    ]);
    // Stable across polls — the client keys its list on this.
    expect(publicMemberId(HOST_ID)).toBe(publicMemberId(HOST_ID));
    expect(publicMemberId(HOST_ID)).not.toBe(publicMemberId(GUEST_ID));
  });

  it("still recognises the requester from their own cookie", async () => {
    const req = new NextRequest("https://fnm.app/api/group?code=ABC234");
    req.cookies.set("fnm_member", GUEST_ID);
    const body = await (await lobby(req)).json();
    expect(body.youAreIn).toBe(true);
  });
});

describe("who may lock a decision", () => {
  it("refuses a stranger who only has the code", async () => {
    const res = await decide(asMember(null, { code: "ABC234", placeId: "some-place" }));
    expect(res.status).toBe(403);
    expect(store.group!.decidedPlaceId).toBeNull();
  });

  it("refuses a forged cookie that is not in the group", async () => {
    const res = await decide(
      asMember("zzzzyyyyxxxxwwwwvvvvuuuu", { code: "ABC234", placeId: "some-place" }),
    );
    expect(res.status).toBe(403);
    expect(store.group!.decidedPlaceId).toBeNull();
  });

  it("lets a member decide, and un-decide", async () => {
    const locked = await decide(asMember(GUEST_ID, { code: "ABC234", placeId: "lau-pa-sat" }));
    expect(locked.status).toBe(200);
    expect(store.group!.decidedPlaceId).toBe("lau-pa-sat");

    const unlocked = await decide(asMember(GUEST_ID, { code: "ABC234", placeId: null }));
    expect(unlocked.status).toBe(200);
    expect(store.group!.decidedPlaceId).toBeNull();
  });

  it("rejects a placeId that is not shaped like one", async () => {
    // This string is stored and then broadcast into every member's lobby.
    const res = await decide(
      asMember(GUEST_ID, { code: "ABC234", placeId: "<script>alert(1)</script>" }),
    );
    expect(res.status).toBe(400);
    expect(store.group!.decidedPlaceId).toBeNull();
  });
});
