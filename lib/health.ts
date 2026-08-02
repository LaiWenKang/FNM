import { neon } from "@neondatabase/serverless";

// ═══ WHY NOTHING WORKS, WHEN NOTHING WORKS ════════════════════════════════
//
// This app degrades gracefully everywhere. Every external call — the model,
// Google Places, the database — sits inside a `catch` that returns null or an
// empty array, and the caller falls back to a local path that works fine. That
// is genuinely the right design: nobody should lose their lunch recommendation
// because a vendor is having an afternoon.
//
// It also meant the app could not tell you it was broken. lib/llm.ts said so
// in its own comment — "a dead API key looks exactly like never having set
// one" — and lib/places.ts had the same hole one line long: `if (!res.ok)
// return []`, so a 403 from a mis-restricted key was indistinguishable from
// "there are no restaurants near you". Before this file there were ZERO
// console statements in the entire codebase. A revoked key, a blown quota, a
// billing lapse and a correct zero-key install all produced identical, silent,
// plausible-looking output.
//
// TWO DIFFERENT QUESTIONS, and the whole point is to stop conflating them:
//
//   CONFIGURED   Is the key present? Reading an env var answers this, and it
//                is the answer every naive status page gives.
//   WORKING      Is the key ACCEPTED? Only a real call answers this, and it is
//                the only one that matters. A status page reporting
//                "GEMINI_API_KEY: set ✓" the day after the key was revoked is
//                worse than no status page, because it is confidently wrong.
//
// So health is recorded from actual outcomes, at the call sites, and a
// subsystem that has never been asked anything reports "unknown" rather than
// pretending to be healthy.
//
// TWO PLACES, because neither alone is enough. `console.error` with a stable
// prefix is durable and lands in the platform log, but reading it means having
// a laptop and a Vercel dashboard. A row in Postgres survives the serverless
// instance that produced it and can be read back over HTTPS from a phone,
// which is how this app's author actually operates.

export type Subsystem = "llm" | "places" | "db";

/** What went wrong, in the only categories worth different reactions. */
export type Fault =
  /** The key was rejected. Revoked, mistyped, or restricted to another API. */
  | "auth"
  /** Too many requests. Comes back on its own. */
  | "rate-limit"
  /** The free tier or the billing cap is spent. Does NOT come back on its own. */
  | "quota"
  /** Took too long. Usually the network, sometimes the vendor. */
  | "timeout"
  /** The vendor is down. Nothing to fix on this end. */
  | "upstream"
  /** A 200 that could not be used — empty, truncated, unparseable. */
  | "bad-response"
  /* THE MODEL NAME, NOT THE CREDENTIAL. Found by the status panel on a real
     deployment: the key was neither rejected nor out of quota, and the fault
     came back "unknown" — which tells somebody nothing they can act on. A
     model that does not exist for a given key is a CONFIGURATION mistake with
     a completely different fix from a dead key, and it deserves its own word. */
  | "not-found"
  | "unknown";

/**
 * Turn a thrown thing or an HTTP status into one of the categories above.
 *
 * Deliberately duck-typed rather than importing each SDK's error class: the
 * Anthropic SDK, the Google one and a bare `fetch` all express "429" in
 * different shapes, and none of the distinctions between those shapes matter
 * to someone trying to work out why their app went quiet.
 */
export function classify(e: unknown, status?: number): Fault {
  const code = status ?? httpStatus(e);
  const msg = (e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "")).toLowerCase();

  /* THE MESSAGE IS READ BEFORE THE STATUS CODE IS TRUSTED, and specifically
     because of this case: Google returns 429 for BOTH a burst limit and an
     exhausted free tier. Short-circuiting on the code alone reported a spent
     daily quota as a transient rate limit — "wait a minute" when the truth is
     "you are done until tomorrow, or until you add a card". On the free tier
     this app recommends, that is the single most likely real failure. */
  const quota = msg.includes("quota") || msg.includes("exhausted") || msg.includes("billing");
  if (quota) return "quota";

  if (code === 401 || code === 403) return "auth";
  if (code === 429) return "rate-limit";
  if (code === 404) return "not-found";
  if (code !== undefined && code >= 500) return "upstream";

  if (!msg) return "unknown";
  // Vendors phrase a missing model several ways and rarely with a 404.
  if (
    msg.includes("not found") ||
    msg.includes("does not exist") ||
    msg.includes("is not supported") ||
    msg.includes("unsupported model") ||
    msg.includes("unknown model")
  ) {
    return "not-found";
  }
  if (msg.includes("rate") && msg.includes("limit")) return "rate-limit";
  if (msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("api key") || msg.includes("api_key") || msg.includes("unauthor") || msg.includes("permission")) {
    return "auth";
  }
  return "unknown";
}

