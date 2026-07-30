import { NextRequest, NextResponse } from "next/server";
import { DIMS, FlavorVector, nudge, vec } from "@/lib/flavor";
import { readProfile, writeProfile } from "@/lib/profile";
import { ASK_AFTER_MS, ASK_UNTIL_MS, type Verdict } from "@/lib/profile-shape";

// ═══ THE LEARNING LOOP ════════════════════════════════════════════════════
//
// This route used to record the meal for the recency penalty and NOTHING ELSE,
// which meant the app learned your palate from sixteen onboarding swipes and
// then never learned again. Choosing this place over the two alternatives it
// was shown beside is a preference expressed with your feet and your money —
// far better evidence than a card tapped once during setup — and it was being
// thrown away.
//
// ── WEIGHTS, AND WHY THEY ARE SMALL ──────────────────────────────────────
//
// A calibration swipe starts at 0.30 and decays; it is a deliberate answer to
// a direct question. A meal is noisier: you might have picked it because a
// colleague suggested it, because it was raining, or because it was the only
// thing open. So an accepted pick moves the vector by 0.10 — enough that a
// habit becomes visible over a fortnight, small enough that one odd Tuesday
// does not rewrite you.
//
// A REJECTION IS WEAKER STILL, AND SOMETIMES NOT ABOUT FLAVOUR AT ALL. "Not
// feeling it" can mean too far, too expensive, or simply not today, none of
// which say anything about taste. So the stated reason decides:
//
//   TOO RICH   flavour signal — nudge away, at 0.08
//   JUST BORED novelty signal — raise adventure only, touch nothing else
//   TOO FAR    NOT A FLAVOUR SIGNAL. Learning from it would teach the app you
//              dislike a cuisine when all you said was "not that walk".
//              Deliberately ignored.
//   (none)     ambiguous — 0.04, barely a whisper
const ACCEPT_WEIGHT = 0.1;
const REJECT_WEIGHT = 0.08;
const REJECT_AMBIGUOUS_WEIGHT = 0.04;

function readVector(raw: unknown): FlavorVector | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const d of DIMS) {
    const v = src[d];
    if (typeof v === "number" && Number.isFinite(v)) out[d] = Math.max(0, Math.min(1, v));
  }
  // A partial vector would pull the untouched dimensions toward 0.5, which is
  // a silent opinion nobody expressed.
  if (Object.keys(out).length !== DIMS.length) return null;
  return vec(out as Partial<FlavorVector>);
}

/** POST — the meal was chosen. Records it, and learns from it. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const placeId = body?.placeId as string | undefined;
  const cuisine = (body?.cuisine as string | undefined) ?? "unknown";
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const profile = await readProfile(req);

  // The dish actually chosen beats the restaurant's aggregate: "Wingstop" says
  // less about you than "the Mango Habanero" does.
  const flavor = readVector(body?.dishFlavor) ?? readVector(body?.placeFlavor);
  // Stored on the meal, not just used and discarded, so that when the diner is
  // asked "how was it?" hours later there is something concrete to learn from.
  profile.recent.push({ placeId, cuisine, at: Date.now(), ...(flavor ? { flavor } : {}) });
  if (flavor) profile.vector = nudge(profile.vector, flavor, true, ACCEPT_WEIGHT);

  const res = NextResponse.json({ ok: true, vector: profile.vector });
  await writeProfile(res, profile);
  return res;
}

/* ── HOW WAS IT ───────────────────────────────────────────────────────────
   EVERY OTHER SIGNAL IN THIS APP IS A PREDICTION. A swipe says what you think
   you like; a pick says what looked best at 12:15 among three options. Neither
   knows how the food actually was, and until now nothing did — the app watched
   you walk in and never asked what happened next.

   A verdict is the only evidence that survives contact with the meal, so it
   outweighs the pick that preceded it: AGAIN is worth more than the 0.10 that
   choosing it earned, because wanting it a second time is the thing choosing
   it was only a guess at.

   "Fine" is deliberately worth nothing. It is the honest middle — the meal was
   unremarkable — and inventing a nudge from it would manufacture a preference
   out of a shrug. It is still recorded, because "asked and answered neutrally"
   is different from "never asked". */
const VERDICT_WEIGHT: Record<Verdict, number> = { again: 0.16, fine: 0, no: 0.1 };

/** PATCH — the verdict on a meal already eaten. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const placeId = body?.placeId as string | undefined;
  const verdict = body?.verdict as Verdict | undefined;
  if (!placeId || (verdict !== "again" && verdict !== "fine" && verdict !== "no")) {
    return NextResponse.json({ error: "placeId and a verdict are required" }, { status: 400 });
  }

  const profile = await readProfile(req);
  // The most recent visit to that place — someone can eat somewhere twice.
  const meal = [...profile.recent].reverse().find((m) => m.placeId === placeId);
  if (!meal) return NextResponse.json({ error: "No such meal to rate." }, { status: 404 });
  // ANSWERING TWICE MUST NOT COUNT TWICE. Re-opening the card or double-tapping
  // would otherwise let one meal move the palate as far as three.
  if (meal.verdict) {
    return NextResponse.json({ ok: true, vector: profile.vector, alreadyRated: true });
  }
  meal.verdict = verdict;

  const weight = VERDICT_WEIGHT[verdict];
  if (meal.flavor && weight > 0) {
    profile.vector = nudge(profile.vector, meal.flavor, verdict === "again", weight);
  }

  const res = NextResponse.json({ ok: true, vector: profile.vector });
  await writeProfile(res, profile);
  return res;
}

/** GET — a meal eaten recently that has not been rated yet, if there is one. */
export async function GET(req: NextRequest) {
  const profile = await readProfile(req);
  const now = Date.now();
  // A window with two edges. Too soon and they are still eating; too late and
  // they cannot remember, and a guessed answer is worse than no answer.
  const pending = [...profile.recent]
    .reverse()
    .find((m) => !m.verdict && now - m.at > ASK_AFTER_MS && now - m.at < ASK_UNTIL_MS);
  return NextResponse.json({
    pending: pending ? { placeId: pending.placeId, cuisine: pending.cuisine, at: pending.at } : null,
  });
}

/** DELETE — "not feeling it". A refusal is data too, and it was being dropped. */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : null;
  const flavor = readVector(body?.dishFlavor) ?? readVector(body?.placeFlavor);

  const profile = await readProfile(req);

  if (reason === "bored") {
    // Boredom is about novelty, not about this dish. Nudging away from its
    // flavour would punish a cuisine for the sin of being familiar.
    profile.vector.adventure = Math.min(1, profile.vector.adventure + 0.06);
  } else if (reason === "far") {
    // Says nothing about taste. Recorded as no change, on purpose.
  } else if (flavor) {
    // "Too rich" NAMES the axis, so it is applied directly rather than left to
    // the blame heuristic in nudge() — which exists precisely because a plain
    // "not feeling it" does not say which part was wrong. A stated reason
    // should never be re-derived from a guess.
    profile.vector = nudge(
      profile.vector,
      flavor,
      false,
      reason === "rich" ? REJECT_WEIGHT : REJECT_AMBIGUOUS_WEIGHT,
      reason === "rich" ? "rich" : undefined,
    );
  }

  const res = NextResponse.json({ ok: true, vector: profile.vector });
  await writeProfile(res, profile);
  return res;
}
