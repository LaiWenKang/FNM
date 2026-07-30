import { NextRequest, NextResponse } from "next/server";
import { geocodeConfigured, placeById, suggestPlaces } from "@/lib/geocode";

export const dynamic = "force-dynamic";

// GET /api/where?q=micron&s=<session>  → suggestions while typing
// GET /api/where?id=<placeId>&s=<session> → coordinates for the one picked
//
// Server-side so the Places key stays server-side, which is the rule every
// other Google call in this app follows.
//
// THE SESSION TOKEN IS PASSED THROUGH, NOT GENERATED HERE. Autocomplete is
// billed per session rather than per request: every keystroke from the first
// letter to the selection shares one token and bills once. Minting a token per
// request would silently bill each keystroke separately — the same money as
// text search, with none of the benefit — so the client owns it and this route
// only forwards it.
//
// `configured` is returned rather than implied, because "no results" and "no
// key" need different sentences: one means the place is not in Singapore, the
// other means this deployment cannot look anything up at all.

/** Google's tokens are UUIDs; anything else is a client bug or an attempt. */
const SESSION = /^[a-zA-Z0-9-]{8,64}$/;

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const session = params.get("s") ?? "";
  const token = SESSION.test(session) ? session : "";

  const id = (params.get("id") ?? "").slice(0, 300).trim();
  if (id) {
    return NextResponse.json({ configured: geocodeConfigured(), place: await placeById(id, token) });
  }

  const q = (params.get("q") ?? "").slice(0, 120).trim();
  return NextResponse.json({
    configured: geocodeConfigured(),
    suggestions: q.length < 2 ? [] : await suggestPlaces(q, token),
  });
}