function httpStatus(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const bag = e as Record<string, unknown>;
  for (const k of ["status", "statusCode", "code"]) {
    const v = bag[k];
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  // The Google SDK nests it, and sometimes only stringifies it.
  const nested = bag.error;
  if (typeof nested === "object" && nested !== null) {
    const v = (nested as Record<string, unknown>).code;
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  return undefined;
}

/* ── THIS INSTANCE'S TALLY ────────────────────────────────────────────────
   Cheap, immediate, and honest about its scope: serverless instances come and
   go, so these counters describe ONE instance since it booted, not the
   deployment. The report labels them as such rather than letting a reader
   mistake a cold start for a clean bill of health. */

interface Tally {
  ok: number;
  failed: number;
  last: { fault: Fault; detail: string; at: number } | null;
}

const tallies = new Map<Subsystem, Tally>();

function tally(sub: Subsystem): Tally {
  let t = tallies.get(sub);
  if (!t) tallies.set(sub, (t = { ok: 0, failed: 0, last: null }));
  return t;
}

/** A call that worked. Cheap enough to record on every success. */
export function noteOk(sub: Subsystem): void {
  tally(sub).ok += 1;
}

/**
 * A call that failed. Logs immediately, persists at most once a minute per
 * kind — a dead key fails on every request, and writing a row each time would
 * turn an outage into a second, self-inflicted one.
 */
export function noteFault(sub: Subsystem, fault: Fault, detail = ""): void {
  const t = tally(sub);
  t.failed += 1;
  const at = Date.now();
  // ONE LINE, ALWAYS. Vendors answer with pretty-printed JSON, and a log line
  // that wraps across twelve lines is not greppable — which was the entire
  // point of giving it a prefix.
  const flat = detail.replace(/\s+/g, " ").trim().slice(0, 200);
  t.last = { fault, detail: flat, at };

  // A STABLE, GREPPABLE PREFIX. The platform log is the one record that
  // survives everything, including the database this file also writes to.
  console.error(`[fnm] ${sub} ${fault}${flat ? `: ${flat}` : ""}`);

  void persist(sub, fault, flat, at);
}

/**
 * Has this subsystem failed every time it has been asked, on this instance?
 *
 * A CIRCUIT BREAKER, and the reason the health tally is worth more than a
 * dashboard. A revoked model key does not fail cheaply: every optional
 * enrichment still queues a request, waits for the rejection, and logs it —
 * so a dead credential quietly taxes every recommendation for work that
 * cannot possibly succeed.
 *
 * Deliberately strict. One failure proves nothing (a timeout happens), and a
 * subsystem with even a single success is working. Only "asked repeatedly,
 * never once answered" trips it, and it resets when the instance recycles —
 * so a key fixed at noon starts being used again within minutes rather than
 * needing a deploy.
 */
export function isFailing(sub: Subsystem, after = 3): boolean {
  const t = tallies.get(sub);
  return !!t && t.ok === 0 && t.failed >= after;
}

/** Reset the instance tally. Tests only. */
export function clearHealth(): void {
  tallies.clear();
  lastWrite.clear();
}

/* ── THE DURABLE RECORD ───────────────────────────────────────────────────*/

const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;
export const healthDurable = Boolean(url);

const THROTTLE_MS = 60_000;
const lastWrite = new Map<string, number>();

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS incidents (
        id        BIGSERIAL PRIMARY KEY,
        subsystem TEXT NOT NULL,
        fault     TEXT NOT NULL,
        detail    TEXT NOT NULL DEFAULT '',
        at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS incidents_at ON incidents (at)`;
  })();
  return ready;
}

async function persist(sub: Subsystem, fault: Fault, detail: string, at: number): Promise<void> {
  if (!sql) return;
  const key = `${sub}:${fault}`;
  const prev = lastWrite.get(key) ?? 0;
  if (at - prev < THROTTLE_MS) return;
  lastWrite.set(key, at);
  try {
    await ensureSchema();
    await sql`
      INSERT INTO incidents (subsystem, fault, detail)
      VALUES (${sub}, ${fault}, ${detail.slice(0, 200)})
    `;
  } catch {
    /* the console line above is already the durable record */
  }
}

/* ── READING IT BACK ──────────────────────────────────────────────────────*/

/** What an operator should DO about a subsystem, in one word. */
export type Verdict =
  /** No key configured. Working as intended, not a fault. */
  | "off"
  /** Configured, and calls are succeeding. */
  | "healthy"
  /** Configured, some calls succeeding and some not. */
  | "degraded"
  /** Configured, and nothing is getting through. THE ONE THAT NEEDS A HUMAN. */
  | "failing"
  /** Configured, but nothing has been asked of it yet on this instance. */
  | "unknown";

export interface SubsystemHealth {
  configured: boolean;
  verdict: Verdict;
  /** Which vendor is selected, where there is a choice. */
  provider?: string;
  /** Since this serverless instance booted — NOT deployment-wide. */
  thisInstance: { ok: number; failed: number };
  lastFault: { fault: Fault; detail: string; at: string } | null;
  /** Durable, deployment-wide, from the incidents table. */
  recent: { fault: Fault; count: number; last: string }[];
}

/**
 * The verdict rule, kept separate from the I/O so it can be tested directly.
 *
 * "Not configured" is deliberately NOT a fault: the zero-key install is a
 * supported mode and the one the whole test suite runs in. And a subsystem
 * nobody has called yet is "unknown", never "healthy" — inferring health from
 * an absence of evidence is the exact mistake this file exists to stop.
 */
export function verdictFor(configured: boolean, ok: number, failed: number): Verdict {
  if (!configured) return "off";
  if (ok === 0 && failed === 0) return "unknown";
  if (failed === 0) return "healthy";
  if (ok === 0) return "failing";
  return "degraded";
}

export interface HealthReport {
  /** False when incidents are console-only and vanish with the instance. */
  durable: boolean;
  windowHours: number;
  subsystems: Record<Subsystem, SubsystemHealth>;
}

type IncidentRow = { subsystem: string; fault: Fault; at: string; count: number | string };

/** Fold durable incident rows into each subsystem's report. Pure, so testable. */
export function foldIncidents(
  base: Record<Subsystem, SubsystemHealth>,
  rows: IncidentRow[],
): Record<Subsystem, SubsystemHealth> {
  for (const r of rows) {
    const sub = base[r.subsystem as Subsystem];
    if (!sub) continue;
    sub.recent.push({ fault: r.fault, count: Number(r.count), last: r.at });
    /* A DURABLE INCIDENT OUTRANKS A QUIET INSTANCE. This one is the whole
       reason the table exists: the instance answering the status request is
       usually not the instance that hit the dead key, so a cold box would
       otherwise report a serene "unknown" while every other box in the fleet
       is failing on the same revoked credential. */
    if (sub.configured && sub.thisInstance.ok === 0) sub.verdict = "failing";
  }
  return base;
}

export async function health(
  configured: { llm: boolean; places: boolean; db: boolean; llmProvider?: string },
  windowHours = 24,
): Promise<HealthReport> {
  const build = (sub: Subsystem, isOn: boolean, provider?: string): SubsystemHealth => {
    const t = tally(sub);
    return {
      configured: isOn,
      verdict: verdictFor(isOn, t.ok, t.failed),
      ...(provider ? { provider } : {}),
      thisInstance: { ok: t.ok, failed: t.failed },
      lastFault: t.last
        ? { fault: t.last.fault, detail: t.last.detail, at: new Date(t.last.at).toISOString() }
        : null,
      recent: [],
    };
  };

  const subsystems: Record<Subsystem, SubsystemHealth> = {
    llm: build("llm", configured.llm, configured.llmProvider),
    places: build("places", configured.places),
    db: build("db", configured.db),
  };

  if (!sql) return { durable: false, windowHours, subsystems };

  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT subsystem, fault, COUNT(*) AS count, MAX(at) AS at
      FROM incidents
      WHERE at > now() - make_interval(hours => ${windowHours}::int)
      GROUP BY subsystem, fault
      ORDER BY count DESC
    `) as IncidentRow[];
    return { durable: true, windowHours, subsystems: foldIncidents(subsystems, rows) };
  } catch {
    // The database is itself a subsystem, so a failure here IS the finding.
    subsystems.db.verdict = "failing";
    return { durable: false, windowHours, subsystems };
  }
}
