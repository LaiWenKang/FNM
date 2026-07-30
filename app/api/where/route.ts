import { NextRequest, NextResponse } from "next/server";
import { geocodeConfigured, lookupPlaces } from "@/lib/geocode";

export const dynamic = "force-dynamic";

// GET /api/where?q=micron — real places matching free text.
//
// Server-side so the Places key stays server-side; the client never sees it,
// which is the same rule every other Google call in this app follows.
//
// The client only reaches here when the local area table came up empty, so
// this is already the uncommon path. `configured` is returned rather than
// implied, because "no results" and "no key" need different sentences on the
// other end — one is "that place is not in Singapore", the other is "this
// deployment cannot look places up at all".

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120).trim();
  if (q.length < 3) return NextResponse.json({ configured: geocodeConfigured(), results: [] });
  return NextResponse.json({
    configured: geocodeConfigured(),
    results: await lookupPlaces(q),
  });
}
