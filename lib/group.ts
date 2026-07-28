import { neon } from "@neondatabase/serverless";
import { Context } from "@/lib/context";
import { Place } from "@/lib/data/seed";
import { DIMS, FlavorVector, neutralVector } from "@/lib/flavor";
import { Profile, defaultProfile } from "@/lib/profile";
import { ScoredPlace, recommend } from "@/lib/scoring";

// ═══ THE GROUP DECISION ═══════════════════════════════════════════════════
//
// One person opens a group, sends the link, and everyone who taps it lands on
// the same decision. This is the feature the whole product is FOR: deciding
// alone is a convenience, deciding as a group in under a minute is the thing
// that is actually hard, and it is why anyone forwards the link at all.
//
// THE HARD PART IS NOT THE PLUMBING, IT IS THE MATH. Averaging six flavour
// vectors produces a bland centroid that nobody asked for: average a person who
// wants fire with a person who wants congee and you recommend lukewarm porridge
// to two disappointed people. See groupScore below.

const url = process.env.DATABASE_URL;
export const groupsDurable = Boolean(url);
const sql = url ? neon(url) : null;

export interface Member {
  id: string;
  name: string;
  vector: FlavorVector;
  /** Their own ceiling. The group's ceiling is the LOWEST of these. */
  maxKm: number;
  priceMax: 1 | 2 | 3 | 4;
  /** False until they have actually expressed a taste, so the lobby can show
      who the app can and cannot steer for yet. */
  seeded: boolean;
  joinedAt: number;
}

export interface Group {
  code: string;
  createdAt: number;
  lat: number;
  lng: number;
  label: string;
  hour: number | null;
  members: Member[];
  /** Set once someone commits, so latecomers see the decision, not the lobby. */
  decidedPlaceId: string | null;
}

export const GROUP_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_MEMBERS = 12;

/* ── CODE ─────────────────────────────────────────────────────────────────
   Six characters from an alphabet with no 0/O/1/I/L, because these get read
   aloud across a table and typed by hand at least as often as they get
   tapped. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/* ── STORAGE ──────────────────────────────────────────────────────────────
   Postgres when DATABASE_URL is set. Otherwise an in-process map, which is a
   REAL limitation and not a silent one: serverless instances do not share
   memory, so a group created on one instance can be invisible to a friend
   routed to another. `groupsDurable` is surfaced in the UI so the host is told
   this before they send the link, rather than discovering it when someone
   cannot join. A lunch decision lives about four minutes, so the fallback is
   usually survivable — but "usually" is not something to hide. */
const memory = new Map<string, Group>();

function sweep(): void {
  const cutoff = Date.now() - GROUP_TTL_MS;
  for (const [code, g] of memory) if (g.createdAt < cutoff) memory.delete(code);
}

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS groups (
        code       TEXT PRIMARY KEY,
        data       JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })();
  return ready;
}

export async function loadGroup(code: string): Promise<Group | null> {
  if (sql) {
    try {
      await ensureSchema();
      const rows = (await sql`SELECT data FROM groups WHERE code = ${code}`) as { data: Group }[];
      const g = rows[0]?.data ?? null;
      if (g && Date.now() - g.createdAt > GROUP_TTL_MS) return null;
      return g;
    } catch {
      return null;
    }
  }
  sweep();
  return memory.get(code) ?? null;
}

export async function saveGroup(group: Group): Promise<void> {
  if (sql) {
    try {
      await ensureSchema();
      await sql`
        INSERT INTO groups (code, data) VALUES (${group.code}, ${JSON.stringify(group)}::jsonb)
        ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data
      `;
      return;
    } catch {
      /* fall through to memory so the group still works this request */
    }
  }
  sweep();
  memory.set(group.code, group);
}

/* ── THE MATH ─────────────────────────────────────────────────────────────
   Two failure modes, and they pull in opposite directions:

     THE BLAND CENTROID   Average everyone's vector and you get a dish nobody
                          chose. Two people at opposite ends of `heat` average
                          to medium, which is the one temperature neither of
                          them wanted.
     THE TYRANNY OF ONE   Optimise purely for the least-happy member and one
                          fussy eater silently dictates lunch for six.

   So the group score blends the MEAN with the MINIMUM. The mean keeps the pick
   broadly good; the minimum floor stops the group choosing something one person
   actively cannot eat. 0.6/0.4 sits closer to the mean than a pure
   least-misery rule but still lets one strong objection sink a candidate.

   The distance and budget ceilings are NOT averaged — they are the strictest
   member's. Somebody who said 800 m does not get walked two kilometres because
   four other people were relaxed about it, and somebody on a hawker budget does
   not get taken somewhere they cannot afford. Those are constraints, not
   preferences, and averaging a constraint breaks it. */
