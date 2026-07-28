import { NextRequest, NextResponse } from "next/server";
import { auth, authRequired, googleConfigured } from "@/auth";
import { dbConfigured } from "@/lib/db";
import { describeTaste } from "@/lib/flavor";
import { defaultProfile, eraseProfile, readProfile, writeProfile } from "@/lib/profile";

// GET  -> current profile + account state
// POST -> update settings { maxKm?, priceMax? } or { reset: true }

export async function GET(req: NextRequest) {
  const [profile, session] = await Promise.all([readProfile(req), auth().catch(() => null)]);
  return NextResponse.json({
    vector: profile.vector,
    swipeCount: profile.swipeCount,
    priceMax: profile.priceMax,
    maxKm: profile.maxKm,
    recentCount: profile.recent.length,
    tasteDescription: describeTaste(profile.vector),
    account: {
      signedIn: Boolean(session?.user),
      name: session?.user?.name ?? null,
      email: session?.user?.email ?? null,
      image: session?.user?.image ?? null,
      // Where this profile is actually stored, surfaced honestly in the UI.
      storage: session?.user && dbConfigured ? "cloud" : "device",
      googleConfigured,
      authRequired,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.reset === true) {
    const res = NextResponse.json({ ok: true, ...defaultProfile() });
    await eraseProfile(res);
    return res;
  }

  const profile = await readProfile(req);
  if (typeof body.maxKm === "number" && body.maxKm >= 0.3 && body.maxKm <= 20) {
    profile.maxKm = body.maxKm;
  }
  if ([1, 2, 3, 4].includes(body.priceMax)) {
    profile.priceMax = body.priceMax;
  }

  const res = NextResponse.json({ ok: true, maxKm: profile.maxKm, priceMax: profile.priceMax });
  await writeProfile(res, profile);
  return res;
}
