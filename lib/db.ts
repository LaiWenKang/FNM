import { neon } from "@neondatabase/serverless";
import type { Profile } from "@/lib/profile-shape";

// Server-side profile storage for signed-in users.
//
// WHERE USER DATA LIVES:
//   • Signed out (or no DATABASE_URL) → the taste profile stays in an httpOnly
//     cookie on the user's own device. Nothing leaves the phone.
//   • Signed in with DATABASE_URL set  → the profile is stored in one row of a
//     Postgres table keyed by the Google account id, so it follows the user
//     across devices. Recommended: Neon/Supabase in the Singapore region.
//
// Stored per user: the six-dimension flavour vector, swipe count, distance and
// budget settings, and recent meals. No location history, no payment data.

const url = process.env.DATABASE_URL;
export const dbConfigured = Boolean(url);

const sql = url ? neon(url) : null;
let ready: Promise<void> | null = null;

/** Create the table on first use so there is no migration step to run. */
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id    TEXT PRIMARY KEY,
        profile    JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })().catch((e) => {
    /* NEVER CACHE THE REJECTION. `??=` memoises whatever the first attempt
       produced — including a rejected promise from one cold-start timeout,
       which would then be re-thrown to every caller for the LIFE of the
       instance: hours of "database down" caused by one bad second. Reset so
       the next request simply tries again. (The same pattern is used by every
       ensureSchema in this codebase; this comment lives here once.) */
    ready = null;
    throw e;
  });
  return ready;
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  if (!sql) return null;
  try {
    await ensureSchema();
    const rows = (await sql`SELECT profile FROM profiles WHERE user_id = ${userId}`) as {
      profile: Profile;
    }[];
    return rows[0]?.profile ?? null;
  } catch {
    return null; // never let a storage hiccup break a recommendation
  }
}

export async function storeProfile(userId: string, profile: Profile): Promise<void> {
  if (!sql) return;
  try {
    await ensureSchema();
    await sql`
      INSERT INTO profiles (user_id, profile, updated_at)
      VALUES (${userId}, ${JSON.stringify(profile)}, now())
      ON CONFLICT (user_id)
      DO UPDATE SET profile = EXCLUDED.profile, updated_at = now()
    `;
  } catch {
    /* ignore — the cookie copy still carries the session */
  }
}

export async function deleteProfile(userId: string): Promise<void> {
  if (!sql) return;
  try {
    await ensureSchema();
    await sql`DELETE FROM profiles WHERE user_id = ${userId}`;
  } catch {
    /* ignore */
  }
}