export const MEAN_W = 0.6;
export const MIN_W = 0.4;

export interface GroupPick {
  place: Place;
  groupScore: number;
  meanScore: number;
  minScore: number;
  /** The member the pick serves worst, so the UI can be honest about it. */
  weakestMemberName: string | null;
  perMember: { id: string; name: string; score: number }[];
}

function memberProfile(m: Member, base: Profile): Profile {
  return { ...base, vector: m.vector, maxKm: m.maxKm, priceMax: m.priceMax };
}

export function groupVector(members: Member[]): FlavorVector {
  const seeded = members.filter((m) => m.seeded);
  if (!seeded.length) return neutralVector();
  const out = neutralVector();
  for (const dim of DIMS) {
    out[dim] = seeded.reduce((sum, m) => sum + m.vector[dim], 0) / seeded.length;
  }
  return out;
}

/**
 * Score every open candidate for every member, then rank by the blend. Members
 * who have not seeded a palate are excluded from the math entirely rather than
 * folded in as neutral — a neutral vector is not a preference, and counting it
 * as one would drag every candidate toward the middle exactly the way the
 * bland-centroid failure does.
 */
export function decideForGroup(
  group: Group,
  places: Place[],
  ctx: Context,
): GroupPick[] {
  const voters = group.members.filter((m) => m.seeded);
  if (!voters.length) return [];

  const base = defaultProfile();
  const origin = { lat: group.lat, lng: group.lng };

  // The strictest ceilings in the group become everyone's ceilings.
  const maxKm = Math.min(...voters.map((m) => m.maxKm));
  const priceMax = Math.min(...voters.map((m) => m.priceMax)) as 1 | 2 | 3 | 4;

  // One pass per member over the same candidate pool, keyed by place id.
  const byPlace = new Map<string, { place: Place; scores: Map<string, number> }>();
  for (const m of voters) {
    const profile = { ...memberProfile(m, base), maxKm, priceMax };
    const scored = scoreAll(profile, places, ctx, origin);
    for (const s of scored) {
      const entry = byPlace.get(s.place.id) ?? { place: s.place, scores: new Map() };
      entry.scores.set(m.id, s.matchScore);
      byPlace.set(s.place.id, entry);
    }
  }

  const picks: GroupPick[] = [];
  for (const { place, scores } of byPlace.values()) {
    // A candidate has to clear the filters for EVERY voter. If it is shut, too
    // far or too expensive for one person, it is not a group option.
    if (scores.size !== voters.length) continue;
    const values = [...scores.values()];
    const meanScore = values.reduce((a, b) => a + b, 0) / values.length;
    const minScore = Math.min(...values);
    let weakestId: string | null = null;
    for (const [id, v] of scores) if (v === minScore) { weakestId = id; break; }
    picks.push({
      place,
      groupScore: Math.round(MEAN_W * meanScore + MIN_W * minScore),
      meanScore: Math.round(meanScore),
      minScore,
      weakestMemberName: voters.find((m) => m.id === weakestId)?.name ?? null,
      perMember: voters.map((m) => ({
        id: m.id,
        name: m.name,
        score: scores.get(m.id) ?? 0,
      })),
    });
  }
  picks.sort((a, b) => b.groupScore - a.groupScore);
  return picks;
}

/**
 * `recommend()` returns only best/safer/adventurous, which is the right shape
 * for one person and the wrong one here — the group needs every candidate's
 * score, not three of them. This runs the same pipeline and keeps the whole
 * ranked list by asking for it one exclusion at a time.
 */
function scoreAll(
  profile: Profile,
  places: Place[],
  ctx: Context,
  origin: { lat: number; lng: number },
): ScoredPlace[] {
  const out: ScoredPlace[] = [];
  const exclude: string[] = [];
  // Bounded by the candidate pool, and the pool is capped at 20 live results
  // plus the curated catalogue.
  for (let i = 0; i < places.length; i += 1) {
    const rec = recommend(profile, places, ctx, origin, exclude);
    if (!rec) break;
    for (const s of [rec.best, rec.safer, rec.adventurous]) {
      if (s && !exclude.includes(s.place.id)) {
        out.push(s);
        exclude.push(s.place.id);
      }
    }
  }
  return out;
}
