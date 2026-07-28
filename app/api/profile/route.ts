import { NextRequest, NextResponse } from "next/server";
import { describeTaste } from "@/lib/flavor";
import { defaultProfile, readProfile, writeProfile } from "@/lib/profile";

// GET  -> current profile (vector, settings, taste description)
// POST -> update settings { maxKm?, priceMax? } or { reset: true }

export async function GET(req: NextRequest) {
  const profile = readProfile(req);
  return NextResponse.json({
    vector: profile.vector,
    swipeCount: profile.swipeCount,
    priceMax: profile.priceMax,
    maxKm: profile.maxKm,
    recentCount: profile.recent.length,
    tasteDescription: describeTaste(profile.vector),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  let profile = readProfile(req);

  if (body.reset === true) {
    profile = defaultProfile();
  } else {
    if (typeof body.maxKm === "number" && body.maxKm >= 0.3 && body.maxKm <= 20) {
      profile.maxKm = body.maxKm;
    }
    if ([1, 2, 3, 4].includes(body.priceMax)) {
      profile.priceMax = body.priceMax;
    }
  }

  const res = NextResponse.json({ ok: true, maxKm: profile.maxKm, priceMax: profile.priceMax });
  writeProfile(res, profile);
  return res;
}
