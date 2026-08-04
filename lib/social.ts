import { neon } from "@neondatabase/serverless";
import { ask, jsonObject } from "@/lib/llm";

// ═══ SAVED POSTS → PLACES YOU CAN WALK TO ═════════════════════════════════
//
// The original idea for FNM was "pull restaurants from Google, Rednote, TikTok,
// Douyin". Two very different things were hiding inside that sentence, and
// conflating them is what made it look impossible:
//
//   CRAWLING THEIR CATALOGUES  Not possible, and not worth pretending. None of
//     the three expose a public API for discovering food posts, they actively
//     block scrapers, and building on a scraper means the feature breaks the
//     week they change their markup.
//
//   IMPORTING WHAT YOU SAVED   Entirely possible, and BETTER — because it is
//     already filtered by your own taste. Everybody saves food videos and then
//     never finds them again at the moment they are actually hungry, standing
//     outside somewhere deciding. That gap is the real product.
//
// So: you paste the link (or share it into the app), and FNM turns it into a
// place with an address, hours and a walk time — something you can act on
// rather than a video you meant to rewatch.
//
// ── WHAT IS ACTUALLY AVAILABLE, PER PLATFORM ─────────────────────────────
//
//   TIKTOK   a PUBLIC oEmbed endpoint, no auth, officially supported. Returns
//            the caption and author. Verified working.
//   DOUYIN   no oEmbed. The caption travels in the shared text itself, which
//            is what iOS puts on the clipboard when you tap Share → Copy Link.
//   REDNOTE  same: the share text carries the title. Their share format is
//            literally "「title」 http://xhslink.com/…".
//
// So the caption is the raw material in every case, and the extractor is
// written to work from caption text alone. Anything oEmbed adds is a bonus.

const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;

export type Platform = "tiktok" | "douyin" | "rednote" | "instagram" | "other";

export interface SavedPost {
  id: string;
  platform: Platform;
  url: string;
  /** Whatever caption we could recover — oEmbed title, or the pasted text. */
  caption: string;
  /** What Claude read out of it. */
  placeName: string | null;
  dishName: string | null;
  areaHint: string | null;
  /** Resolved against Google Places, so it has a location you can walk to. */
  resolved: {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    rating: number | null;
    ratingCount: number;
  } | null;
  at: number;
  /** Set once you have actually eaten there. */
  visitedAt: number | null;
}

export function platformOf(link: string): Platform {
  const u = link.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("douyin.com") || u.includes("iesdouyin.com")) return "douyin";
  if (u.includes("xiaohongshu.com") || u.includes("xhslink.com")) return "rednote";
  if (u.includes("instagram.com")) return "instagram";
  return "other";
}

/** Pull the first URL out of pasted share text — the text around it is caption. */
export function extractUrl(text: string): { link: string | null; rest: string } {
  const m = text.match(/https?:\/\/[^\s]+/);
  if (!m) return { link: null, rest: text.trim() };
  return { link: m[0], rest: text.replace(m[0], " ").trim() };
}

/* ── OEMBED ───────────────────────────────────────────────────────────────
   Only TikTok publishes one. Everything else falls back to the pasted text,
   which is why the paste box accepts the WHOLE share blob rather than
   demanding a bare URL. */
async function oembedCaption(link: string, platform: Platform): Promise<string | null> {
  if (platform !== "tiktok") return null;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return [data.title, data.author_name && `— ${data.author_name}`].filter(Boolean).join(" ") || null;
  } catch {
    return null;
  }
}

/* ── EXTRACTION ───────────────────────────────────────────────────────────
   Food captions are messy, multilingual and full of hashtags. This is exactly
   the shape of problem an LLM is good at and a regex is not. */
interface Extracted {
  placeName: string | null;
  dishName: string | null;
  areaHint: string | null;
}

