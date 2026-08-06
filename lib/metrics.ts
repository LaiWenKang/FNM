import { NextRequest, after } from "next/server";
import { neon } from "@neondatabase/serverless";
import { classify, noteFault, noteOk } from "@/lib/health";
import { memberIdFrom } from "@/lib/member";

// ═══ THE SIX NUMBERS IN PLAN.md, MADE REAL ════════════════════════════════
//
// PLAN.md §6 names six success metrics. Not one of them was measurable: there
// was no instrumentation of any kind, so the product could have been working
// beautifully or failing quietly and nobody could tell which. Every decision
// about what to build next was being made on taste alone.
//
// NO THIRD PARTY. The obvious move is to drop in an analytics SDK, and it is
// the wrong one here. §5 of the same plan says a signed-out profile never
// leaves the device; shipping behavioural data to a vendor the moment we want
// a retention chart would contradict that on the first day it mattered. The
// database is already there and already holds the group and fairness tables,
// so the events live in it. Nothing leaves the deployment.
//
// WHAT IS RECORDED: an opaque device id, an event name, a timestamp, and a few
// small numbers. The device id is the same random cookie value the group links
// use — it identifies a browser, not a person, and carries no name, email,
// location or restaurant history. There is no way to work backwards from this
// table to who somebody is.
//
// FIRE AND FORGET. `track` is never awaited by a request that matters and can
// never throw. A metrics write failing must not cost a user their lunch
// recommendation, so every failure is swallowed — the number is worth less
// than the meal.

const url = process.env.DATABASE_URL;
export const metricsEnabled = Boolean(url);
const sql = url ? neon(url) : null;

/** Every event the app records. Deliberately a closed list. */
export type MetricEvent =
  /** A recommendation was served. The denominator for most of the rest. */
  | "served"
  /** The diner committed to a place. `slot` says which of the three. */
  | "picked"
  /** "Not feeling it" — `reason` when they gave one. */
  | "rejected"
  /** Everything nearby was turned down. THE FAILURE SIGNAL. */
  | "dead_end"
  /** A verdict came back after the meal. `verdict` says which. */
  | "rated"
  | "group_created"
  | "group_joined"
  | "group_decided"
  /** Calibration finished. */
  | "calibrated";

