import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { decideForGroup, groupVector, loadGroup, normalizeCode, saveGroup } from "@/lib/group";
import { debts, fairnessDurable, recordMeal } from "@/lib/fairness";
import { getCandidatePlaces } from "@/lib/places";
import { track } from "@/lib/metrics";
import { dishGlyph } from "@/lib/glyphs";
import { similarity } from "@/lib/flavor";

export const dynamic = "force-dynamic";

/** GET /api/group/decide?code=ABC123 — one pick the whole group can live with. */
export async function GET(req: NextRequest) {
  const code = normalizeCode(new URL(req.url).searchParams.get("code") ?? "");
  if (code.length !== 6) return NextResponse.json({ error: "Bad code" }, { status: 400 });

  const group = await loadGroup(code);
  if (!group) return NextResponse.json({ error: "That group has expired." }, { status: 404 });

  /* NO LONGER A DEAD END. A group where nobody has swiped is the ordinary
     first run, not an error state, and refusing to answer it was the single
     most likely first experience an invited colleague could have. The pick now
     stands on distance, opening hours, budget and rating; `palateKnown` tells
     the screen to say so instead of implying a taste match. */
  const seeded = group.members.filter((m) => m.seeded);
  const palateKnown = seeded.length > 0;
  const voters = palateKnown ? seeded : group.members;

  const ctx = await buildContext(group.lat, group.lng, group.hour ?? undefined);
  // The widest ceiling in the group decides how far to LOOK; the strictest one
  // decides what actually qualifies (see decideForGroup). Fetching to the
  // widest keeps the pool honest without loosening anybody's limit.
  const searchKm = Math.max(...group.members.map((m) => m.maxKm));
  const places = await getCandidatePlaces(group.lat, group.lng, searchKm, ctx.hourSg);

  // WHOSE TURN IS IT. Members who have been served worst in this crew's recent
  // locked-in meals get a louder vote — bounded, so a rotation tilts close
  // calls rather than handing anyone a veto. Without DATABASE_URL the ledger
  // cannot persist across serverless instances, so this is empty and the blend
  // is the plain average it has always been; `fairnessDurable` says so rather
  // than letting the group believe it is being looked after when it is not.
  const owed = await debts(voters.map((m) => m.id));
  const picks = decideForGroup(group, places, ctx, owed);
  if (!picks.length) {
    return NextResponse.json(
      {
        error:
          "Nothing open right now clears everybody's distance and budget limits at once. Somebody needs to stretch.",
        context: { hour: ctx.hourSg, raining: ctx.raining, locationLabel: group.label },
      },
      { status: 409 },
    );
  }

  const gv = groupVector(group.members);
  const top = picks.slice(0, 3).map((p) => {
    const dish =
      p.place.dishes.length > 0
        ? [...p.place.dishes].sort((a, b) => similarity(gv, b.flavor) - similarity(gv, a.flavor))[0]
        : null;
    return {
      id: p.place.id,
      name: p.place.name,
      cuisine: p.place.cuisine,
      priceLevel: p.place.priceLevel,
      lat: p.place.lat,
      lng: p.place.lng,
      sheltered: p.place.sheltered,
      source: p.place.source,
      rating: p.place.rating ?? null,
      ratingCount: p.place.ratingCount ?? 0,
      groupScore: p.groupScore,
      meanScore: p.meanScore,
      minScore: p.minScore,
      weakestMemberName: p.weakestMemberName,
      perMember: p.perMember,
      dish: dish ? { name: dish.name, priceSgd: dish.priceSgd, glyph: dishGlyph(dish.id, p.place.cuisine, dish.flavor, dish.name) } : null,
    };
  });

  return NextResponse.json({
    code: group.code,
    label: group.label,
    context: { hour: ctx.hourSg, raining: ctx.raining, mealPeriod: ctx.mealPeriod },
    groupVector: gv,
    // Same contract as the solo card: the UI must be able to tell a reading
    // from a placeholder, and never draw a taste polygon nobody has set.
    palateKnown,
    voters: palateKnown ? voters.length : 0,
    fairness: {
      durable: fairnessDurable,
      // Named so the UI can say WHY a close call went the way it did.
      leaning: voters
        .map((m) => ({ name: m.name, owed: Math.round(owed[m.id] ?? 0) }))
        .filter((m) => m.owed >= 2)
        .sort((a, b) => b.owed - a.owed)
        .slice(0, 2),
    },
    waiting: palateKnown ? group.members.length - voters.length : group.members.length,
    decidedPlaceId: group.decidedPlaceId,
    picks: top,
  });
}

/**
 * POST /api/group/decide — lock the group's answer so latecomers see it.
 *
 * This is also the moment the fairness ledger learns something. A meal that
 * was merely LOOKED at says nothing; a meal the group committed to is the one
 * somebody actually ate, so only a lock-in is recorded — and it is recorded
 * with each member's score for the place they settled on, which is what makes
 * "you got the short end last time" a fact rather than a feeling.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: string; placeId?: string };
  const code = normalizeCode(body.code ?? "");
  const group = await loadGroup(code);
  if (!group) return NextResponse.json({ error: "That group has expired." }, { status: 404 });

  const placeId = typeof body.placeId === "string" ? body.placeId.slice(0, 80) : null;
  const alreadyDecided = group.decidedPlaceId;
  group.decidedPlaceId = placeId;
  await saveGroup(group);

  // Only on the FIRST lock-in for a given place, so re-opening the link or
  // double-tapping cannot bill somebody twice for the same lunch.
  if (placeId && placeId !== alreadyDecided) {
    void track(req, "group_decided", { members: group.members.length });
    try {
      const ctx = await buildContext(group.lat, group.lng, group.hour ?? undefined);
      const voters = group.members.filter((m) => m.seeded);
      const searchKm = voters.length ? Math.max(...voters.map((m) => m.maxKm)) : 2;
      const places = await getCandidatePlaces(group.lat, group.lng, searchKm, ctx.hourSg);
      const chosen = decideForGroup(group, places, ctx).find((p) => p.place.id === placeId);
      if (chosen) {
        await recordMeal(chosen.perMember.map((m) => ({ memberId: m.id, score: m.score })));
      }
    } catch {
      // The ledger is an optimisation, never a gate: failing to record a meal
      // must not stop the group from locking one in.
    }
  }

  return NextResponse.json({ ok: true, decidedPlaceId: group.decidedPlaceId });
}
