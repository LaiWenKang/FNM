import { neon } from "@neondatabase/serverless";
import { Place } from "@/lib/data/seed";
import { CUISINES, Cuisine, isCuisine } from "@/lib/cuisine";
import { DIMS, FlavorVector, vec } from "@/lib/flavor";
import { isFailing } from "@/lib/health";
import { ask, jsonObject, llmConfigured } from "@/lib/llm";

// ═══ THE TABLE COVERS A THIRD OF REALITY ══════════════════════════════════
//
// `TYPE_FLAVOR` and `FROM_GOOGLE` map Google's place types onto this app's
// flavour space and cuisine vocabulary. They are hand-maintained, and measured
// against production across eight areas of the island they miss most of what
// comes back: NINE OF FOURTEEN live picks had no flavour data, and the same
// nine fell through to the generic cuisine "restaurant". Google simply tags a
// great many Singapore places `restaurant` / `food` / `establishment` and
// nothing more.
//
// THAT IS NOT COSMETIC, and the second consequence is worse than the first:
//
//   · The palate term scores those places against a flavour ESTIMATE that
//     carries no information — two thirds of the candidate pool ranked on a
//     shrug.
//   · lib/scoring.ts compares `meal.cuisine === place.cuisine` for the repeat
//     penalty. Every place that fell through shares the string "restaurant",
//     so eating Indian on Monday makes an unrelated Japanese place on Tuesday
//     look like the SAME CUISINE and take a repeat knock it never earned.
//
// A restaurant's NAME is the signal the table cannot read. "Qiu Lian Ban Mian"
// says Teochew, soupy, mild to anyone who has eaten in Singapore, and says
// nothing whatsoever to a type-code lookup. That is the shape of problem a
// model is good at and a table is not — the same trade already made for
// craving parsing, dish mining and caption reading.
//
// THE TABLE STAYS IN FRONT. It is free, instant, deterministic and right when
// it fires; this runs only for the places it could not answer, and the answer
// is cached per place so a given restaurant is asked about once, ever.
//
// A CLOSED VOCABULARY, NOT FREE TEXT. The model picks a cuisine from the list
// this app already uses rather than inventing one, because a cuisine that is
// not in `CUISINES` has no family, breaks the repeat penalty in a new way and
// falls through the glyph table — which is the exact bug being fixed here,
// recreated one layer up.

const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;

/** A cuisine is a fact about a restaurant, not a menu. It does not go stale
    the way a dish does, so this cache is far longer-lived than the dish one. */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface Enrichment {
  /** Always one of the app's own cuisines — never free text from a model. */
  cuisine: Cuisine;
  flavor: FlavorVector;
}

interface CacheEntry {
  value: Enrichment | null;
  at: number;
}
const memory = new Map<string, CacheEntry>();

/** Tests only — mirrors clearDishCache/clearHealth for the same reason. */
export function clearEnrichCache(): void {
  memory.clear();
}

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS place_cuisine (
        place_id   TEXT PRIMARY KEY,
        cuisine    TEXT NOT NULL,
        flavor     JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })();
  return ready;
}

