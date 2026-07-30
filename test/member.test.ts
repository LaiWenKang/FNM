import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { memberIdFrom, setMemberCookie } from "@/lib/member";

// WHO IS WHO ON A SHARED LINK — the question asked out loud during field
// testing. This id decides which vote in a group belongs to whom, which meals
// count toward whose fairness debt, and which device an analytics event came
// from. Getting it wrong merges two people into one, or splits one across two.

const withCookie = (value?: string) => {
  const req = new NextRequest("https://fnm.app/api/group");
  if (value !== undefined) req.cookies.set("fnm_member", value);
  return req;
};

describe("identifying a device", () => {
  it("mints an id when there is no cookie", () => {
    const { id, isNew } = memberIdFrom(withCookie());
    expect(isNew).toBe(true);
    expect(id.length).toBeGreaterThanOrEqual(16);
  });

  it("keeps the same id across requests", () => {
    /* THE WHOLE POINT. If this ever returned a fresh id for a returning
       browser, every group member would be a stranger on every poll, the
       fairness ledger would never accumulate, and retention would read as
       zero forever. */
    const existing = "abc123def456ghi789jk";
    const { id, isNew } = memberIdFrom(withCookie(existing));
    expect(id).toBe(existing);
    expect(isNew).toBe(false);
  });

  it("mints ids that satisfy its own reuse test", () => {
    // A generator that produced ids the validator rejects would silently mint
    // a new identity on every single request.
    for (let i = 0; i < 200; i += 1) {
      const { id } = memberIdFrom(withCookie());
      expect(memberIdFrom(withCookie(id))).toEqual({ id, isNew: false });
    }
  });

  it("mints a different id each time", () => {
    // Two colleagues opening the same link must not become the same voter.
    const ids = new Set(Array.from({ length: 300 }, () => memberIdFrom(withCookie()).id));
    expect(ids.size).toBe(300);
  });

  it("rejects a tampered or malformed cookie and mints a fresh one", () => {
    /* The cookie is httpOnly but arrives over the wire, so it is untrusted
       input. Anything that is not the expected shape has to be replaced, not
       trusted — an attacker-chosen id would otherwise let someone impersonate
       another member of a group they hold the link to. */
    for (const bad of ["", "short", "UPPERCASE1234567890", "has-dashes-1234567", "a".repeat(64), "../../etc", "{}"]) {
      const { isNew } = memberIdFrom(withCookie(bad));
      expect(isNew, `should reject: ${bad}`).toBe(true);
    }
  });

  it("accepts ids at both ends of the allowed length", () => {
    expect(memberIdFrom(withCookie("a".repeat(16))).isNew).toBe(false);
    expect(memberIdFrom(withCookie("a".repeat(32))).isNew).toBe(false);
    expect(memberIdFrom(withCookie("a".repeat(15))).isNew).toBe(true);
    expect(memberIdFrom(withCookie("a".repeat(33))).isNew).toBe(true);
  });

  it("carries no personal data", () => {
    // "It identifies a DEVICE, not a person" is a documented privacy promise,
    // and the analytics table leans on it. Lowercase alphanumerics only.
    const { id } = memberIdFrom(withCookie());
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("persisting it", () => {
  const cookieOf = (res: NextResponse) => res.cookies.get("fnm_member");

  it("sets the cookie the reader looks for", () => {
    const res = NextResponse.json({});
    setMemberCookie(res, "abc123def456ghi789jk");
    expect(cookieOf(res)?.value).toBe("abc123def456ghi789jk");
  });

  it("keeps it out of reach of scripts", () => {
    // httpOnly is what stops a stray script reading the id that identifies
    // someone's group membership.
    const res = NextResponse.json({});
    setMemberCookie(res, "abc123def456ghi789jk");
    expect(cookieOf(res)?.httpOnly).toBe(true);
  });

  it("survives the cross-site navigation a shared link actually is", () => {
    /* sameSite must not be "strict": the link arrives from WhatsApp or Slack,
       and a strict cookie is withheld on that first cross-site navigation —
       so the joiner would be minted a NEW id on arrival and the host would
       see a stranger. */
    const res = NextResponse.json({});
    setMemberCookie(res, "abc123def456ghi789jk");
    expect(cookieOf(res)?.sameSite).toBe("lax");
  });

  it("outlives a single lunch", () => {
    // Fairness rotation is measured over weeks; a session cookie would reset
    // the ledger every time the browser closed.
    const res = NextResponse.json({});
    setMemberCookie(res, "abc123def456ghi789jk");
    expect(cookieOf(res)?.maxAge ?? 0).toBeGreaterThan(30 * 24 * 60 * 60);
  });

  it("applies to the whole app, not just one route", () => {
    const res = NextResponse.json({});
    setMemberCookie(res, "abc123def456ghi789jk");
    expect(cookieOf(res)?.path).toBe("/");
  });
});
