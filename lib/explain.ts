import Anthropic from "@anthropic-ai/sdk";
import { Context } from "@/lib/context";
import { describeTaste } from "@/lib/flavor";
import { Profile } from "@/lib/profile";
import { ScoredPlace } from "@/lib/scoring";

// "Why this pick" — one human sentence per recommendation. Uses Claude when an
// API key is configured; otherwise falls back to a deterministic template so
// the app works with zero keys.

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

// Short clauses for context reasons — the meta row already shows walk time and
// price, so the WHY section must add information, not restate it.
const CONTEXT_REWRITES: Array<[RegExp, string]> = [
  [/raining — something warm/, "it beats the rain"],
  [/sheltered from the rain/, "you'll stay dry getting there"],
  [/hot afternoon/, "it's light enough for a hot afternoon"],
];

function templateExplanation(pick: ScoredPlace, profile: Profile): string {
  const fitPct = pick.reasons
    .map((r) => r.match(/\((\d+)% flavor fit\)/)?.[1])
    .find(Boolean);
  const taste = describeTaste(profile.vector);
  const lead = fitPct
    ? `${fitPct}% flavor match for your ${taste} palate`
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
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "You write one short, warm, concrete sentence explaining why a restaurant pick suits this user right now. No preamble, no emoji, under 25 words. Mention the dish if given.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            place: pick.place.name,
            dish: pick.bestDish?.name ?? null,
            walkMinutes: pick.walkMinutes,
            priceSgd: pick.bestDish?.priceSgd ?? null,
            userTaste: describeTaste(profile.vector),
            reasons: pick.reasons,
            raining: ctx.raining,
            mealPeriod: ctx.mealPeriod,
          }),
        },
      ],
    });
    if (response.stop_reason === "refusal") return fallback;
    const text = response.content.find((b) => b.type === "text")?.text.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
