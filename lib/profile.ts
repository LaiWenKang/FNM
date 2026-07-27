import { NextRequest, NextResponse } from "next/server";
import { FlavorVector, neutralVector } from "@/lib/flavor";

// Phase 1 stores the taste profile in an httpOnly cookie: zero-config, works on
// Vercel immediately, and each user's data stays on their own device. The
// Postgres upgrade path (accounts, group sessions) is sketched in prisma/schema.prisma.

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

export function readProfile(req: NextRequest): Profile {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return defaultProfile();
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultProfile(), ...parsed };
  } catch {
    return defaultProfile();
  }
}

export function writeProfile(res: NextResponse, profile: Profile): void {
  profile.recent = profile.recent.slice(-MAX_RECENT);
  res.cookies.set(COOKIE_NAME, JSON.stringify(profile), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
