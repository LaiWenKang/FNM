import { NextRequest } from "next/server";

// ═══ A CEILING ON WHAT A STRANGER CAN SPEND ═══════════════════════════════
//
// /api/recommend is unauthenticated by design — the product promise is a
// pick with zero setup — and each request can spend real money: a Places
// nearby search, up to three Details calls in the priciest SKU, and a model
// call or two. Before this file, a shell loop against the public URL could
// run that spend flat out until Google's monthly quota page was the only
// thing that stopped it.
//
// This is DAMPING, not a fortress, and the comment says so on purpose. The
// counters are per-instance memory: a serverless platform can spread a
// determined, distributed attacker across fresh instances, and the real
// backstop for that remains quota caps on the key itself. What this removes
// is the cheap version of the attack — one machine, one loop — which is also
// the only version anyone has bothered to run against an app this size.
//
// No store, no dependency, and honest limits: a human tapping "not feeling
// it" as fast as the animation allows stays an order of magnitude under the
// ceiling.

const WINDOW_MS = 60_000;
/** Most buckets tracked at once — enough for every plausible legitimate
    instance-lifetime of distinct IPs, small enough to never matter in RAM. */
const MAX_BUCKETS = 2000;

const buckets = new Map<string, number[]>();

/** Tests only — mirrors the other module-level caches in this codebase. */
export function clearRateLimit(): void {
  buckets.clear();
}

/**
 * True when `key` has already made `limit` requests inside the sliding
 * one-minute window. A refusal does NOT consume a slot: the caller is told to
 * wait, not punished deeper for asking.
 */
export function rateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let stamps = buckets.get(key);
  if (!stamps) {
    stamps = [];
    buckets.set(key, stamps);
  }
  while (stamps.length && stamps[0] <= cutoff) stamps.shift();
  if (stamps.length >= limit) return true;
  stamps.push(now);

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (!v.length || v[v.length - 1] <= cutoff) buckets.delete(k);
      if (buckets.size <= MAX_BUCKETS) break;
    }
  }
  return false;
}

/**
 * Which caller this is, as far as the platform can tell us. First hop of
 * x-forwarded-for on Vercel; a fixed key locally, where "everyone shares one
 * bucket" is exactly right for a dev machine.
 */
export function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