/** Zero-key fallback: strip hashtags and emoji, keep the longest plain phrase. */
export function extractLocal(caption: string): Extracted {
  const cleaned = caption
    .replace(/[#＃][^\s#＃]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[「」【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { placeName: null, dishName: null, areaHint: null };
  // No claim to have identified a dish — the name is a search string, and the
  // resolver will decide whether it corresponds to anything real.
  return { placeName: cleaned.slice(0, 60), dishName: null, areaHint: null };
}

export async function extractPlace(caption: string): Promise<Extracted> {
  const local = extractLocal(caption);
  if (!caption.trim()) return local;

  const reply = await ask({
    maxTokens: 300,
    system:
      "Read a social-media food caption and identify the restaurant. Return ONLY JSON: " +
      '{"placeName":string|null,"dishName":string|null,"areaHint":string|null}. ' +
      "placeName is the restaurant's name as someone would type it into Maps — not the " +
      "caption, not a description. dishName is the specific dish featured, if named. " +
      "areaHint is a neighbourhood, mall or street if mentioned. Captions may be in " +
      "English, Chinese or a mix. If no actual restaurant is named, return null for " +
      "placeName rather than guessing from the food type — 'best laksa ever' names no " +
      "restaurant.",
    user: caption.slice(0, 1200),
  });

  const p = jsonObject<Record<string, unknown>>(reply);
  if (!p) return local;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 1 ? v.trim().slice(0, 80) : null;
  return {
    placeName: str(p.placeName) ?? local.placeName,
    dishName: str(p.dishName),
    areaHint: str(p.areaHint),
  };
}

/* ── RESOLUTION ───────────────────────────────────────────────────────────
   A name is not yet useful. searchText turns "Hjh Maimunah, Jalan Pisang" into
   coordinates, hours and a rating — the difference between a video you saved
   and a place you can walk to.

   BUT searchText ALWAYS RETURNS SOMETHING. Fed the caption of a pet video it
   returned "GUESS KIDS", a clothing shop, with total confidence — and that
   would have gone onto the want-to-try list and then into a recommendation.
   Google's text search is a matcher, not a validator; it has no notion of
   having failed.

   So the result is checked for being FOOD before it is accepted. This catches
   the keyless case, where the local extractor can only guess that a caption is
   a restaurant name, and it equally catches the LLM naming something that
   turns out to be a shop. Better to say "not matched to a place yet" than to
   send someone to a clothes shop for lunch. */
const FOOD_TYPES = new Set([
  "restaurant", "food", "cafe", "coffee_shop", "bakery", "bar", "meal_takeaway",
  "meal_delivery", "fast_food_restaurant", "sandwich_shop", "dessert_shop",
  "ice_cream_shop", "juice_shop", "pub", "deli", "donut_shop", "bagel_shop",
  "food_court", "buffet_restaurant", "fine_dining_restaurant", "diner",
  "breakfast_restaurant", "brunch_restaurant", "steak_house", "pizza_restaurant",
  "hamburger_restaurant", "barbecue_restaurant", "seafood_restaurant",
  "sushi_restaurant", "ramen_restaurant", "vegetarian_restaurant",
  "vegan_restaurant", "tea_house", "wine_bar", "bar_and_grill",
]);

/** Exported for tests — this guard is the difference between lunch and a
    clothing shop, so it is worth pinning. */
export function isFoodForTest(types: string[] | undefined): boolean {
  return isFood(types);
}

function isFood(types: string[] | undefined): boolean {
  if (!types?.length) return false;
  return types.some((t) => FOOD_TYPES.has(t) || t.endsWith("_restaurant"));
}
export async function resolvePlace(
  query: string,
  near: { lat: number; lng: number },
): Promise<SavedPost["resolved"]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(4500),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.formattedAddress,places.rating,places.userRatingCount,places.types",
      },
      body: JSON.stringify({
        textQuery: query.slice(0, 120),
        maxResultCount: 1,
        // Bias toward the user rather than restrict to them: a place saved from
        // a video is often across town, and refusing to find it because it is
        // 12 km away would defeat the entire point of saving it.
        locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text: string };
        location?: { latitude: number; longitude: number };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        types?: string[];
      }>;
    };
    const p = data.places?.[0];
    if (!p?.location || !p.displayName) return null;
    // The guard that stops a pet video becoming a clothing shop.
    if (!isFood(p.types)) return null;
    return {
      placeId: `g-${p.id}`,
      name: p.displayName.text,
      lat: p.location.latitude,
      lng: p.location.longitude,
      address: p.formattedAddress ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
    };
  } catch {
    return null;
  }
}

