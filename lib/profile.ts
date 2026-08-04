import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbConfigured, loadProfile, storeProfile, deleteProfile } from "@/lib/db";
import { MAX_RECENT, Profile, defaultProfile } from "@/lib/profile-shape";

// Where a user's taste profile is KEPT. The shape itself lives in
// lib/profile-shape.ts, which has no server dependencies.
//   signed out → httpOnly cookie on the device (nothing leaves the phone)
//   signed in  → Postgres row keyed by account id (follows them across devices)
// See lib/db.ts for the full data-location note.

export type { Profile, RecentMeal } from "@/lib/profile-shape";
export { defaultProfile } from "@/lib/profile-shape";

const COOKIE_NAME = "fnm_profile";

/** The signed-in account id, or null for guests. */
export async function currentUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function readCookieProfile(req: NextRequest): Profile {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return defaultProfile();
  try {
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch {
    return defaultProfile();
  }
}

function writeCookieProfile(res: NextResponse, profile: Profile): void {
  res.cookies.set(COOKIE_NAME, JSON.stringify(profile), {
    httpOnly: true,
    sameSite: "lax",
    // Same rule as the member cookie: over the wire only under TLS. A palate
    // is not a password, but there is no reason to ever send it in the clear.
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

/** Reads the caller's profile from wherever it lives. */
export async function readProfile(req: NextRequest): Promise<Profile> {
  const userId = await currentUserId();
  if (userId && dbConfigured) {
    const stored = await loadProfile(userId);
    // First sign-in on a device: adopt whatever the guest session had learned
    // rather than throwing the user's swipes away.
    if (stored) return { ...defaultProfile(), ...stored };
    const cookieProfile = readCookieProfile(req);
    if (cookieProfile.swipeCount > 0) await storeProfile(userId, cookieProfile);
    return cookieProfile;
  }
  return readCookieProfile(req);
}

/** Persists the profile; always mirrors to the cookie so guests keep working. */
export async function writeProfile(res: NextResponse, profile: Profile): Promise<void> {
  profile.recent = profile.recent.slice(-MAX_RECENT);
  const userId = await currentUserId();
  if (userId && dbConfigured) await storeProfile(userId, profile);
  writeCookieProfile(res, profile);
}

/** Erases the profile from both the database and the device. */
export async function eraseProfile(res: NextResponse): Promise<void> {
  const userId = await currentUserId();
  if (userId && dbConfigured) await deleteProfile(userId);
  writeCookieProfile(res, defaultProfile());
}
