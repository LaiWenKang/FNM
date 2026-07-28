import { NextRequest, NextResponse } from "next/server";

// WHO IS WHO ON A SHARED LINK.
//
// The question was asked directly during field testing — "when my friend clicks
// the link, how does it know who is who?" — and this is the answer. Every
// browser that touches the app gets one opaque random id in an httpOnly cookie.
// It is not an account, it identifies a DEVICE, and it carries no personal
// data: the display name is whatever the person types when they join, and it
// never leaves the group they typed it into.
//
// Deliberately separate from the auth session. Group members must be
// identifiable WITHOUT signing in, because requiring six people to authenticate
// before lunch defeats the entire point of a link you can forward.

const COOKIE = "fnm_member";
const MAX_AGE = 60 * 60 * 24 * 180;

export function memberIdFrom(req: NextRequest): { id: string; isNew: boolean } {
  const existing = req.cookies.get(COOKIE)?.value;
  if (existing && /^[a-z0-9]{16,32}$/.test(existing)) return { id: existing, isNew: false };
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
  return { id, isNew: true };
}

export function setMemberCookie(res: NextResponse, id: string): void {
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