async function readCache(placeId: string): Promise<Enrichment | null | undefined> {
  const hit = memory.get(placeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (!sql) return undefined;
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT cuisine, flavor, updated_at FROM place_cuisine WHERE place_id = ${placeId}
    `) as { cuisine: string; flavor: FlavorVector; updated_at: string }[];
    const row = rows[0];
    if (!row) return undefined;
    if (Date.now() - new Date(row.updated_at).getTime() > TTL_MS) return undefined;
    // A row written by an older vocabulary is discarded rather than trusted:
    // a cuisine that no longer exists has no family and no glyph.
    if (!isCuisine(row.cuisine)) return undefined;
    const value = { cuisine: row.cuisine, flavor: row.flavor };
    memory.set(placeId, { value, at: Date.now() });
    return value;
  } catch {
    return undefined;
  }
}

async function writeCache(placeId: string, value: Enrichment | null): Promise<void> {
  // The null is cached too. A place the model could not place will not become
  // placeable tomorrow, and re-asking on every view is the expensive mistake.
  memory.set(placeId, { value, at: Date.now() });
  if (!sql || !value) return;
  try {
    await ensureSchema();
    await sql`
      INSERT INTO place_cuisine (place_id, cuisine, flavor, updated_at)
      VALUES (${placeId}, ${value.cuisine}, ${JSON.stringify(value.flavor)}::jsonb, now())
      ON CONFLICT (place_id)
      DO UPDATE SET cuisine = EXCLUDED.cuisine, flavor = EXCLUDED.flavor, updated_at = now()
    `;
  } catch {
    /* the memory copy still serves this instance */
  }
}

/* Offered to the model WITHOUT the generic bucket: naming it as an option is
   inviting the non-answer, and the validator rejects it anyway. */
const VOCABULARY = Object.keys(CUISINES).filter((c) => c !== "restaurant").join(", ");

interface RawEnrichment {
  cuisine?: unknown;
  flavor?: Record<string, unknown>;
  confident?: unknown;
}

/**
 * Validate a model reply into something the engine can rank on, or null.
 * Pure, so the judgement is testable without a network.
 */
export function coerceEnrichment(raw: RawEnrichment | null): Enrichment | null {
  if (!raw) return null;

  /* AN UNSURE ANSWER IS WORSE THAN NO ANSWER. A guessed cuisine does not sit
     inertly in the record — it feeds the repeat penalty and the glyph, so a
     wrong one actively misranks tomorrow's lunch. Left alone, the place keeps
     `flavorKnown: false` and the card already knows how to say so. */
  if (raw.confident === false) return null;

  const cuisine = typeof raw.cuisine === "string" ? raw.cuisine.trim().toLowerCase() : "";
  // The closed vocabulary, enforced rather than requested. A cuisine outside
  // it has no family and no glyph, which is this bug one layer up.
  if (!isCuisine(cuisine)) return null;
  /* AND NOT THE GENERIC BUCKET. "restaurant" is a real key in CUISINES — it is
     the fallthrough the type table already produces — so accepting it back
     would spend a call to write down what the place already said, and would
     re-create the cuisine collision this module exists to fix. */
  if (cuisine === "restaurant") return null;

  const flavor: Record<string, number> = {};
  for (const d of DIMS) {
    const v = raw.flavor?.[d];
    if (typeof v === "number" && Number.isFinite(v)) flavor[d] = Math.max(0, Math.min(1, v));
  }
  /* THE SAME BAR THE DISH MINER USES. A vector with one or two axes filled is
     mostly neutral padding, and a mostly-neutral vector is exactly the
     uninformative estimate this exists to replace. */
  if (Object.keys(flavor).length < 4) return null;

  return { cuisine, flavor: vec(flavor as Partial<FlavorVector>) };
}

/**
 * Work out what a place actually serves, from its name and whatever types
 * Google did give. Returns null when it cannot say — never a guess.
 */
export async function enrichmentFor(place: Place): Promise<Enrichment | null> {
  const cached = await readCache(place.id);
  if (cached !== undefined) return cached;

  const reply = await ask({
    maxTokens: 300,
    system:
      "You identify what a Singapore restaurant serves, from its name and Google's place types. " +
      `Return ONLY JSON: {"cuisine": one of [${VOCABULARY}], "flavor":{${DIMS.join(",")}}, "confident": true|false}. ` +
      "Every flavor value is 0..1 and ALL SIX are required. " +
      "heat=chilli/spice, sweet=sweetness, soupy=broth or liquid content, fried=deep-fried or crispy, " +
      "rich=fat/heaviness, adventure=how unusual it is to a mainstream Singapore palate. " +
      "Judge the TYPICAL dish someone orders there, not the most extreme item. " +
      "Set confident=false if the name is generic, a chain you do not recognise, or gives no clue " +
      "what is served — a wrong cuisine is worse than none, because it feeds a repeat penalty.",
    user: JSON.stringify({
      name: place.name,
      googleTypes: place.cuisine === "restaurant" ? [] : [place.cuisine],
      priceLevel: place.priceLevel,
    }),
  });

  const value = coerceEnrichment(jsonObject<RawEnrichment>(reply));
  await writeCache(place.id, value);
  return value;
}

/** Apply an enrichment to a place. Pure; leaves the place alone on null. */
export function withEnrichment(place: Place, e: Enrichment | null): Place {
  if (!e) return place;
  return { ...place, cuisine: e.cuisine, flavor: e.flavor, flavorKnown: true };
}

/**
 * Fill in the places the type table could not answer.
 *
 * Bounded by a time budget, exactly like dish mining: anything outstanding
 * when it expires simply keeps its estimate, because a slow vendor must never
 * hold up a hungry person's page.
 */
export async function enrichGenerics(places: Place[], budgetMs = 4000): Promise<Place[]> {
  if (!llmConfigured()) return places;

  /* DON'T PAY FOR A DEAD KEY ON EVERY REQUEST. This is the one enrichment that
     runs over the WHOLE candidate pool, so a revoked credential would mean a
     dozen doomed round-trips per recommendation — each queued, each waited on,
     each logged — taxing every lunch for work that cannot succeed. The health
     tally already knows; consulting it costs nothing and it resets when the
     instance recycles, so a key fixed at noon comes back on its own. */
  if (isFailing("llm")) return places;

  /* ONLY THE ONES THE TABLE MISSED. A curated place has a hand-checked vector
     and a live place with a real type match already knows what it is; asking
     about either would spend money to replace good data with a guess. */
  const targets = places
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.source === "google" && p.flavorKnown === false);
  if (!targets.length) return places;

  const out = [...places];

  /* ONE CANARY BEFORE THE FLOCK. The breaker above only helps AFTER three
     failures have been recorded, which on a cold instance is too late: the
     very first request fans out a dozen calls in parallel, so nothing has
     failed yet when they are all already in flight. Measured against a
     deployment with a dead key, that cost 4.9 SECONDS on the first request
     before the breaker took over.
     
     So the first place is asked alone. If it comes back empty AND the model
     has now failed enough to trip the breaker, the rest are abandoned — a
     dead credential costs one round-trip per instance instead of a dozen. A
     null from a WORKING model (an unrecognisable name) is not a reason to
     stop, which is why the breaker, not the null, is what decides. */
  const run = (async () => {
    const [first, ...rest] = targets;
    const firstResult = await enrichmentFor(first.p).catch(() => null);
    out[first.i] = withEnrichment(first.p, firstResult);
    /* ONE failure is enough HERE, unlike the guard at the top. The default
       threshold is deliberately sceptical because a lone timeout proves
       nothing — but this decision is whether to multiply that failure by
       eleven, and the asymmetry runs the other way: being wrong costs this
       request its enrichment and nothing more, since the next one asks again. */
    if (!firstResult && isFailing("llm", 1)) return;

    await Promise.all(
      rest.map(async ({ p, i }) => {
        const e = await enrichmentFor(p).catch(() => null);
        out[i] = withEnrichment(p, e);
      }),
    );
  })();

  /* THE BUDGET COVERS THE CANARY TOO. An earlier cut awaited the first call
     before starting the clock, which meant a model that hung rather than
     failed would block the whole recommendation indefinitely — the budget
     existing precisely to stop that. Caught by the timeout test. */
  await Promise.race([run, new Promise((resolve) => setTimeout(resolve, budgetMs))]);
  return out;
}
