import { Fault, Verdict, health } from "@/lib/health";
import { llmConfigured, llmProvider } from "@/lib/llm";
import { dbConfigured } from "@/lib/db";

// ═══ WHAT IS SWITCHED ON, AND WHAT IS BROKEN, WITHOUT A DASHBOARD ═════════
//
// The health work made failures legible — but only through GET /api/stats,
// behind STATS_TOKEN, returned as JSON. That is the right gate for pick rates
// and device ids, and the wrong one for the question somebody actually has,
// which is "why is this app not writing me sentences any more".
//
// Answering it required setting an environment variable, redeploying, and
// reading JSON on a phone. So a revoked key stayed undiagnosed not because the
// app did not know, but because knowing was gated behind a chore.
//
// This is the small, safe half of that report, on the screen where the app
// already admits where your profile is stored and whether groups are durable.
// It carries NO metrics — no pick rates, no counts, no device ids — only:
// is this capability configured, is it working, and if not, which KIND of
// failure. A fault category is not a secret; it is already in the platform log
// and it is the one thing that tells you whether to regenerate a key or just
// wait until tomorrow.

export interface FeatureStatus {
  /** What this actually gets the diner, in their words. */
  label: string;
  /** What is lost while it is off or broken — never a bare red light. */
  fallback: string;
  configured: boolean;
  verdict: Verdict;
  fault: Fault | null;
  /** Which vendor, where there is a choice. */
  provider?: string;
}

/** What to DO about each fault. The reason categories exist at all. */
const ADVICE: Record<Fault, string> = {
  auth: "The key was rejected — regenerate it and update the deployment.",
  quota: "The free allowance is spent. It resets daily; adding billing lifts it.",
  "rate-limit": "Too many requests just now. This clears on its own.",
  timeout: "Requests are timing out — usually the network.",
  upstream: "The provider is having an outage. Nothing to fix on this end.",
  "bad-response": "Answers are coming back empty or unreadable.",
  "not-found": "That model name is not available to this key — check GEMINI_MODEL / CLAUDE_MODEL.",
  /* AN UNRECOGNISED FAULT MUST STILL POINT SOMEWHERE. "We do not know" is a
     dead end on a screen; the platform log has the vendor's own words under a
     greppable prefix, which is the next place to look. */
  unknown: "Failing for a reason we do not recognise — the deployment log has it, prefixed [fnm] llm.",
};

export function adviceFor(fault: Fault | null): string | null {
  return fault ? ADVICE[fault] : null;
}

export async function featureStatus(): Promise<FeatureStatus[]> {
  const provider = llmProvider();
  const report = await health({
    llm: llmConfigured(),
    places: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    db: dbConfigured,
    ...(provider ? { llmProvider: provider } : {}),
  });

  const of = (k: "llm" | "places" | "db", label: string, fallback: string): FeatureStatus => {
    const s = report.subsystems[k];
    return {
      label,
      fallback,
      configured: s.configured,
      verdict: s.verdict,
      // The CATEGORY only. Never the vendor's message, which can quote back
      // fragments of a request and has no business on a user's screen.
      fault: s.lastFault?.fault ?? s.recent[0]?.fault ?? null,
      ...(s.provider ? { provider: s.provider } : {}),
    };
  };

  return [
    of(
      "llm",
      "Written reasons and dish details",
      "Picks still work; the “why” line is a template and live places stay restaurant-level.",
    ),
    of(
      "places",
      "Real restaurants near you",
      "Falls back to the built-in Singapore CBD catalogue, so it is only useful downtown.",
    ),
    of(
      "db",
      "Sync across devices, and reliable group links",
      "Your profile stays in this browser and groups are held in memory, which can drop a joiner.",
    ),
  ];
}
