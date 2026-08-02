// ═══ ASK THE PROVIDER WHAT IT HAS, RATHER THAN HARDCODING A GUESS ═════════
//
// The default model was the string "gemini-2.5-flash", written down once and
// then left. On the real deployment it came back NOT FOUND: the key was fine,
// the quota was fine, and the app had simply been asking for a model that key
// could not use. Every model-backed feature — written explanations, dish
// mining, cuisine enrichment — was switched off by a stale constant, and it
// took building a status panel to notice.
//
// That is the same failure this codebase has now hit three times: a
// hand-maintained table that reality moved out from under. Forty-nine areas
// could not name an office. A type map could not name two thirds of the
// restaurants Google returned. And a pinned model name could not survive its
// own vendor's release cycle.
//
// The fix is the same each time: keep the deterministic path where it is
// right, and ask the source where it is not. Google publishes exactly this —
// the list of models a given key may call — so the model is DISCOVERED once
// per instance and cached, instead of asserted forever.
//
// AN EXPLICIT GEMINI_MODEL STILL WINS. Someone who names a model has made a
// decision, and quietly overruling it would be a worse bug than the one this
// fixes — they would have no way to tell the app was ignoring them.

/** Preferred generations, cheapest-and-fastest first. Matched as substrings so
    a point release ("-002", "-latest") is picked up without another edit. */
const PREFERENCE = [
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "flash-lite",
  "flash",
];

/** Never these, whatever the vendor lists them as. */
const AVOID = ["vision", "embedding", "aqa", "tts", "image", "audio", "live", "thinking", "exp"];

interface ModelEntry {
  name?: string;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
}

/**
 * Choose the best available model from a ListModels payload. Pure, so the
 * ranking is testable without a key.
 */
export function pickModel(entries: ModelEntry[]): string | null {
  const usable: string[] = [];
  for (const m of entries) {
    if (!m.name) continue;
    // "models/gemini-2.0-flash" -> "gemini-2.0-flash"
    const id = m.name.replace(/^models\//, "");
    const methods = m.supportedGenerationMethods ?? m.supportedActions ?? [];
    // A model that cannot generate content is not a candidate however good its
    // name looks — embedding models sort suspiciously well otherwise.
    if (methods.length && !methods.includes("generateContent")) continue;
    if (AVOID.some((bad) => id.includes(bad))) continue;
    usable.push(id);
  }
  if (!usable.length) return null;

  for (const want of PREFERENCE) {
    // Shortest match wins: "gemini-2.0-flash" beats
    // "gemini-2.0-flash-preview-something" for the same preference tier.
    const hits = usable.filter((id) => id.includes(want)).sort((a, b) => a.length - b.length);
    if (hits.length) return hits[0];
  }
  // Nothing flash-class, but something generates content — better than
  // refusing to work at all.
  return usable.sort((a, b) => a.length - b.length)[0];
}

let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

/** Tests only — mirrors the other module-level caches in this codebase. */
export function clearModelCache(): void {
  cached = null;
  inFlight = null;
}

/**
 * The model to call, discovered once per instance.
 *
 * Returns null when discovery fails, and the caller falls back to a literal
 * default — a stale guess is still better than not asking at all, and the
 * status panel will report whatever happens next either way.
 */
export async function geminiModel(): Promise<string | null> {
  // An explicit choice is a decision, not a default. Never overruled.
  const explicit = process.env.GEMINI_MODEL;
  if (explicit) return explicit;

  if (cached) return cached;
  // One discovery per instance even under a burst: enrichment fans out over a
  // dozen places at once, and a dozen simultaneous ListModels calls to answer
  // one question would be its own small bug.
  inFlight ??= (async () => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return null;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { models?: ModelEntry[] };
      const chosen = pickModel(data.models ?? []);
      if (chosen) cached = chosen;
      return chosen;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
