import { neon } from "@neondatabase/serverless";
import { Dish, Place } from "@/lib/data/seed";
import { DIMS, FlavorVector, vec } from "@/lib/flavor";
import { ask, jsonArray, llmConfigured } from "@/lib/llm";

// ═══ TIER 2 OF THE DISH CATALOGUE ═════════════════════════════════════════
//
// Dish-level picking is the product's whole promise — "Wingstop, and get the
// Mango Habanero" beats "Wingstop" by the entire margin that makes this app
// worth opening. Tier 1 is the hand-curated catalogue, which is dish-level and
// covers 14 places. Google Places covers everywhere and has NO menu data, so
// every live result degraded to restaurant-level and the promise quietly
// evaporated outside the CBD.
//
// This is the bridge: the dishes people actually rave about are sitting in the
// review text, so a language model reads the reviews and extracts them. Which
// model is lib/llm.ts's problem, not this file's.
//
// ── THREE CONSTRAINTS THAT SHAPE THE WHOLE DESIGN ────────────────────────
//
// 1. REVIEWS ARE THE EXPENSIVE SKU. In the Places API, `reviews` sits in the
//    Enterprise + Atmosphere tier — the priciest one. Putting it in the
//    NEARBY SEARCH field mask would bill atmosphere data for all 20 results
//    on every single request, to use at most three of them. So the nearby
//    search stays cheap (see lib/places.ts) and reviews are fetched per place,
//    ONLY for the handful actually being shown.
//
// 2. ONE CALL PER PLACE, EVER. Without a cache this is one Details call plus
//    one model call per place per view — slow, and it would bill the same
//    extraction over and over for a restaurant whose menu changes yearly.
//    Cached in Postgres when configured, in memory otherwise.
//
// 3. IT MUST NEVER BLOCK A RECOMMENDATION. Every failure path here returns
//    the place unchanged. A slow LLM, a rate limit, a bad key, a place with
//    no reviews — all of them degrade to the restaurant-level card that
//    already works, and none of them delay it past the timeout.

const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;

/** Menus move. Six weeks is long enough to be nearly free, short enough to
    not recommend a dish that was taken off the board last season. */
const TTL_MS = 42 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  dishes: Dish[];
  at: number;
}
const memory = new Map<string, CacheEntry>();

/** Drop the in-process cache. Tests only — mirrors clearHealth() and
    clearMemoryLedger(), which exist for the same reason: a module-level cache
    that cannot be reset makes every test after the first one read the
    previous one's answer. */
export function clearDishCache(): void {
  memory.clear();
}

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS place_dishes (
        place_id   TEXT PRIMARY KEY,
        dishes     JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })().catch((e) => {
    // Never cache the rejection - see the note in lib/db.ts ensureSchema.
    ready = null;
    throw e;
  });
  return ready;
}

async function readCache(placeId: string): Promise<Dish[] | null> {
  const hit = memory.get(placeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.dishes;
  if (!sql) return null;
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT dishes, updated_at FROM place_dishes WHERE place_id = ${placeId}
    `) as { dishes: Dish[]; updated_at: string }[];
    const row = rows[0];
    if (!row) return null;
    if (Date.now() - new Date(row.updated_at).getTime() > TTL_MS) return null;
    memory.set(placeId, { dishes: row.dishes, at: Date.now() });
    return row.dishes;
  } catch {
    return null;
  }
}

async function writeCache(placeId: string, dishes: Dish[]): Promise<void> {
  memory.set(placeId, { dishes, at: Date.now() });
  if (!sql) return;
  try {
    await ensureSchema();
    await sql`
      INSERT INTO place_dishes (place_id, dishes, updated_at)
      VALUES (${placeId}, ${JSON.stringify(dishes)}::jsonb, now())
      ON CONFLICT (place_id) DO UPDATE
        SET dishes = EXCLUDED.dishes, updated_at = now()
    `;
  } catch {
    /* a cache miss is not a failure — it just costs one more call next time */
  }
}

/* ── GOOGLE PLACE DETAILS ─────────────────────────────────────────────── */

interface GoogleReview {
  text?: { text?: string };
  rating?: number;
}

async function fetchReviews(googleId: string): Promise<{ reviews: string[]; summary: string | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { reviews: [], summary: null };
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${googleId}`, {
      signal: AbortSignal.timeout(3500),
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "reviews,editorialSummary",
      },
    });
    if (!res.ok) return { reviews: [], summary: null };
    const data = (await res.json()) as {
      reviews?: GoogleReview[];
      editorialSummary?: { text?: string };
    };
    const reviews = (data.reviews ?? [])
      .map((r) => r.text?.text ?? "")
      .filter((t) => t.length > 24)
      // Long reviews are mostly service anecdote; the dish names cluster early.
      .map((t) => t.slice(0, 900));
    return { reviews, summary: data.editorialSummary?.text ?? null };
  } catch {
    return { reviews: [], summary: null };
  }
}

