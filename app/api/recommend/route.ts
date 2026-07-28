import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { explain } from "@/lib/explain";
import { applyMoods, isValidMood } from "@/lib/mood";
import { getCandidatePlaces } from "@/lib/places";
import { readProfile } from "@/lib/profile";
import { recommend, ScoredPlace } from "@/lib/scoring";

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

  const profile = applyMoods(await readProfile(req), moods);
  // Hours have to be resolved before the candidate fetch, because Google's
  // opening periods are matched against the hour the user is actually
  // planning for — not against whatever time the server thinks it is.
  const ctx = await buildContext(lat, lng, hour);
  const places = await getCandidatePlaces(lat, lng, profile.maxKm, ctx.hourSg);

  // Never dead-end: if the strict filters leave nothing, relax them step by
  // step (wider radius, then any budget, then nearest matches anywhere) and
  // tell the user what was relaxed.
  const relaxSteps: { maxKm: number; priceMax: 1 | 2 | 3 | 4; note: string | null }[] = [
    { maxKm: profile.maxKm, priceMax: profile.priceMax, note: null },
    { maxKm: Math.max(3, profile.maxKm), priceMax: profile.priceMax, note: "widened the search to ~3 km" },
    { maxKm: 8, priceMax: 4, note: "widened the search to ~8 km" },
    { maxKm: 50, priceMax: 4, note: "nothing close by — showing options further out" },
    { maxKm: 40075, priceMax: 4, note: "showing the nearest open matches (demo catalog covers Singapore CBD)" },
  ];

  let rec = null;
  let note: string | null = null;
  for (const step of relaxSteps) {
    rec = recommend(
      { ...profile, maxKm: step.maxKm, priceMax: step.priceMax },
      places,
      ctx,
      { lat, lng },
      exclude,
    );
    if (rec) {
      note = step.note;
      break;
    }
  }

  if (!rec) {
    return NextResponse.json(
      { error: "Everything seems closed right now — even the fallbacks. Try again shortly.", context: ctx },
      { status: 404 },
    );
  }

  // One LLM call for the headline pick keeps latency low; alternates use the
  // structured template.
  const bestExplanation = await explain(rec.best, profile, ctx);

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
    swipeCount: profile.swipeCount,
    // The session-effective palate (moods applied) — the ember polygon the dish
    // vector is drawn against on the hero card.
    vector: profile.vector,
    best: serialize(rec.best, bestExplanation),
    safer: serialize(rec.safer ?? null),
    adventurous: serialize(rec.adventurous ?? null),
  });
}
