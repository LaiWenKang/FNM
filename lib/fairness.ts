import { neon } from "@neondatabase/serverless";

// ═══ WHOSE TURN IS IT ═════════════════════════════════════════════════════
//
// The group blend picks what suits everyone best on average with a floor under
// the least-happy person. Run it once and it is fair. Run it every Tuesday
// with the same five people and it is not: whoever's taste sits furthest from
// the group's centre is the least-happy member EVERY time, by construction.
// The maths has no memory, so it re-derives the same loser each week and calls
// it optimal.
//
// So the group remembers. Each locked-in meal records how far below the day's
// average each member was served, and that debt tilts the next decision toward
// whoever has been carrying it. This is the fairness rotation PLAN.md defers to
// Phase 3 — it needed exactly this history to exist, and now it does.
//
// DEBT DECAYS. Being short-changed last Tuesday should count; being
// short-changed in March should not. A fortnight's half-life means the rotation
// tracks the current crew's recent meals rather than accumulating a grudge.
//
// TWO TIERS, as everywhere else. With DATABASE_URL the ledger survives; without
// it, serverless instances do not share memory and the rotation quietly becomes
// a no-op — so `fairnessDurable` is exported and surfaced rather than hidden.
// A fairness feature that silently is not working is worse than none, because
// the group believes it is being taken care of.

const url = process.env.DATABASE_URL;
export const fairnessDurable = Boolean(url);
const sql = url ? neon(url) : null;

/** How long a slight keeps counting for. */
export const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
/** Debts older than this are dropped entirely rather than decayed forever. */
export const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/** A debt this size earns the full tilt; see weightFor. */
export const FULL_TILT_AT = 12;
/** The most a debt can inflate one member's say in the average. */
export const MAX_TILT = 0.6;

interface Entry {
  memberId: string;
  /** Points below the meal's average this member was served. Negative = above. */
  deficit: number;
  at: number;
}

const memory: Entry[] = [];

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS group_fairness (
        member_id TEXT NOT NULL,
        deficit   REAL NOT NULL,
        at        BIGINT NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS group_fairness_member ON group_fairness (member_id)`;
  })().catch((e) => {
    // Never cache the rejection - see the note in lib/db.ts ensureSchema.
    ready = null;
    throw e;
  });
  return ready;
}

/**
 * Record one decided meal.
 *
 * The deficit is measured against the meal's OWN average rather than an
 * absolute score, because a meal where everybody scored badly is not unfair to
 * anyone — it was just a thin day for options. What matters is who did worse
 * than the people they were standing next to.
 */
export async function recordMeal(
  scores: { memberId: string; score: number }[],
  at: number = Date.now(),
): Promise<void> {
  if (scores.length < 2) return; // nobody can be short-changed on their own
  const mean = scores.reduce((t, s) => t + s.score, 0) / scores.length;
  const entries: Entry[] = scores.map((s) => ({ memberId: s.memberId, deficit: mean - s.score, at }));

  if (sql) {
    try {
      await ensureSchema();
      for (const e of entries) {
        await sql`INSERT INTO group_fairness (member_id, deficit, at) VALUES (${e.memberId}, ${e.deficit}, ${e.at})`;
      }
      return;
    } catch {
      /* fall through to memory so the current session still behaves */
    }
  }
  memory.push(...entries);
  const cutoff = at - MAX_AGE_MS;
  for (let i = memory.length - 1; i >= 0; i -= 1) if (memory[i].at < cutoff) memory.splice(i, 1);
}

/** Sum the decayed debts each member is owed. Never negative — see below. */
export async function debts(
  memberIds: string[],
  now: number = Date.now(),
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of memberIds) out[id] = 0;
  if (!memberIds.length) return out;

  let rows: Entry[] = [];
  if (sql) {
    try {
      await ensureSchema();
      const got = (await sql`
        SELECT member_id, deficit, at FROM group_fairness
        WHERE member_id = ANY(${memberIds}) AND at > ${now - MAX_AGE_MS}
      `) as { member_id: string; deficit: number; at: number }[];
      rows = got.map((r) => ({ memberId: r.member_id, deficit: Number(r.deficit), at: Number(r.at) }));
    } catch {
      rows = [];
    }
  } else {
    rows = memory.filter((e) => memberIds.includes(e.memberId) && e.at > now - MAX_AGE_MS);
  }

  for (const r of rows) {
    if (out[r.memberId] === undefined) continue;
    out[r.memberId] += r.deficit * 2 ** (-(now - r.at) / HALF_LIFE_MS);
  }
  // A CREDIT IS NOT A DEBT. Somebody who has been served WELL should simply
  // stop being owed anything — they should not be actively penalised, which
  // would turn a rotation into a punishment and make the group's best-matched
  // member dread their own turn coming round.
  for (const id of memberIds) out[id] = Math.max(0, out[id]);
  return out;
}

/**
 * A member's say in the group average, given what they are owed.
 *
 * Bounded at +60%, and bounded on purpose. Fairness rotation should tilt a
 * close call toward whoever has been losing them, not hand one person a veto
 * because they had a bad Tuesday — that would just relocate the unfairness.
 */
export function weightFor(debt: number): number {
  return 1 + MAX_TILT * Math.min(1, Math.max(0, debt) / FULL_TILT_AT);
}

/** Only reset by tests; the ledger is otherwise append-only. */
export function clearMemoryLedger(): void {
  memory.length = 0;
}
