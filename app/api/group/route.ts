import { NextRequest, NextResponse } from "next/server";
import { Group, MAX_MEMBERS, groupsDurable, loadGroup, newCode, normalizeCode, saveGroup } from "@/lib/group";
import { labelForCoords } from "@/lib/areas";
import { trackLater } from "@/lib/metrics";
import { readProfile } from "@/lib/profile";
import { memberIdFrom, publicMemberId, setMemberCookie } from "@/lib/member";

export const dynamic = "force-dynamic";

/** POST /api/group — open a group and join it as the host. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    label?: string;
    hour?: number | null;
    name?: string;
  };
  const lat = Number.isFinite(body.lat) ? (body.lat as number) : 1.2837;
  const lng = Number.isFinite(body.lng) ? (body.lng as number) : 103.8515;
  const profile = await readProfile(req);
  const { id, isNew } = memberIdFrom(req);

  const group: Group = {
    code: newCode(),
    createdAt: Date.now(),
    lat,
    lng,
    label: (body.label ?? "").slice(0, 60) || labelForCoords(lat, lng),
    hour: typeof body.hour === "number" ? body.hour : null,
    members: [
      {
        id,
        name: (body.name ?? "").trim().slice(0, 24) || "Host",
        vector: profile.vector,
        maxKm: profile.maxKm,
        priceMax: profile.priceMax,
        // The host only counts as a voter if they have actually calibrated.
        seeded: profile.swipeCount > 0,
        joinedAt: Date.now(),
      },
    ],
    decidedPlaceId: null,
  };
  await saveGroup(group);

  trackLater(req, "group_created");

  // The member id travels ONLY in the httpOnly cookie. Echoing it in the body
  // would hand a bearer credential to anything that can read a JSON response.
  const res = NextResponse.json({ code: group.code, durable: groupsDurable });
  if (isNew) setMemberCookie(res, id);
  return res;
}

/** GET /api/group?code=ABC123 — the lobby state. */
export async function GET(req: NextRequest) {
  const code = normalizeCode(new URL(req.url).searchParams.get("code") ?? "");
  if (code.length !== 6) return NextResponse.json({ error: "Bad code" }, { status: 400 });
  const group = await loadGroup(code);
  if (!group) {
    return NextResponse.json(
      {
        error: groupsDurable
          ? "That group has expired or never existed."
          : "That group could not be found. Groups are held in memory on this deployment, so they do not always survive — set DATABASE_URL to make them reliable.",
      },
      { status: 404 },
    );
  }
  const { id } = memberIdFrom(req);
  return NextResponse.json({
    code: group.code,
    label: group.label,
    hour: group.hour,
    durable: groupsDurable,
    full: group.members.length >= MAX_MEMBERS,
    youAreIn: group.members.some((m) => m.id === id),
    decidedPlaceId: group.decidedPlaceId,
    /* PUBLIC handles, never raw ids. The raw member id doubles as the key to
       that device's saved list, and this response goes to anyone who has the
       six-character code — which is exactly the population "share this link"
       is designed to grow. */
    members: group.members.map((m) => ({ id: publicMemberId(m.id), name: m.name, seeded: m.seeded })),
  });
}
