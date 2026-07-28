import { Place, SEED_PLACES } from "@/lib/data/seed";
import { FlavorVector, vec } from "@/lib/flavor";

// Candidate pool = curated catalog (tier 1) + live Google Places (tier 2).
//
// Google has no dish-level or flavour data — it will never tell you that the
// bak chor mee is worth ordering dry with extra vinegar. What it does have, and
// what the curated catalogue never will, is COVERAGE and a real quality signal.
// So the two tiers do different jobs and the app says which one it is using:
//
//   CURATED   dish-level. A named dish, a price, a flavour vector per dish.
//   GOOGLE    restaurant-level. A flavour estimate from the place's types, and
//             a real crowd rating. `dishes` is empty and the card says so
//             rather than inventing a dish nobody ordered.

/* ── TYPE → FLAVOUR ────────────────────────────────────────────────────────
   Keyed on Google's own place types. Matching runs over the WHOLE `types`
   array rather than `primaryType` alone: Google frequently returns
   primaryType "restaurant" with the useful signal sitting third in the list,
   and keying on the primary alone gave every one of those the neutral vector —
   which meant they all scored identically on palate and the ranking was pure
   distance. Contributions from every matching type are averaged. */
const TYPE_FLAVOR: Record<string, Partial<FlavorVector>> = {
  // ── regional
  chinese_restaurant: { heat: 0.4, rich: 0.55 },
  cantonese_restaurant: { heat: 0.15, soupy: 0.55, rich: 0.5 },
  sichuan_restaurant: { heat: 0.92, rich: 0.7, adventure: 0.6 },
  japanese_restaurant: { heat: 0.1, rich: 0.35, adventure: 0.45 },
  sushi_restaurant: { heat: 0.1, rich: 0.3, adventure: 0.6, fried: 0.05 },
  ramen_restaurant: { soupy: 0.9, rich: 0.75, heat: 0.3 },
  korean_restaurant: { heat: 0.6, rich: 0.7, adventure: 0.45 },
  thai_restaurant: { heat: 0.75, sweet: 0.55, soupy: 0.5 },
  vietnamese_restaurant: { soupy: 0.7, heat: 0.4, rich: 0.3 },
  indian_restaurant: { heat: 0.7, rich: 0.7 },
  indonesian_restaurant: { heat: 0.7, rich: 0.7, fried: 0.5 },
  mexican_restaurant: { heat: 0.7, rich: 0.6, adventure: 0.4 },
  italian_restaurant: { heat: 0.15, rich: 0.6, adventure: 0.3 },
  french_restaurant: { heat: 0.1, rich: 0.75, adventure: 0.5 },
  greek_restaurant: { heat: 0.2, rich: 0.5, adventure: 0.35 },
  spanish_restaurant: { heat: 0.3, rich: 0.6, adventure: 0.5 },
  middle_eastern_restaurant: { heat: 0.35, rich: 0.6, adventure: 0.4 },
  lebanese_restaurant: { heat: 0.3, rich: 0.55, adventure: 0.4 },
  turkish_restaurant: { heat: 0.4, rich: 0.6, adventure: 0.4 },
  american_restaurant: { fried: 0.7, rich: 0.65, adventure: 0.1 },
  brazilian_restaurant: { rich: 0.75, adventure: 0.45 },
  // ── format
  hamburger_restaurant: { fried: 0.8, rich: 0.65, adventure: 0.05 },
  pizza_restaurant: { rich: 0.7, fried: 0.2, adventure: 0.1 },
  sandwich_shop: { rich: 0.35, fried: 0.2, adventure: 0.15 },
  fast_food_restaurant: { fried: 0.8, rich: 0.6, adventure: 0.05 },
  barbecue_restaurant: { rich: 0.8, heat: 0.35, adventure: 0.3 },
  steak_house: { rich: 0.85, adventure: 0.25 },
  seafood_restaurant: { soupy: 0.5, rich: 0.5, adventure: 0.45 },
  buffet_restaurant: { rich: 0.6, adventure: 0.3 },
  fine_dining_restaurant: { rich: 0.7, adventure: 0.7 },
  vegetarian_restaurant: { rich: 0.2, fried: 0.15, adventure: 0.3 },
  vegan_restaurant: { rich: 0.15, fried: 0.1, adventure: 0.35 },
  breakfast_restaurant: { rich: 0.4, fried: 0.4, sweet: 0.35 },
  brunch_restaurant: { rich: 0.45, fried: 0.35, sweet: 0.4 },
  bakery: { sweet: 0.8, rich: 0.5, heat: 0.02 },
  dessert_shop: { sweet: 0.95, rich: 0.6, heat: 0.02 },
  ice_cream_shop: { sweet: 0.95, rich: 0.5, heat: 0.02 },
  juice_shop: { sweet: 0.6, rich: 0.1, heat: 0.02 },
  cafe: { sweet: 0.5, rich: 0.4 },
  coffee_shop: { sweet: 0.45, rich: 0.35 },
  bar: { rich: 0.5, fried: 0.5, adventure: 0.3 },
  pub: { fried: 0.65, rich: 0.6, adventure: 0.2 },
  meal_takeaway: { fried: 0.5, rich: 0.5 },
  deli: { rich: 0.5, adventure: 0.25 },
  bagel_shop: { rich: 0.4, sweet: 0.3 },
  donut_shop: { sweet: 0.9, fried: 0.7, rich: 0.6 },
};

