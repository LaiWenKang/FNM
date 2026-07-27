import Anthropic from "@anthropic-ai/sdk";
import { Context } from "@/lib/context";
import { describeTaste } from "@/lib/flavor";
import { Profile } from "@/lib/profile";
import { ScoredPlace } from "@/lib/scoring";

// "Why this pick" — one human sentence per recommendation. Uses Claude when an
// API key is configured; otherwise falls back to a deterministic template so
// the app works with zero keys.

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

function templateExplanation(pick: ScoredPlace, ctx: Context): string {
  const bits: string[] = [];
  if (pick.bestDish) bits.push(`get the ${pick.bestDish.name}`);
  bits.push(`${pick.walkMinutes} min walk`);
  if (pick.bestDish) bits.push(`~$${pick.bestDish.priceSgd}`);
  const contextReason = pick.reasons.find((r) => r.includes("rain") || r.includes("hot afternoon"));
  if (contextReason) bits.push(contextReason);
  const recency = pick.reasons.find((r) => r.includes("recently"));
  if (recency) bits.push(recency);
  return bits.join(" · ");
}

export async function explain(pick: ScoredPlace, profile: Profile, ctx: Context): Promise<string> {
  const fallback = templateExplanation(pick, ctx);
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
