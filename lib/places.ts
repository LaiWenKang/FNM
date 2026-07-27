import { Place, SEED_PLACES } from "@/lib/data/seed";
import { vec } from "@/lib/flavor";

// Candidate pool = curated catalog (tier 1) + optional live Google Places
// results. Google has no dish/flavor data, so live places get a rough flavor
// estimate from their cuisine type — they degrade gracefully to
// restaurant-level recommendations (PLAN.md).

const CUISINE_FLAVOR: Record<string, Partial<Parameters<typeof vec>[0]>> = {
  chinese_restaurant: { heat: 0.4, rich: 0.55 },
  japanese_restaurant: { heat: 0.1, rich: 0.35, adventure: 0.45 },
  korean_restaurant: { heat: 0.6, rich: 0.7 },
  thai_restaurant: { heat: 0.75, sweet: 0.55, soupy: 0.5 },
  indian_restaurant: { heat: 0.7, rich: 0.7 },
  indonesian_restaurant: { heat: 0.7, rich: 0.7 },
  italian_restaurant: { heat: 0.15, rich: 0.6, adventure: 0.3 },
  american_restaurant: { fried: 0.7, rich: 0.65, adventure: 0.1 },
  hamburger_restaurant: { fried: 0.8, rich: 0.65, adventure: 0.05 },
  vegetarian_restaurant: { rich: 0.2, fried: 0.15 },
  seafood_restaurant: { soupy: 0.5, rich: 0.5, adventure: 0.45 },
  ramen_restaurant: { soupy: 0.9, rich: 0.75 },
  vietnamese_restaurant: { soupy: 0.7, heat: 0.4, rich: 0.3 },
};

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
}

const PRICE_MAP: Record<string, 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function fetchGooglePlaces(lat: number, lng: number, radiusM: number): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.primaryType,places.priceLevel,places.currentOpeningHours.openNow",
      },
      body: JSON.stringify({
        includedTypes: ["restaurant"],
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
        },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? [])
      .filter((p) => p.location && p.displayName && p.currentOpeningHours?.openNow !== false)
      .map((p) => ({
        id: `g-${p.id}`,
        name: p.displayName!.text,
        cuisine: p.primaryType ?? "restaurant",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        priceLevel: PRICE_MAP[p.priceLevel ?? ""] ?? 2,
        flavor: vec(CUISINE_FLAVOR[p.primaryType ?? ""] ?? {}),
        // Google already filtered to open-now; use permissive hours so our
        // own open-check passes.
        openHour: 0,
        closeHour: 24,
        sheltered: true,
        dishes: [],
        source: "google" as const,
      }));
  } catch {
    return [];
  }
}

export async function getCandidatePlaces(lat: number, lng: number, maxKm: number): Promise<Place[]> {
  const google = await fetchGooglePlaces(lat, lng, Math.min(maxKm * 1000, 5000));
  const seenNames = new Set(SEED_PLACES.map((p) => p.name.toLowerCase()));
  const merged = [...SEED_PLACES];
  for (const g of google) {
    if (!seenNames.has(g.name.toLowerCase())) merged.push(g);
  }
  return merged;
}
