import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { track } from "@/lib/metrics";
import { Craving, parseCraving } from "@/lib/craving";
import { enrichPicks } from "@/lib/dishes";
import { explain } from "@/lib/explain";
import { applyMoods, isValidMood } from "@/lib/mood";
import { getCandidatePlaces, placeFromSaved } from "@/lib/places";
import { listSaved } from "@/lib/social";
import { memberIdFrom } from "@/lib/member";
import { currentUserId } from "@/lib/profile";
import { readProfile } from "@/lib/profile";
import { pickBestDish, recommend, ScoredPlace } from "@/lib/scoring";

// GET /api/recommend?lat=..&lng=..&exclude=id1,id2
// Returns 1 best pick + safer + adventurous alternatives, with explanations.

const DEFAULT_ORIGIN = { lat: 1.2841, lng: 103.8515 }; // Raffles Place

// Purely ADDITIVE against the shipped shape: every field the client already
// reads keeps its name, type and meaning. The new ones are the signals the
// pipeline was computing and then discarding — the score and its decomposition,
// the coordinates for the minimap and the true bearing, opening hours for the
// closing chip, the shelter flag, and the dish vector for the dual radar.
function serialize(pick: ScoredPlace | null, explanation?: string) {
  if (!pick) return null;
  return {
    placeId: pick.place.id,
    name: pick.place.name,
    cuisine: pick.place.cuisine,
    dish: pick.bestDish
      ? {
          id: pick.bestDish.id,
          name: pick.bestDish.name,
          priceSgd: pick.bestDish.priceSgd,
          flavor: pick.bestDish.flavor,
        }
      : null,
    walkMinutes: pick.walkMinutes,
    distanceKm: Math.round(pick.distanceKm * 100) / 100,
    priceLevel: pick.place.priceLevel,
    explanation: explanation ?? pick.reasons.join(" · "),
    matchScore: pick.matchScore,
    breakdown: pick.breakdown,
    lat: pick.place.lat,
    lng: pick.place.lng,
    openHour: pick.place.openHour,
    closeHour: pick.place.closeHour,
    sheltered: pick.place.sheltered,
    source: pick.place.source,
    rating: pick.place.rating ?? null,
    ratingCount: pick.place.ratingCount ?? 0,
    // The UI must be able to tell an estimate from a reading.
    flavorKnown: pick.place.flavorKnown !== false,
    hoursKnown: pick.place.hoursKnown !== false,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "") || DEFAULT_ORIGIN.lat;
  const lng = parseFloat(searchParams.get("lng") ?? "") || DEFAULT_ORIGIN.lng;
  const exclude = (searchParams.get("exclude") ?? "").split(",").filter(Boolean);
  const moods = (searchParams.get("mood") ?? "").split(",").filter(isValidMood);
  const hourParam = searchParams.get("hour");
  const hour = hourParam !== null && hourParam !== "" ? Number(hourParam) : undefined;
  const label = (searchParams.get("label") ?? "").slice(0, 60) || null;
  const cravingText = (searchParams.get("craving") ?? "").slice(0, 120).trim();

  const profile = applyMoods(await readProfile(req), moods);

  /* A craving is a stated intent, so it overrides the LEARNED vector on the
     dimensions it speaks to — but only those. Saying "spicy" should not reset
     what the app knows about how rich or adventurous you are. */
  const craving: Craving | null = cravingText ? await parseCraving(cravingText) : null;
  if (craving) {
    for (const [dim, v] of Object.entries(craving.vector)) {
      profile.vector[dim as keyof typeof profile.vector] = v as number;
    }
    if (craving.priceMax) profile.priceMax = craving.priceMax;
  }
  // Hours have to be resolved before the candidate fetch, because Google's
  // opening periods are matched against the hour the user is actually
  // planning for — not against whatever time the server thinks it is.
  const ctx = await buildContext(lat, lng, hour);
  const places = await getCandidatePlaces(lat, lng, profile.maxKm, ctx.hourSg);

  /* THE SAVED LIST JOINS THE POOL. A bookmark folder you never reopen is not a
     feature; the value of saving a post is the app remembering it FOR you and
     raising it the day you happen to be nearby. Unvisited only — once you have
     eaten there it is a normal place like any other. */
  const savedOwner = (await currentUserId()) ?? memberIdFrom(req).id;
  const ownerKey = (await currentUserId()) ? `u:${savedOwner}` : `d:${savedOwner}`;
  const saved = await listSaved(ownerKey).catch(() => []);
  const known = new Set(places.map((p) => p.id));
  for (const post of saved) {
    if (!post.resolved || post.visitedAt) continue;
    if (known.has(post.resolved.placeId)) {
      // Already in the pool from the nearby search — just flag the intent.
      const existing = places.find((p) => p.id === post.resolved!.placeId);
      if (existing) {
        existing.wantToTry = true;
        existing.savedDish = post.dishName;
      }
      continue;
    }
    places.push(placeFromSaved(post.resolved, post.dishName));
  }

  // Never dead-end: if the strict filters leave nothing, relax them step by
  // step (wider radius, then any budget, then nearest matches anywhere) and
  // tell the user what was relaxed.
  const relaxSteps: { maxKm: number; priceMax: 1 | 2 | 3 | 4; note: string | null }[] = [
    { maxKm: profile.maxKm, priceMax: profile.priceMax, note: null },
    { maxKm: Math.max(3, profile.maxKm), priceMax: profile.priceMax, note: "widened the search to ~3 km" },
    { maxKm: 8, priceMax: 4, note: "widened the search to ~8 km" },
    { maxKm: 50, priceMax: 4, note: "nothing close by — showing options further out" },
    /* THE CEILING IS 120 km, NOT THE CIRCUMFERENCE OF THE EARTH. The old final
       step used 40075, so a bad GPS fix returned a place 11,147 km away and the
       card rendered "148633 MIN WALK". A number that absurd is not a fallback,
       it is a bug wearing a fallback's clothes — and it is better to say
       nothing is near you than to offer a three-month walk. */
    { maxKm: 120, priceMax: 4, note: "nothing open near you — these are the closest matches we have" },
  ];

  /* HAS THE DINER TOLD US ANYTHING YET? Not the same question as "have they
     swiped". A mood is a tap that means "lighter" or "nearer"; a craving is a
     sentence they typed. Both write real intent into the vector, so a first-run
     user who taps SPICY and gets told the palate is unknown would be watching
     the app ignore what they just said. Any one of the three counts. */
  const palateKnown = profile.swipeCount > 0 || moods.length > 0 || craving !== null;

  let rec = null;
  let note: string | null = null;
  for (const step of relaxSteps) {
    rec = recommend(
      { ...profile, maxKm: step.maxKm, priceMax: step.priceMax },
      places,
      ctx,
      { lat, lng },
      exclude,
      craving,
      palateKnown,
    );
    if (rec) {
      note = step.note;
      break;
    }
  }

  if (!rec) {
    /* TWO VERY DIFFERENT FAILURES WERE SHARING ONE MESSAGE. Refusing every
       candidate produced "Everything seems closed right now — try again
       shortly", which is factually false (nothing is shut, you turned it all
       down) and gives advice that cannot work (waiting changes nothing). The
       same dead-end complaint from field testing, in a new disguise. */
    const refusedEverything = exclude.length > 0;
    // THE FAILURE SIGNAL PLAN.md ASKS FOR. Not awaited: a metrics write must
    // never sit between a hungry user and their answer, even a failed one.
    if (refusedEverything) void track(req, "dead_end");
    return NextResponse.json(
      {
        error: refusedEverything
          ? "That's everything open near you turned down. Start over, or widen the search in You."
          : "Everything nearby is shut right now. Try a different time or area.",
        canReset: refusedEverything,
        context: ctx,
      },
      { status: 404 },
    );
  }

  /* NOTHING MATCHED WHAT THEY ASKED FOR. Never a dead end — the pick still
     stands on palate and context — but saying so is the difference between an
     app that ignored you and one that looked and came up short. */
  if (craving && craving.terms.length && !rec.best.cravingHit) {
    note = `Nothing nearby matches "${craving.text}" right now — here's the closest thing.`;
  }

  /* TIER 2 — MINE DISHES FOR THE PICKS ACTUALLY BEING SHOWN.
     Deliberately AFTER ranking, not before: enriching all 20 candidates would
     cost 20 Places Details calls in the priciest SKU plus 20 LLM calls, to use
     three of them. Ranking first cuts that to at most three, and the cache
     usually makes it zero. The place's own flavour vector is sharpened by the
     mined dishes and cached, so the NEXT request for it ranks on real menu
     data rather than a type estimate — the catalogue improves as it is used. */
  const shown = [rec.best, rec.safer, rec.adventurous].filter(
    (s): s is ScoredPlace => s !== null,
  );
  const enriched = await enrichPicks(shown.map((s) => s.place));
  for (let i = 0; i < shown.length; i += 1) {
    const place = enriched[i];
    if (place && place.dishes.length && !shown[i].bestDish) {
      shown[i].place = place;
      shown[i].bestDish = pickBestDish(place, profile.vector);
    }
  }

  // One LLM call for the headline pick keeps latency low; alternates use the
  // structured template.
  const bestExplanation = await explain(rec.best, profile, ctx);

  void track(req, "served");

  return NextResponse.json({
    // Echo back exactly what the pick was computed from, so the UI can show the
    // user the inputs rather than making them trust a guess.
    context: {
      mealPeriod: ctx.mealPeriod,
      raining: ctx.raining,
      forecast: ctx.forecast,
      hour: ctx.hourSg,
      locationLabel: label,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
    },
    note,
    craving: craving ? { text: craving.text, hit: rec.best.cravingHit ?? null } : null,
    swipeCount: profile.swipeCount,
    // Same contract as flavorKnown and hoursKnown: the UI must be able to tell
    // a reading from a placeholder, and label the palate bar accordingly.
    palateKnown,
    // The session-effective palate (moods applied) — the ember polygon the dish
    // vector is drawn against on the hero card.
    vector: profile.vector,
    best: serialize(rec.best, bestExplanation),
    safer: serialize(rec.safer ?? null),
    adventurous: serialize(rec.adventurous ?? null),
  });
}
