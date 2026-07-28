import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { decideForGroup, groupVector, loadGroup, normalizeCode, saveGroup } from "@/lib/group";
import { getCandidatePlaces } from "@/lib/places";
import { dishGlyph } from "@/lib/glyphs";
import { similarity } from "@/lib/flavor";

export const dynamic = "force-dynamic";

/** GET /api/group/decide?code=ABC123 — one pick the whole group can live with. */
export async function GET(req: NextRequest) {
  const code = normalizeCode(new URL(req.url).searchParams.get("code") ?? "");
  if (code.length !== 6) return NextResponse.json({ error: "Bad code" }, { status: 400 });

  const group = await loadGroup(code);
  if (!group) return NextResponse.json({ error: "That group has expired." }, { status: 404 });

  const voters = group.members.filter((m) => m.seeded);
  if (!voters.length) {
    return NextResponse.json(
      { error: "Nobody in this group has shown their taste yet.", members: group.members.length },
      { status: 409 },
    );
  }

  const ctx = await buildContext(group.lat, group.lng, group.hour ?? undefined);
  // The widest ceiling in the group decides how far to LOOK; the strictest one
  // decides what actually qualifies (see decideForGroup). Fetching to the
  // widest keeps the pool honest without loosening anybody's limit.
  const searchKm = Math.max(...voters.map((m) => m.maxKm));
  const places = await getCandidatePlaces(group.lat, group.lng, searchKm, ctx.hourSg);

  const picks = decideForGroup(group, places, ctx);
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
      dish: dish ? { name: dish.name, priceSgd: dish.priceSgd, glyph: dishGlyph(dish.id, p.place.cuisine, dish.flavor) } : null,
    };
  });

  return NextResponse.json({
    code: group.code,
    label: group.label,
    context: { hour: ctx.hourSg, raining: ctx.raining, mealPeriod: ctx.mealPeriod },
    groupVector: gv,
    voters: voters.length,
    waiting: group.members.length - voters.length,
    decidedPlaceId: group.decidedPlaceId,
    picks: top,
  });
}

/** POST /api/group/decide — lock the group's answer so latecomers see it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: string; placeId?: string };
  const code = normalizeCode(body.code ?? "");
  const group = await loadGroup(code);
  if (!group) return NextResponse.json({ error: "That group has expired." }, { status: 404 });
  group.decidedPlaceId = typeof body.placeId === "string" ? body.placeId.slice(0, 80) : null;
  await saveGroup(group);
  return NextResponse.json({ ok: true, decidedPlaceId: group.decidedPlaceId });
}
