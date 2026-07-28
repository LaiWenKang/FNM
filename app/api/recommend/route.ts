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

function serialize(pick: ScoredPlace | null, explanation?: string) {
  if (!pick) return null;
  return {
    placeId: pick.place.id,
    name: pick.place.name,
    cuisine: pick.place.cuisine,
    dish: pick.bestDish ? { name: pick.bestDish.name, priceSgd: pick.bestDish.priceSgd } : null,
    walkMinutes: pick.walkMinutes,
    distanceKm: Math.round(pick.distanceKm * 100) / 100,
    priceLevel: pick.place.priceLevel,
    explanation: explanation ?? pick.reasons.join(" · "),
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
  const [ctx, places] = await Promise.all([
    buildContext(lat, lng, hour),
    getCandidatePlaces(lat, lng, profile.maxKm),
  ]);

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
    best: serialize(rec.best, bestExplanation),
    safer: serialize(rec.safer ?? null),
    adventurous: serialize(rec.adventurous ?? null),
  });
}
