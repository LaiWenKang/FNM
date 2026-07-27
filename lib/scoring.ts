import { Context } from "@/lib/context";
import { Dish, Place } from "@/lib/data/seed";
import { FlavorVector, similarity } from "@/lib/flavor";
import { Profile } from "@/lib/profile";

// The recommendation pipeline from PLAN.md:
//   HARD FILTERS -> SCORE (flavor match + context nudges - recency penalty)
//   -> DIVERSIFY (best / safer / adventurous) -> DISH PICK

export interface ScoredPlace {
  place: Place;
  score: number;
  distanceKm: number;
  walkMinutes: number;
  bestDish: Dish | null;
  reasons: string[];
}

export interface Recommendation {
  best: ScoredPlace;
  safer: ScoredPlace | null;
  adventurous: ScoredPlace | null;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isOpen(place: Place, hourSg: number): boolean {
  if (place.closeHour > place.openHour) {
    return hourSg >= place.openHour && hourSg < place.closeHour;
  }
  // Overnight hours (e.g. 17 -> 2)
  return hourSg >= place.openHour || hourSg < place.closeHour;
}

/** Weather and time-of-day nudges applied to the flavor-match score. */
function contextFit(place: Place, ctx: Context): { delta: number; reasons: string[] } {
  let delta = 0;
  const reasons: string[] = [];
  if (ctx.raining) {
    if (place.flavor.soupy > 0.6) {
      delta += 0.12;
      reasons.push("it's raining — something warm and soupy fits");
    }
    if (place.sheltered) {
      delta += 0.05;
      reasons.push("sheltered from the rain");
    } else {
      delta -= 0.1;
    }
  } else if (ctx.forecast && !ctx.raining && ctx.hourSg >= 12 && ctx.hourSg <= 16) {
    if (place.flavor.rich < 0.35 && place.flavor.fried < 0.3) {
      delta += 0.06;
      reasons.push("light option for a hot afternoon");
    }
  }
  if (ctx.mealPeriod === "breakfast" && place.flavor.rich > 0.7) delta -= 0.08;
  return { delta, reasons };
}

function recencyPenalty(place: Place, profile: Profile, now: number): { delta: number; reasons: string[] } {
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
  let delta = 0;
  const reasons: string[] = [];
  for (const meal of profile.recent) {
    const age = now - meal.at;
    if (meal.placeId === place.id && age < FIVE_DAYS) delta -= 0.3;
    else if (meal.cuisine === place.cuisine && age < TWO_DAYS) delta -= 0.12;
  }
  if (delta === 0 && profile.recent.length > 0) {
    reasons.push("you haven't had this recently");
  }
  return { delta, reasons };
}

function pickBestDish(place: Place, taste: FlavorVector): Dish | null {
  if (!place.dishes.length) return null;
  let best = place.dishes[0];
  let bestSim = -1;
  for (const d of place.dishes) {
    const s = similarity(taste, d.flavor);
    if (s > bestSim) {
      bestSim = s;
      best = d;
    }
  }
  return best;
}

export function recommend(
  profile: Profile,
  places: Place[],
  ctx: Context,
  origin: { lat: number; lng: number },
  excludeIds: string[] = [],
): Recommendation | null {
  const now = Date.now();
  const excluded = new Set(excludeIds);

  const scored: ScoredPlace[] = [];
  for (const place of places) {
    if (excluded.has(place.id)) continue;
    const distanceKm = haversineKm(origin.lat, origin.lng, place.lat, place.lng);
    // Hard filters: open now, within travel limit, within budget.
    if (!isOpen(place, ctx.hourSg)) continue;
    if (distanceKm > profile.maxKm) continue;
    if (place.priceLevel > profile.priceMax) continue;

    const flavorMatch = similarity(profile.vector, place.flavor);
    const cf = contextFit(place, ctx);
    const rp = recencyPenalty(place, profile, now);
    const score = flavorMatch + cf.delta + rp.delta - distanceKm * 0.04;

    const reasons = [
      `matches your taste (${Math.round(flavorMatch * 100)}% flavor fit)`,
      ...cf.reasons,
      ...rp.reasons,
    ];
    scored.push({
      place,
      score,
      distanceKm,
      walkMinutes: Math.max(1, Math.round((distanceKm / 4.5) * 60)),
      bestDish: pickBestDish(place, profile.vector),
      reasons,
    });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const rest = scored.slice(1);
  // Safer = strong score with lower adventure than the user's comfort ceiling;
  // adventurous = strong score that stretches beyond it.
  const safer =
    rest.find((s) => s.place.flavor.adventure <= profile.vector.adventure) ?? rest[0] ?? null;
  const adventurous =
    rest.find(
      (s) => s !== safer && s.place.flavor.adventure > profile.vector.adventure + 0.1,
    ) ?? rest.find((s) => s !== safer) ?? null;

  return { best, safer, adventurous };
}
