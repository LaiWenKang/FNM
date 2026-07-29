import { Context } from "@/lib/context";
import { describeTaste } from "@/lib/flavor";
import { ask } from "@/lib/llm";
import type { Profile } from "@/lib/profile-shape";
import { ScoredPlace } from "@/lib/scoring";

// "Why this pick" — one human sentence per recommendation. Uses whichever model
// lib/llm.ts finds a key for; with none, falls back to a deterministic template
// so the app works with zero keys.


// Short clauses for context reasons — the meta row already shows walk time and
// price, so the WHY section must add information, not restate it.
const CONTEXT_REWRITES: Array<[RegExp, string]> = [
  [/raining — something warm/, "it beats the rain"],
  [/sheltered from the rain/, "you'll stay dry getting there"],
  [/hot afternoon/, "it's light enough for a hot afternoon"],
];

function templateExplanation(pick: ScoredPlace, profile: Profile): string {
  // Read the match off the pick itself — the same integer the ring draws.
  const taste = describeTaste(profile.vector);
  const lead = pick.matchScore
    ? `${pick.matchScore}% match for your ${taste} palate`
    : `A close flavor match for your ${taste} palate`;

  const extras: string[] = [];
  for (const reason of pick.reasons) {
    const rewrite = CONTEXT_REWRITES.find(([re]) => re.test(reason));
    if (rewrite) {
      extras.push(rewrite[1]);
      break;
    }
  }
  if (!extras.length && pick.reasons.some((r) => r.includes("recently"))) {
    extras.push("you haven't had this recently");
  }

  const sentence = extras.length ? `${lead} — and ${extras[0]}` : lead;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export async function explain(pick: ScoredPlace, profile: Profile, ctx: Context): Promise<string> {
  const fallback = templateExplanation(pick, profile);

  const reply = await ask({
    maxTokens: 300,
    system:
      "You write one short, warm, concrete sentence explaining why a restaurant pick suits this user right now. No preamble, no emoji, under 25 words. Mention the dish if given. If you cite a match figure, use matchScore exactly — never invent or round a different number.",
    user: JSON.stringify({
      place: pick.place.name,
      dish: pick.bestDish?.name ?? null,
      matchScore: pick.matchScore,
      walkMinutes: pick.walkMinutes,
      priceSgd: pick.bestDish?.priceSgd ?? null,
      userTaste: describeTaste(profile.vector),
      reasons: pick.reasons,
      raining: ctx.raining,
      mealPeriod: ctx.mealPeriod,
    }),
  });

  return reply?.trim() || fallback;
}
