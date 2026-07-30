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
  /** The dish's flavour, kept so a later verdict has something to learn FROM. */
  flavor?: FlavorVector;
  /** What the diner said afterwards. Undefined until they are asked. */
  verdict?: Verdict;
}

/**
 * THE ONLY SIGNAL THAT COMES FROM AFTER THE MEAL.
 *
 * Everything else the app learns from is a prediction: a swipe says what you
 * think you like, a pick says what looked best at 12:15. Neither knows how the
 * food actually was. "Again" is the strongest evidence this app can collect —
 * you went, you ate, you would repeat it — and until now it was never asked
 * for, so it was never collected.
 */
export type Verdict = "again" | "fine" | "no";

export interface Profile {
  vector: FlavorVector;
  swipeCount: number;
  priceMax: 1 | 2 | 3 | 4;
  maxKm: number;
  recent: RecentMeal[];
}

export const MAX_RECENT = 10;

/* ── WHEN TO ASK "HOW WAS IT?" ────────────────────────────────────────────
   A window with two edges, and both matter. Ask too soon and they are still
   holding the fork; ask too late and they are guessing, which is worse than
   not asking — a fabricated verdict would move the palate on evidence that
   never existed. */
/** Long enough to have eaten. */
export const ASK_AFTER_MS = 90 * 60 * 1000;
/** Short enough to still remember. */
export const ASK_UNTIL_MS = 3 * 24 * 60 * 60 * 1000;

export function defaultProfile(): Profile {
  return { vector: neutralVector(), swipeCount: 0, priceMax: 3, maxKm: 1.5, recent: [] };
}