/** Types that say nothing about flavour and must never seed a vector. */
const USELESS_TYPES = new Set(["restaurant", "food", "point_of_interest", "establishment", "store"]);

/**
 * Average the contributions of every informative type. A place tagged both
 * `ramen_restaurant` and `japanese_restaurant` lands between the two, which is
 * where it actually belongs.
 */
function flavorFromTypes(types: string[]): { flavor: FlavorVector; matched: string[] } {
  const matched = types.filter((t) => !USELESS_TYPES.has(t) && TYPE_FLAVOR[t]);
  if (!matched.length) return { flavor: vec({}), matched: [] };
  const sum: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const t of matched) {
    for (const [dim, v] of Object.entries(TYPE_FLAVOR[t])) {
      sum[dim] = (sum[dim] ?? 0) + (v as number);
      count[dim] = (count[dim] ?? 0) + 1;
    }
  }
  const avg: Record<string, number> = {};
  for (const dim of Object.keys(sum)) avg[dim] = sum[dim] / count[dim];
  return { flavor: vec(avg as Partial<FlavorVector>), matched };
}

/** A human label for the card, derived from the most specific matching type. */
function labelFromTypes(types: string[], primary?: string): string {
  const informative = types.filter((t) => !USELESS_TYPES.has(t));
  const best = (primary && !USELESS_TYPES.has(primary) && primary) || informative[0];
  return best ?? "restaurant";
}

interface GoogleOpeningPoint {
  day?: number;
  hour?: number;
  minute?: number;
}
interface GooglePlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  dineIn?: boolean;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: {
    periods?: Array<{ open?: GoogleOpeningPoint; close?: GoogleOpeningPoint }>;
  };
}

const PRICE_MAP: Record<string, 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * REAL HOURS, where Google gives them. The previous cut wrote every live place
 * as `0 → 24` on the grounds that Google had already filtered to open-now — but
 * the app also renders "closes at" and computes an hours-left figure from these
 * numbers, so a permissive placeholder was being displayed to the user as a
 * fact. Falls back to the placeholder only when the periods are genuinely
 * absent, and `hoursKnown` records which happened.
 */
function hoursFor(
  p: GooglePlace,
  hourSg: number,
): { openHour: number; closeHour: number; hoursKnown: boolean } {
  const periods = p.regularOpeningHours?.periods ?? [];
  for (const period of periods) {
    const o = period.open?.hour;
    const c = period.close?.hour;
    if (typeof o !== "number") continue;
    if (typeof c !== "number") return { openHour: o, closeHour: 24, hoursKnown: true };
    const spansMidnight = c <= o;
    const covers = spansMidnight ? hourSg >= o || hourSg < c : hourSg >= o && hourSg < c;
    if (covers) return { openHour: o, closeHour: c, hoursKnown: true };
  }
  const first = periods[0];
  if (typeof first?.open?.hour === "number" && typeof first?.close?.hour === "number") {
    return { openHour: first.open.hour, closeHour: first.close.hour, hoursKnown: true };
  }
  return { openHour: 0, closeHour: 24, hoursKnown: false };
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.dineIn",
  "places.currentOpeningHours.openNow",
  "places.regularOpeningHours.periods",
].join(",");

async function fetchGooglePlaces(
  lat: number,
  lng: number,
  radiusM: number,
  hourSg: number,
): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ["restaurant"],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
        },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? [])
      .filter((p) => p.location && p.displayName && p.currentOpeningHours?.openNow !== false)
      .map((p) => {
        const types = p.types ?? [];
        const { flavor, matched } = flavorFromTypes(types);
        const { openHour, closeHour, hoursKnown } = hoursFor(p, hourSg);
        return {
          id: `g-${p.id}`,
          name: p.displayName!.text,
          cuisine: labelFromTypes(types, p.primaryType),
          lat: p.location!.latitude,
          lng: p.location!.longitude,
          priceLevel: PRICE_MAP[p.priceLevel ?? ""] ?? 2,
          flavor,
          openHour,
          closeHour,
          // NEVER hardcoded true. Shelter decides whether we recommend a place
          // in the rain, so asserting it without evidence is how the app sends
          // someone into a downpour. `dineIn` is the honest proxy available.
          sheltered: p.dineIn === true,
          dishes: [],
          source: "google" as const,
          rating: typeof p.rating === "number" ? p.rating : null,
          ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
          // Both recorded so the UI can distinguish "no flavour signal" from
          // "flavour estimated", rather than presenting a guess as a reading.
          flavorKnown: matched.length > 0,
          hoursKnown,
        } satisfies Place;
      });
  } catch {
    return [];
  }
}

export async function getCandidatePlaces(
  lat: number,
  lng: number,
  maxKm: number,
  hourSg: number,
): Promise<Place[]> {
  const google = await fetchGooglePlaces(lat, lng, Math.min(maxKm * 1000, 5000), hourSg);
  const seenNames = new Set(SEED_PLACES.map((p) => p.name.toLowerCase()));
  const merged = [...SEED_PLACES];
  for (const g of google) {
    if (!seenNames.has(g.name.toLowerCase())) merged.push(g);
  }
  return merged;
}
