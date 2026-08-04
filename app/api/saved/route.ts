import { NextRequest, NextResponse } from "next/server";
import { memberIdFrom, setMemberCookie } from "@/lib/member";
import { clientKey, rateLimited } from "@/lib/ratelimit";
import { currentUserId } from "@/lib/profile";
import {
  addSaved,
  importPost,
  listSaved,
  markVisited,
  removeSaved,
  savedDurable,
} from "@/lib/social";

export const dynamic = "force-dynamic";

/**
 * The saved list belongs to the ACCOUNT when there is one and to the DEVICE
 * otherwise — the same rule the taste profile follows, so a user never has to
 * hold two different mental models of where their data lives.
 */
async function ownerFor(req: NextRequest): Promise<{ id: string; isNew: boolean }> {
  const userId = await currentUserId();
  if (userId) return { id: `u:${userId}`, isNew: false };
  const { id, isNew } = memberIdFrom(req);
  return { id: `d:${id}`, isNew };
}

export async function GET(req: NextRequest) {
  const { id } = await ownerFor(req);
  const posts = await listSaved(id);
  return NextResponse.json({ posts, durable: savedDurable });
}

/** POST { text, lat, lng } — paste a share blob, get back a resolved place. */
export async function POST(req: NextRequest) {
  // Each import spends a paid text search and usually a model call. Ten a
  // minute is faster than anyone can paste; a script can wait.
  if (rateLimited(`saved:${clientKey(req)}`, 10)) {
    return NextResponse.json(
      { error: "Slow down a moment — imports are limited to a few per minute." },
      { status: 429 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    lat?: number;
    lng?: number;
  };
  const text = (body.text ?? "").slice(0, 2000).trim();
  if (!text) return NextResponse.json({ error: "Nothing pasted." }, { status: 400 });

  const near = {
    lat: Number.isFinite(body.lat) ? (body.lat as number) : 1.2837,
    lng: Number.isFinite(body.lng) ? (body.lng as number) : 103.8515,
  };

  const result = await importPost(text, near);
  if ("error" in result) return NextResponse.json(result, { status: 422 });

  const { id, isNew } = await ownerFor(req);
  await addSaved(id, result);

  const res = NextResponse.json({ post: result, durable: savedDurable });
  if (isNew) setMemberCookie(res, id.slice(2));
  return res;
}

/** PATCH { id } — mark as eaten, so it stops nagging from the want-to-try list. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id } = await ownerFor(req);
  await markVisited(id, body.id.slice(0, 40));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id } = await ownerFor(req);
  await removeSaved(id, body.id.slice(0, 40));
  return NextResponse.json({ ok: true });
}
