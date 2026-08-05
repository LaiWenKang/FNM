import { cuisineFromGoogle } from "@/lib/cuisine";
import { Place, SEED_PLACES } from "@/lib/data/seed";
import { FlavorVector, vec } from "@/lib/flavor";
import { classify, noteFault, noteOk } from "@/lib/health";

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
  // ── the gaps, and the first one is the expensive gap
  // Google tags Singapore's hawker centres `food_court`. Without an entry the
  // most characteristic eating place in the country scored a neutral vector
  // and was marked flavour-unknown — in a country where it is most of lunch.
  food_court: { heat: 0.45, rich: 0.55, fried: 0.5, adventure: 0.3 },
  asian_restaurant: { heat: 0.45, rich: 0.55, adventure: 0.35 },
  malaysian_restaurant: { heat: 0.65, rich: 0.65, fried: 0.45 },
  singaporean_restaurant: { heat: 0.5, rich: 0.6, fried: 0.45 },
  dim_sum_restaurant: { heat: 0.15, rich: 0.5, fried: 0.35, adventure: 0.35 },
  hot_pot_restaurant: { soupy: 0.9, heat: 0.65, rich: 0.6, adventure: 0.45 },
  mediterranean_restaurant: { heat: 0.25, rich: 0.5, adventure: 0.35 },
  african_restaurant: { heat: 0.5, rich: 0.6, adventure: 0.6 },
  afghani_restaurant: { heat: 0.4, rich: 0.65, adventure: 0.5 },
  ramen_shop: { soupy: 0.9, rich: 0.75, heat: 0.3 },
  noodle_shop: { soupy: 0.6, rich: 0.5 },
  diner: { fried: 0.7, rich: 0.65, sweet: 0.4, adventure: 0.1 },
  bar_and_grill: { fried: 0.65, rich: 0.7, adventure: 0.2 },
  wine_bar: { rich: 0.55, adventure: 0.45 },
  dessert_restaurant: { sweet: 0.92, rich: 0.6, heat: 0.02 },
  tea_house: { sweet: 0.6, rich: 0.3 },
  acai_shop: { sweet: 0.65, rich: 0.2, fried: 0.05 },
  candy_store: { sweet: 0.98, rich: 0.35, heat: 0.02 },
  confectionery: { sweet: 0.95, rich: 0.55, heat: 0.02 },
  chocolate_shop: { sweet: 0.92, rich: 0.75, heat: 0.02 },
  bubble_tea_shop: { sweet: 0.85, rich: 0.45 },
};

/* ── PLACES NOBODY CAN WALK INTO ──────────────────────────────────────────
   Production returned "InstaChef at Grande Vista (Restricted Access)" as the
   TOP PICK: a caterer inside a private development, with zero ratings. Google
   tags it a restaurant because it is one; it is simply not one this user can
   enter. Recommending it is a total failure of the product's only job.

   Name-matched rather than type-matched because Google has no "is this open to
   the public" field — but operators reliably say so in the name, precisely so
   that people do not turn up. Kept deliberately narrow: these are phrases that
   only appear when access really is restricted. */
const INACCESSIBLE = [
  /\(\s*restricted\s+access\s*\)/i,
  /\brestricted\s+access\b/i,
  /\bstaff\s+(only|canteen)\b/i,
  /\bemployees?\s+only\b/i,
  /\bprivate\s+(club|members?)\b/i,
  /\bmembers?\s+only\b/i,
  /\bcrew\s+(mess|canteen)\b/i,
];

function isReachable(name: string): boolean {
  return !INACCESSIBLE.some((re) => re.test(name));
}

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

/* ── TWO WAYS TO ASK GOOGLE, AND MISSING THE SECOND IS WHY THIS LOOKED DUMB ──
   searchNearby answers "what restaurants are close to me". That is the right
   question for "Eat now" and completely the wrong one for "spicy soup":
   somebody who types a craving has said in words what they want, and feeding
   that to a proximity search threw the words away and re-ranked the twenty
   nearest doors instead. It is precisely why a plain Google search beat this
   app at its own job — Google was running a TEXT search across names,
   categories and reviews, and we were not running one at all.

   searchText is the same request Google itself answers with. It runs ONLY when
   there is something to search for, so the ordinary "Eat now" path still costs
   exactly one nearby call and nothing changes for it. */

/** Null means the REQUEST failed — distinct from an honestly empty street, so
    the cache above never remembers an outage as a fact about the area. */
