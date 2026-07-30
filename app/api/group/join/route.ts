import { NextRequest, NextResponse } from "next/server";
import { MAX_MEMBERS, loadGroup, normalizeCode, saveGroup } from "@/lib/group";
import { SWIPE_CARDS } from "@/lib/data/seed";
import { DIMS, neutralVector } from "@/lib/flavor";
import { track } from "@/lib/metrics";
import { readProfile } from "@/lib/profile";
import { memberIdFrom, setMemberCookie } from "@/lib/member";

export const dynamic = "force-dynamic";

/**
 * POST /api/group/join — join, or update your palate inside a group.
 *
 * A joiner who has already calibrated in the app brings their real profile. A
 * first-timer seeds one from three quick yes/no taps instead, because the
 * sixteen-card onboarding is the right length for a permanent profile and
 * completely the wrong length for someone who was sent a link thirty seconds
 * before lunch. Three cards is a weak signal and the app treats it as one — it
 * is enough to keep them out of the "cannot steer for you" bucket, not enough
 * to pretend it knows them.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    name?: string;
    likedCardIds?: string[];
    passedCardIds?: string[];
  };
  const code = normalizeCode(body.code ?? "");
  if (code.length !== 6) return NextResponse.json({ error: "Bad code" }, { status: 400 });

  const group = await loadGroup(code);
  if (!group) return NextResponse.json({ error: "That group has expired." }, { status: 404 });

  const { id, isNew } = memberIdFrom(req);
  const existing = group.members.find((m) => m.id === id);
  if (!existing && group.members.length >= MAX_MEMBERS) {
    return NextResponse.json({ error: `Groups cap at ${MAX_MEMBERS} people.` }, { status: 409 });
  }

  const profile = await readProfile(req);
  const liked = (body.likedCardIds ?? []).filter((x) => typeof x === "string").slice(0, 16);
  const passed = (body.passedCardIds ?? []).filter((x) => typeof x === "string").slice(0, 16);

  // A calibrated profile always wins over three taps.
  let vector = profile.vector;
  let seeded = profile.swipeCount > 0;

  if (!seeded && (liked.length || passed.length)) {
    // LIKES SET THE POSITION, PASSES NUDGE AWAY FROM IT.
    //
    // The first cut summed both into one average, which quietly conflated "the
    // flavour I want" with "the opposite of what I rejected" — passing a salad
    // added (0.5 - 0) to `soupy`, so refusing a cold bowl pushed a person's
    // soup preference UP. Repulsion has to be applied after the average, not
    // averaged alongside it.
    const likedCards = liked
      .map((id) => SWIPE_CARDS.find((c) => c.id === id))
      .filter((c): c is (typeof SWIPE_CARDS)[number] => Boolean(c));
    const passedCards = passed
      .map((id) => SWIPE_CARDS.find((c) => c.id === id))
      .filter((c): c is (typeof SWIPE_CARDS)[number] => Boolean(c));

    if (likedCards.length || passedCards.length) {
      const v = neutralVector();
      if (likedCards.length) {
        for (const d of DIMS) {
          v[d] = likedCards.reduce((sum, c) => sum + c.flavor[d], 0) / likedCards.length;
        }
      }
      // A pass is a weaker statement than a like, and three taps is a weak
      // signal overall, so the nudge stays small on purpose.
      for (const c of passedCards) {
        for (const d of DIMS) v[d] -= (c.flavor[d] - 0.5) * 0.12;
      }
      for (const d of DIMS) v[d] = Math.max(0, Math.min(1, v[d]));
      vector = v;
      seeded = true;
    }
  }

  const name = (body.name ?? "").trim().slice(0, 24) || existing?.name || "Guest";
  if (existing) {
    existing.name = name;
    if (seeded) {
      existing.vector = vector;
      existing.seeded = true;
    }
    existing.maxKm = profile.maxKm;
    existing.priceMax = profile.priceMax;
  } else {
    group.members.push({
      id,
      name,
      vector,
      maxKm: profile.maxKm,
      priceMax: profile.priceMax,
      seeded,
      joinedAt: Date.now(),
    });
  }
  await saveGroup(group);
  if (!existing) void track(req, "group_joined", { members: group.members.length });

  const res = NextResponse.json({
    ok: true,
    memberId: id,
    seeded,
    members: group.members.map((m) => ({ id: m.id, name: m.name, seeded: m.seeded })),
  });
  if (isNew) setMemberCookie(res, id);
  return res;
}
