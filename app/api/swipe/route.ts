import { NextRequest, NextResponse } from "next/server";
import { CALIBRATION_LENGTH, swipeWeight } from "@/lib/calibration";
import { SWIPE_CARDS } from "@/lib/data/seed";
import { nudge } from "@/lib/flavor";
import { trackLater } from "@/lib/metrics";
import { readProfile, writeProfile } from "@/lib/profile";

// Records one bootstrap swipe and nudges the taste vector. Early swipes move
// the vector more (cold start), later ones fine-tune; a rejection counts for
// less than an acceptance because it does not say WHICH part was wrong. Both
// rules live in lib/calibration.ts with the reasoning.
//
// Cards are looked up in the whole POOL rather than the sixteen-card deck, so
// a card that was in someone's deck yesterday still resolves today if the
// selection changes underneath them.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cardId = body?.cardId as string | undefined;
  const liked = body?.liked as boolean | undefined;
  const card = SWIPE_CARDS.find((c) => c.id === cardId);
  if (!card || typeof liked !== "boolean") {
    return NextResponse.json({ error: "cardId and liked are required" }, { status: 400 });
  }

  const profile = await readProfile(req);
  profile.vector = nudge(profile.vector, card.flavor, liked, swipeWeight(profile.swipeCount, liked));
  profile.swipeCount += 1;

  // Fires once, on the swipe that completes the deck — the onboarding
  // funnel's bottom step.
  if (profile.swipeCount === CALIBRATION_LENGTH) trackLater(req, "calibrated");

  const res = NextResponse.json({ swipeCount: profile.swipeCount, vector: profile.vector });
  await writeProfile(res, profile);
  return res;
}
