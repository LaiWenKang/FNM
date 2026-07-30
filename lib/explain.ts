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

function templateExplanation(pick: ScoredPlace, profile: Profile, palateKnown: boolean): string {
  // Read the match off the pick itself — the same integer the ring draws.
  const taste = describeTaste(profile.vector);
  /* "FOR YOUR BALANCED PALATE" TO SOMEONE WHO HAS NEVER SWIPED. `describeTaste`
     reads the neutral vector as "balanced" and the sentence stated it as a
     finding — so the headline line on a first-run card, the one sentence anyone
     actually reads, asserted a palate the app had not been told. Worse than the
     bar it sits under, because it is prose and prose sounds certain. */
  const lead = palateKnown
    ? pick.matchScore
      ? `${pick.matchScore}% match for your ${taste} palate`
      : `A close flavor match for your ${taste} palate`
    : pick.matchScore
      ? `${pick.matchScore}% match on what's open around you`
      : `The best bet open around you right now`;

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

export async function explain(
  pick: ScoredPlace,
  profile: Profile,
  ctx: Context,
  palateKnown = true,
): Promise<string> {
  const fallback = templateExplanation(pick, profile, palateKnown);

  const reply = await ask({
    maxTokens: 300,
    system:
      "You write one short, warm, concrete sentence explaining why a restaurant pick suits this user right now. No preamble, no emoji, under 25 words. Mention the dish if given. If you cite a match figure, use matchScore exactly — never invent or round a different number." +
      /* THE MODEL HAS TO BE TOLD TOO. Handing it `userTaste: "balanced"` and
         asking why the pick suits them invites exactly the sentence the
         template was just fixed for — and a fluent model states it with more
         confidence than the template ever did. */
      (palateKnown
        ? ""
        : " This user has NOT set up a taste profile yet, so `userTaste` is absent. Do not claim to know their tastes or preferences — explain the pick from where they are, the time, the weather, the price and the rating only."),
    user: JSON.stringify({
      place: pick.place.name,
      dish: pick.bestDish?.name ?? null,
      matchScore: pick.matchScore,
      walkMinutes: pick.walkMinutes,
      priceSgd: pick.bestDish?.priceSgd ?? null,
      ...(palateKnown ? { userTaste: describeTaste(profile.vector) } : {}),
      reasons: pick.reasons,
      raining: ctx.raining,
      mealPeriod: ctx.mealPeriod,
    }),
  });

  return reply?.trim() || fallback;
}