async function placesRequest(
  endpoint: "searchNearby" | "searchText",
  body: Record<string, unknown>,
  hourSg: number,
): Promise<Place[] | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    /* ONE LINE, TWO COMPLETELY DIFFERENT MEANINGS. This used to be a bare
       `if (!res.ok) return []`, which made a 403 from a key restricted to the
       wrong API — the single most likely way to misconfigure this — render as
       "there are no restaurants near you". The app then quietly served the
       seed catalogue and looked like it was working. */
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      /* THE BODY IS PASSED IN, NOT JUST THE STATUS. Google answers an invalid
         Places key with 400 — not 401 or 403 — so classifying on the code
         alone filed the single most likely misconfiguration in this app under
         "unknown", while the identical message from the model path was
         correctly read as an auth failure. The reason is in the prose. */
      noteFault("places", classify(body, res.status), `${res.status} ${body}`);
      return null;
    }
    const data = (await res.json()) as { places?: GooglePlace[] };
    noteOk("places");
    return (data.places ?? [])
      .filter(
        (p) =>
          p.location &&
          p.displayName &&
          p.currentOpeningHours?.openNow !== false &&
          isReachable(p.displayName.text),
      )
      .map((p) => {
        const types = p.types ?? [];
        const { flavor, matched } = flavorFromTypes(types);
        const { openHour, closeHour, hoursKnown } = hoursFor(p, hourSg);
        return {
          id: `g-${p.id}`,
          name: p.displayName!.text,
          // CANONICAL, not the raw Google type. `japanese_restaurant` matched
          // nothing a curated place used, so live results shared no category
          // with the catalogue: the repeat penalty never fired across tiers
          // and every live place fell through the glyph table.
          cuisine: cuisineFromGoogle(types, p.primaryType),
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
  } catch (e) {
    // Nearly always the 4-second AbortSignal above. Worth distinguishing from
    // a rejection: one means the network is slow, the other means the key is
    // dead, and they call for opposite reactions.
    noteFault("places", classify(e), e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** "What's near me" — the pool for an ordinary pick with nothing asked for. */
async function fetchGooglePlaces(
  lat: number,
  lng: number,
  radiusM: number,
  hourSg: number,
): Promise<Place[] | null> {
  return placesRequest(
    "searchNearby",
    {
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
      },
    },
    hourSg,
  );
}

/**
 * "Who near me serves THIS" — the search the app was missing.
 *
 * locationBias, deliberately, not locationRestriction: a restriction makes
 * Google return nothing at all when the street genuinely has no spicy soup,
 * and an empty answer is worse than a near-miss the scorer can rank down.
 * The distance filter still applies afterwards, so a bias cannot smuggle in
 * somewhere across the island.
 */
async function fetchGoogleByText(
  query: string,
  lat: number,
  lng: number,
  radiusM: number,
  hourSg: number,
): Promise<Place[] | null> {
  return placesRequest(
    "searchText",
    {
      textQuery: query.slice(0, 120),
      maxResultCount: 20,
      includedType: "restaurant",
      openNow: true,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
      },
    },
    hourSg,
  );
}

/**
 * A place you saved from a video, converted into a real candidate.
 *
 * These carry `wantToTry`, which the scorer treats as a strong boost: you
 * already decided you wanted this — the app's job is to notice when you are
 * finally standing near it, which is the entire reason the saved list exists
 * rather than being a bookmark folder you never reopen.
 */
export function placeFromSaved(saved: {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating: number | null;
  ratingCount: number;
}, dishName: string | null): Place {
  return {
    id: saved.placeId,
    name: saved.name,
    cuisine: "restaurant",
    lat: saved.lat,
    lng: saved.lng,
    priceLevel: 2,
    flavor: vec({}),
    // Hours are unknown for a saved place, and pretending otherwise would
    // filter it out of exactly the meal it was saved for.
    openHour: 0,
    closeHour: 24,
    sheltered: false,
    dishes: [],
    source: "google",
    rating: saved.rating,
    ratingCount: saved.ratingCount,
    flavorKnown: false,
    hoursKnown: false,
    wantToTry: true,
    savedDish: dishName,
  };
}

/* ── A SHORT MEMORY FOR THE NEARBY SEARCH ─────────────────────────────────
   Two people at the same MRT exit, or one person tapping "not feeling it"
   four times, used to cost four identical paid searches inside a minute. Two
   minutes is short enough that "open now" stays honest and long enough to
   absorb both the tap-loop and the cheap version of a cost attack.

   The cache hands back CLONES, never its own objects: the recommend route
   marks pool entries with wantToTry from the requester's saved list, and a
   shared object would leak one device's bookmarks into a stranger's ranking. */
const NEARBY_TTL_MS = 2 * 60_000;
const MAX_NEARBY_ENTRIES = 500;
const nearbyCache = new Map<string, { at: number; places: Place[] }>();

/** Tests only — mirrors the other module-level caches in this codebase. */
export function clearNearbyCache(): void {
  nearbyCache.clear();
}

const clone = (p: Place): Place => ({ ...p, flavor: { ...p.flavor }, dishes: [...p.dishes] });

/** One cache for both search modes. `query` is part of the key, so a craving
    search can never be served the generic nearby pool, or vice versa. */
async function cachedGooglePlaces(
  lat: number,
  lng: number,
  radiusM: number,
  hourSg: number,
  query = "",
): Promise<Place[]> {
  // ~110 m grid: close enough that the walk-times stay truthful, coarse
  // enough that a GPS jitter does not defeat the cache.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusM},${hourSg},${query}`;
  const hit = nearbyCache.get(key);
  if (hit && Date.now() - hit.at < NEARBY_TTL_MS) return hit.places.map(clone);

  const fetched = query
    ? await fetchGoogleByText(query, lat, lng, radiusM, hourSg)
    : await fetchGooglePlaces(lat, lng, radiusM, hourSg);
  // Only a real answer is worth remembering. A null is a timeout or a dead
  // key, and caching it would pin "no restaurants exist" on a healthy street
  // for two minutes; a genuinely empty street IS worth remembering.
  if (fetched === null) return [];
  nearbyCache.set(key, { at: Date.now(), places: fetched.map(clone) });
  if (nearbyCache.size > MAX_NEARBY_ENTRIES) {
    for (const k of nearbyCache.keys()) {
      nearbyCache.delete(k);
      if (nearbyCache.size <= MAX_NEARBY_ENTRIES) break;
    }
  }
  return fetched;
}

/**
 * The candidate pool. When the diner said what they want, ASK GOOGLE FOR IT —
 * the nearby search alone could only ever re-rank the closest twenty doors,
 * which is how "spicy soup" once returned a McDonald's 90 m away.
 *
 * Both sets are merged rather than swapped: the text search knows what you
 * asked for, the nearby search knows what is convenient, and the scorer is
 * what weighs those against each other. Sending only text results would trade
 * one blind spot for another.
 */
export async function getCandidatePlaces(
  lat: number,
  lng: number,
  maxKm: number,
  hourSg: number,
  cravingText = "",
): Promise<Place[]> {
  const radiusM = Math.min(maxKm * 1000, 5000);
  const wanted = cravingText.trim().slice(0, 120);

  const [nearby, matching] = await Promise.all([
    cachedGooglePlaces(lat, lng, radiusM, hourSg),
    // Text search runs only when there is something to search FOR, so an
    // ordinary "Eat now" still costs exactly one call.
    wanted ? cachedGooglePlaces(lat, lng, radiusM, hourSg, wanted) : Promise.resolve([]),
  ]);

  /* GOOGLE'S RANKING IS ITSELF EVIDENCE, and throwing it away was the last
     piece of the same bug. searchText returns results in relevance order, so
     position carries information: the top hit is what Google thinks best
     answers the craving, the twentieth is a stretch. Carried through as a
     decaying 0.8 → 0.4 so the scorer can credit a place for serving the thing
     that was asked for even when its name never says so. */
  const evidenceAt = (i: number, n: number) => 0.8 - 0.4 * (n <= 1 ? 0 : i / (n - 1));
  const credited = matching.map((p, i) => ({ ...p, cravingEvidence: evidenceAt(i, matching.length) }));

  const merged = [...SEED_PLACES];
  // Names dedupe against the CURATED catalogue only — a curated entry carries
  // real dish data a live duplicate would lose. Among live results the key is
  // the id, because the two searches return the same place with the same id,
  // while two branches of one chain are genuinely different places that share
  // a name and must both survive.
  const seedNames = new Set(SEED_PLACES.map((p) => p.name.toLowerCase()));
  const seenIds = new Set<string>();
  // Craving matches first: where both searches returned the same place, the
  // record fetched FOR the craving is the one worth keeping — it is the only
  // one of the two carrying the evidence.
  for (const g of [...credited, ...nearby]) {
    if (seedNames.has(g.name.toLowerCase()) || seenIds.has(g.id)) continue;
    seenIds.add(g.id);
    merged.push(g);
  }
  return merged;
}
