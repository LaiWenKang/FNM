import { FlavorVector, neutralVector } from "@/lib/flavor";

// THE PROFILE'S SHAPE, SEPARATED FROM ITS PLUMBING.
//
// This used to live in lib/profile.ts alongside the cookie and Postgres code,
// which meant that importing the TYPE dragged in next-auth and the database
// driver — so the pure scoring maths could not be unit-tested without booting
// half the server. The data shape has no business depending on where the data
// happens to be kept.

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

export const MAX_RECENT = 10;

export function defaultProfile(): Profile {
  return { vector: neutralVector(), swipeCount: 0, priceMax: 3, maxKm: 1.5, recent: [] };
}
