import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbConfigured, loadProfile, storeProfile, deleteProfile } from "@/lib/db";
import { FlavorVector, neutralVector } from "@/lib/flavor";

// A user's taste profile. Storage location depends on sign-in state:
//   signed out → httpOnly cookie on the device (nothing leaves the phone)
//   signed in  → Postgres row keyed by account id (follows them across devices)
// See lib/db.ts for the full data-location note.

export interface RecentMeal {
  placeId: string;
  cuisine: string;
  at: number; // epoch ms
}

export interface Profile {
  vector: FlavorVector;
  swipeCount: number;
  priceMax: 1 | 2 | 3 | 4;
  maxKm: number;
  recent: RecentMeal[];
}

const COOKIE_NAME = "fnm_profile";
const MAX_RECENT = 10;

export function defaultProfile(): Profile {
  return { vector: neutralVector(), swipeCount: 0, priceMax: 3, maxKm: 1.5, recent: [] };
}

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