export interface MetricProps {
  /** Which of best / safer / adventurous was taken. */
  slot?: "best" | "safer" | "adventurous";
  /** Page load to commit. The "median decision time" metric. */
  decisionMs?: number;
  reason?: string;
  verdict?: string;
  /** How many people were in the group. */
  members?: number;
}

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id        BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        event     TEXT NOT NULL,
        props     JSONB NOT NULL DEFAULT '{}'::jsonb,
        at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS events_at ON events (at)`;
    await sql`CREATE INDEX IF NOT EXISTS events_device ON events (device_id, at)`;
  })().catch((e) => {
    // Never cache the rejection - see the note in lib/db.ts ensureSchema.
    ready = null;
    throw e;
  });
  return ready;
}

/**
 * Record one event. Never throws, never blocks anything that matters.
 *
 * Deliberately NOT awaited at most call sites — the returned promise is there
 * for tests. In a request handler, letting a metrics round-trip sit between a
 * user and their answer would be trading the product for the dashboard.
 */
export async function track(
  req: NextRequest,
  event: MetricEvent,
  props: MetricProps = {},
): Promise<void> {
  if (!sql) return;
  try {
    await ensureSchema();
    const { id } = memberIdFrom(req);
    await sql`
      INSERT INTO events (device_id, event, props)
      VALUES (${id}, ${event}, ${JSON.stringify(props)}::jsonb)
    `;
    noteOk("db");
  } catch (e) {
    /* Still swallowed — a lost event is not worth a failed request. But no
       longer INVISIBLE: a database that has stopped accepting writes takes the
       metrics down with it, and "the numbers are all zero" would otherwise be
       indistinguishable from a quiet week. */
    noteFault("db", classify(e), e instanceof Error ? e.message : String(e));
  }
}

/**
 * Fire-and-forget WITHOUT the forget. Every route used to write `void
 * track(...)`, which on a serverless platform is a quiet way to lose the
 * event: the instance freezes the moment the response is sent, and work that
 * was merely un-awaited never runs. `after()` tells the platform to keep the
 * function alive until the write settles — the response still goes out first,
 * so the user pays nothing for the dashboard.
 */
export function trackLater(req: NextRequest, event: MetricEvent, props: MetricProps = {}): void {
  const write = track(req, event, props); // never rejects — see track()
  try {
    after(write);
  } catch {
    // Outside a request scope (tests, scripts) there is no instance about to
    // freeze, so the un-awaited promise is genuinely fine.
    void write;
  }
}

/* ── READING IT BACK ──────────────────────────────────────────────────────
   One function per line of PLAN.md §6, so the answer to "is this working" is
   a query rather than an argument. */

export interface Metrics {
  /** Days of data behind these numbers. */
  windowDays: number;
  /**
   * HOW MANY PEOPLE, which every other number here is a rate ON and which the
   * report could not previously state. Distinct devices seen in the window —
   * the honest unit, because a signed-out diner is a browser, not an account:
   * one person on a phone and a laptop counts twice, and a cleared cookie
   * starts over. It is a floor on reach, not a headcount, and a rate without
   * it is unreadable — 100% pick rate off two events is not a good week.
   */
  activeDevices: number;
  /** Of those, how many were still turning up a week or more later. */
  returningDevices: number;
  /** PRIMARY METRIC: successful food decisions per active user per week. */
  decisionsPerActiveUserPerWeek: number | null;
  /** Median seconds from opening the pick screen to committing. */
  medianDecisionSeconds: number | null;
  /** Of served recommendations, how many ended in a commit. */
  pickRate: number | null;
  /** Of commits, how many took the TOP pick rather than an alternative. */
  topPickShare: number | null;
  /** FAILURE SIGNAL: served recommendations that ended in a dead end. */
  deadEndRate: number | null;
  /** Devices that came back in a later week than their first. */
  fourWeekRetention: number | null;
  /** Of group decisions, how many were locked in rather than abandoned. */
  groupCompletionRate: number | null;
  /** How the meals were actually rated. */
  verdicts: { again: number; fine: number; no: number };
  totalEvents: number;
}

const EMPTY: Metrics = {
  windowDays: 0,
  activeDevices: 0,
  returningDevices: 0,
  decisionsPerActiveUserPerWeek: null,
  medianDecisionSeconds: null,
  pickRate: null,
  topPickShare: null,
  deadEndRate: null,
  fourWeekRetention: null,
  groupCompletionRate: null,
  verdicts: { again: 0, fine: 0, no: 0 },
  totalEvents: 0,
};

/** A ratio, or null when the denominator is too small to mean anything. */
export function rate(numerator: number, denominator: number, min = 1): number | null {
  if (denominator < min) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/** The middle value, or null for an empty set. Median, not mean: one person
    who left the app open over lunch would drag an average badly. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

interface Row {
  device_id: string;
  event: MetricEvent;
  props: MetricProps;
  at: string;
}

/** Compute every PLAN.md metric from the raw rows. Pure, so it is testable. */
export function summarise(rows: Row[], windowDays: number): Metrics {
  if (!rows.length) return { ...EMPTY, windowDays };

  const of = (e: MetricEvent) => rows.filter((r) => r.event === e);
  const served = of("served").length;
  const picked = of("picked");
  const devices = new Set(rows.map((r) => r.device_id));

  const weeks = Math.max(1, windowDays / 7);
  const verdicts = { again: 0, fine: 0, no: 0 };
  for (const r of of("rated")) {
    const v = r.props.verdict;
    if (v === "again" || v === "fine" || v === "no") verdicts[v] += 1;
  }

  // Retention: a device whose first and last events fall in different weeks
  // came back. Cruder than a cohort table and honest about being so.
  const firstLast = new Map<string, { first: number; last: number }>();
  for (const r of rows) {
    const t = new Date(r.at).getTime();
    const seen = firstLast.get(r.device_id);
    if (!seen) firstLast.set(r.device_id, { first: t, last: t });
    else {
      seen.first = Math.min(seen.first, t);
      seen.last = Math.max(seen.last, t);
    }
  }
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const returned = [...firstLast.values()].filter((d) => d.last - d.first >= WEEK).length;

  const groupDecided = of("group_decided").length;
  const groupCreated = of("group_created").length;

  return {
    windowDays,
    activeDevices: devices.size,
    returningDevices: returned,
    decisionsPerActiveUserPerWeek: devices.size
      ? Math.round((picked.length / devices.size / weeks) * 100) / 100
      : null,
    medianDecisionSeconds: (() => {
      const ms = picked
        .map((p) => p.props.decisionMs)
        .filter((n): n is number => typeof n === "number" && n > 0 && n < 30 * 60 * 1000);
      const m = median(ms);
      return m === null ? null : Math.round(m / 100) / 10;
    })(),
    pickRate: rate(picked.length, served),
    topPickShare: rate(picked.filter((p) => p.props.slot === "best").length, picked.length),
    deadEndRate: rate(of("dead_end").length, served),
    fourWeekRetention: rate(returned, firstLast.size),
    groupCompletionRate: rate(groupDecided, groupCreated),
    verdicts,
    totalEvents: rows.length,
  };
}

/**
 * Read the last `windowDays` of events and summarise them.
 *
 * UNLIKE `track`, THIS ONE THROWS. Swallowing a query failure here would
 * return a page of zeroes that reads exactly like "nobody used the app this
 * month" — the single most expensive way for this to be wrong, and the reason
 * the caller is expected to turn a failure into a visible error rather than a
 * confident-looking dashboard.
 *
 * `make_interval` rather than string-concatenating the day count: the driver
 * sends parameters untyped, so `$1 || ' days'` is an ambiguous `unknown ||
 * unknown` that Postgres refuses to resolve.
 */
export async function metrics(windowDays = 28): Promise<Metrics> {
  if (!sql) return { ...EMPTY, windowDays };
  await ensureSchema();
  const rows = (await sql`
    SELECT device_id, event, props, at FROM events
    WHERE at > now() - make_interval(days => ${windowDays}::int)
  `) as Row[];
  return summarise(rows, windowDays);
}
