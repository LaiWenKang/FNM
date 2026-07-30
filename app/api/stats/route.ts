import { NextRequest, NextResponse } from "next/server";
import { metrics, metricsEnabled } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// GET /api/stats?token=…&days=28 — the six numbers from PLAN.md §6.
//
// CLOSED BY DEFAULT. Without STATS_TOKEN set this route does not exist: it
// returns the same 404 as a typo'd URL, and says nothing about why. An
// analytics endpoint that ships open is a leak with a dashboard attached —
// pick rates and dead-end counts are the shape of the business, and the
// device-id column is exactly the field the privacy note promises stays put.
//
// The token is compared in constant time. Overkill for a lunch app, but a
// naive === on a secret leaks its prefix one request at a time, and the fix
// costs four lines.

function tokenOk(supplied: string | null): boolean {
  const expected = process.env.STATS_TOKEN;
  if (!expected || !supplied) return false;
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  if (!process.env.STATS_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const supplied =
    searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!tokenOk(supplied)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clamped rather than rejected: a nonsense window should give you a sane
  // answer, not an error page you have to read the source to understand.
  const raw = Number(searchParams.get("days"));
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.round(raw))) : 28;

  /* NO DATABASE MEANS NO NUMBERS, AND IT HAS TO SAY SO. Returning a page of
     nulls would be indistinguishable from "nobody used the app this month",
     which is the single most expensive way for this endpoint to be wrong. */
  if (!metricsEnabled) {
    return NextResponse.json(
      {
        recording: false,
        error: "No DATABASE_URL, so no events are being recorded. Nothing is being lost silently — nothing is being written at all.",
      },
      { status: 503 },
    );
  }

  /* A FAILED QUERY MUST NOT LOOK LIKE A QUIET MONTH. `metrics` throws rather
     than returning zeroes precisely so this can say which one happened. */
  try {
    return NextResponse.json({ recording: true, ...(await metrics(days)) });
  } catch (e) {
    return NextResponse.json(
      {
        recording: true,
        error: "Events are being recorded, but reading them back failed.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