/* ── EXTRACTION ───────────────────────────────────────────────────────── */

const SCHEMA_NOTE = DIMS.join(", ");

interface RawDish {
  name?: unknown;
  priceSgd?: unknown;
  flavor?: Record<string, unknown>;
}

function coerce(raw: RawDish, placeId: string, i: number): Dish | null {
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 48) : "";
  if (name.length < 2) return null;
  const flavor: Record<string, number> = {};
  for (const d of DIMS) {
    const v = raw.flavor?.[d];
    if (typeof v === "number" && Number.isFinite(v)) flavor[d] = Math.max(0, Math.min(1, v));
  }
  // A dish with no usable flavour data is worse than no dish: it would be
  // matched against the user's palate on an all-neutral vector and could
  // outrank a real one.
  if (Object.keys(flavor).length < 3) return null;
  const price = typeof raw.priceSgd === "number" && Number.isFinite(raw.priceSgd)
    ? Math.max(1, Math.min(200, raw.priceSgd))
    : 0;
  return {
    id: `${placeId}-d${i}`,
    name,
    flavor: vec(flavor as Partial<FlavorVector>),
    priceSgd: price,
  };
}

async function extract(place: Place, reviews: string[], summary: string | null): Promise<Dish[]> {
  if (!reviews.length && !summary) return [];

  const reply = await ask({
    maxTokens: 900,
    system:
      "You extract signature dishes from restaurant reviews. Return ONLY a JSON array, no prose. " +
      "Each element: {name, priceSgd, flavor:{" + SCHEMA_NOTE + "}}. " +
      "Each flavor value is 0..1. heat=chilli/spice, sweet=sweetness, soupy=broth or liquid content, " +
      "fried=deep-fried or crispy, rich=fat/heaviness, adventure=how unusual it is to a mainstream palate. " +
      "Include at most 3 dishes, and ONLY dishes actually named by reviewers as worth ordering — " +
      "never invent a plausible menu item, and never include a dish you are not confident the place serves. " +
      "priceSgd is a Singapore-dollar estimate; use 0 if reviews give no basis for one. " +
      "If the reviews name no specific dish, return [].",
    user: JSON.stringify({
      place: place.name,
      cuisine: place.cuisine,
      priceLevel: place.priceLevel,
      editorialSummary: summary,
      reviews,
    }),
  });

  const parsed = jsonArray<RawDish>(reply);
  if (!parsed) return [];
  return parsed
    .slice(0, 3)
    .map((r, i) => coerce(r, place.id, i))
    .filter((d): d is Dish => d !== null);
}

/**
 * Enrich ONE place with mined dishes. Returns the place unchanged on every
 * failure path — this is an upgrade to a card that already works, never a
 * dependency of it.
 *
 * The place's aggregate `flavor` is also replaced by the mean of the mined
 * dishes when we get them, which is a real improvement over the coarse
 * type-based estimate: it only lands on the NEXT request for that place (this
 * one is already ranked), so the catalogue quietly sharpens as it is used.
 */
export async function withMinedDishes(place: Place): Promise<Place> {
  if (place.source !== "google" || place.dishes.length > 0) return place;
  const googleId = place.id.startsWith("g-") ? place.id.slice(2) : place.id;

  const cached = await readCache(place.id);
  if (cached) return applyDishes(place, cached);

  const { reviews, summary } = await fetchReviews(googleId);
  const dishes = await extract(place, reviews, summary);
  // Cache the empty result too. A place whose reviews name no dish will still
  // name none tomorrow, and re-asking every view is the expensive mistake.
  await writeCache(place.id, dishes);
  return applyDishes(place, dishes);
}

function applyDishes(place: Place, dishes: Dish[]): Place {
  if (!dishes.length) return place;
  const flavor = vec({});
  for (const d of DIMS) {
    flavor[d] = dishes.reduce((sum, dish) => sum + dish.flavor[d], 0) / dishes.length;
  }
  return { ...place, dishes, flavor, flavorKnown: true };
}

/** Enrich several places concurrently, bounded so one slow call cannot hold
    up a page. Anything still outstanding when the budget expires simply stays
    restaurant-level. */
export async function enrichPicks(places: Place[], budgetMs = 6000): Promise<Place[]> {
  // No model configured means no dishes to mine — skip the Google Details
  // calls too, which are the expensive half of this path.
  if (!llmConfigured()) return places;
  const work = places.map((p) => withMinedDishes(p).catch(() => p));
  const timeout = new Promise<Place[]>((resolve) => setTimeout(() => resolve(places), budgetMs));
  return Promise.race([Promise.all(work), timeout]);
}
