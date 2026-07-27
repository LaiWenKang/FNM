import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { explain } from "@/lib/explain";
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

  const profile = readProfile(req);
  const [ctx, places] = await Promise.all([
    buildContext(lat, lng),
    getCandidatePlaces(lat, lng, profile.maxKm),
  ]);

  const rec = recommend(profile, places, ctx, { lat, lng }, exclude);
  if (!rec) {
    return NextResponse.json(
      { error: "No open places match right now — try widening your radius.", context: ctx },
      { status: 404 },
    );
  }

  // One LLM call for the headline pick keeps latency low; alternates use the
  // structured template.
  const bestExplanation = await explain(rec.best, profile, ctx);

  return NextResponse.json({
    context: { mealPeriod: ctx.mealPeriod, raining: ctx.raining, forecast: ctx.forecast },
    swipeCount: profile.swipeCount,
    best: serialize(rec.best, bestExplanation),
    safer: serialize(rec.safer ?? null),
    adventurous: serialize(rec.adventurous ?? null),
  });
}