/* ── STORAGE ──────────────────────────────────────────────────────────────
   Keyed by the same device/account id the profile uses, so a saved list
   follows you exactly as far as your profile does and no further. */
let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS saved_posts (
        owner_id   TEXT NOT NULL,
        id         TEXT NOT NULL,
        post       JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, id)
      )
    `;
  })().catch((e) => {
    // Never cache the rejection - see the note in lib/db.ts ensureSchema.
    ready = null;
    throw e;
  });
  return ready;
}

const memory = new Map<string, SavedPost[]>();
export const savedDurable = Boolean(sql);
export const MAX_SAVED = 60;

export async function listSaved(owner: string): Promise<SavedPost[]> {
  if (sql) {
    try {
      await ensureSchema();
      const rows = (await sql`
        SELECT post FROM saved_posts WHERE owner_id = ${owner} ORDER BY created_at DESC LIMIT ${MAX_SAVED}
      `) as { post: SavedPost }[];
      return rows.map((r) => r.post);
    } catch {
      return memory.get(owner) ?? [];
    }
  }
  return memory.get(owner) ?? [];
}

export async function addSaved(owner: string, post: SavedPost): Promise<void> {
  if (sql) {
    try {
      await ensureSchema();
      await sql`
        INSERT INTO saved_posts (owner_id, id, post) VALUES (${owner}, ${post.id}, ${JSON.stringify(post)}::jsonb)
        ON CONFLICT (owner_id, id) DO UPDATE SET post = EXCLUDED.post
      `;
      return;
    } catch {
      /* fall through to memory */
    }
  }
  const list = memory.get(owner) ?? [];
  memory.set(owner, [post, ...list.filter((p) => p.id !== post.id)].slice(0, MAX_SAVED));
}

export async function removeSaved(owner: string, id: string): Promise<void> {
  if (sql) {
    try {
      await ensureSchema();
      await sql`DELETE FROM saved_posts WHERE owner_id = ${owner} AND id = ${id}`;
      return;
    } catch {
      /* fall through */
    }
  }
  memory.set(owner, (memory.get(owner) ?? []).filter((p) => p.id !== id));
}

export async function markVisited(owner: string, id: string): Promise<void> {
  const list = await listSaved(owner);
  const post = list.find((p) => p.id === id);
  if (!post) return;
  await addSaved(owner, { ...post, visitedAt: Date.now() });
}

/** Deterministic id from the link, so re-pasting the same post updates it. */
export function idFor(link: string): string {
  let h = 0;
  for (let i = 0; i < link.length; i += 1) h = (h * 31 + link.charCodeAt(i)) >>> 0;
  return `s${h.toString(36)}`;
}

/** The whole pipeline: paste → platform → caption → place → coordinates. */
export async function importPost(
  raw: string,
  near: { lat: number; lng: number },
): Promise<SavedPost | { error: string }> {
  const { link, rest } = extractUrl(raw);
  if (!link) return { error: "That doesn't look like a link. Paste the whole share text." };
  const platform = platformOf(link);

  const caption = (await oembedCaption(link, platform)) ?? rest;
  if (!caption) {
    return {
      error:
        "No caption came with that link. Copy the post's text as well — on iOS, Share → Copy Link usually includes it.",
    };
  }

  const { placeName, dishName, areaHint } = await extractPlace(caption);
  const query = [placeName, areaHint, "Singapore"].filter(Boolean).join(" ");
  const resolved = placeName ? await resolvePlace(query, near) : null;
  // NOT MATCHED IS AN HONEST OUTCOME. The post is still saved with its caption
  // so nothing the user pasted is lost, and the list says plainly that it has
  // nowhere to send them — which is the truth, and far better than a confident
  // wrong address.

  return {
    id: idFor(link),
    platform,
    url: link,
    caption: caption.slice(0, 400),
    placeName,
    dishName,
    areaHint,
    resolved,
    at: Date.now(),
    visitedAt: null,
  };
}
