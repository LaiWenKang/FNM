import { NextRequest, NextResponse } from "next/server";
import { readProfile, writeProfile } from "@/lib/profile";

// Records the chosen recommendation as an (implicit) meal — selection counts
// as eaten unless corrected, per PLAN.md. Powers the recency penalty.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const placeId = body?.placeId as string | undefined;
  const cuisine = (body?.cuisine as string | undefined) ?? "unknown";
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const profile = readProfile(req);
  profile.recent.push({ placeId, cuisine, at: Date.now() });

  const res = NextResponse.json({ ok: true });
  writeProfile(res, profile);
  return res;
}
