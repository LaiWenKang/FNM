import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { geminiModel } from "@/lib/gemini-model";
import { classify, noteFault, noteOk } from "@/lib/health";

// ═══ ONE QUESTION, WHICHEVER MODEL IS PAID FOR ════════════════════════════
//
// Four places in this app ask a language model a small, well-shaped question:
// turn a craving into search intent, pull named dishes out of review text,
// read a restaurant name out of a caption, write one sentence about a pick.
// All four sent that question straight to Anthropic, which quietly made an
// account with one specific vendor a hard dependency of the feature.
//
// It shouldn't be. The questions are provider-agnostic — a system prompt, a
// user string, a short answer — so the choice of vendor belongs in one place
// behind one function, not copied into four call sites.
//
// THREE TIERS, extending the pattern the rest of the app already uses:
//
//   NO KEY     ask() returns null and every caller falls back to the local
//              path it already had. This is not a degraded mode bolted on for
//              the sake of it — it is the mode the app was built in, and it
//              still passes the whole test suite.
//   GEMINI     Google's free tier: no card, 1,500 requests a day, and this app
//              uses about four. Flash is more than good enough at "return only
//              JSON" and one-sentence summaries, which is all that is asked.
//   ANTHROPIC  Preferred when both are set, because it is the paid tier and
//              the one whose terms don't include training on the prompt.
//
// A NOTE ON THE FREE TIER, because it belongs next to the code and not only in
// a README: Google may train on free-tier prompts. What passes through here is
// a typed craving, public restaurant names and review text, and a flavour
// vector — no name, no email, no coordinates. Low stakes, but not zero, and
// the way to opt out is to set an Anthropic key instead.

export type LlmProvider = "anthropic" | "gemini";

/** Which provider the configured keys select, or null for the local path. */
export function llmProvider(): LlmProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

/** True when any model is reachable. Callers use this to skip setup work. */
export function llmConfigured(): boolean {
  return llmProvider() !== null;
}

export interface Ask {
  /** The instruction. Stable across calls, so it caches well on providers that cache. */
  system: string;
  /** The specific thing being asked about. */
  user: string;
  /** Ceiling on the answer. Every caller here wants something short. */
  maxTokens: number;
}

/**
 * Ask the configured model one question and return its text.
 *
 * Returns null rather than throwing on EVERY failure — no key, a refusal, a
 * timeout, a bad response, a vendor outage. Each caller already has a local
 * fallback and a `catch` around it, and a null keeps that path intact.
 *
 * The null is still the whole answer to the CALLER. What changed is that it is
 * no longer the whole answer to the OPERATOR: this used to swallow the error
 * with a shrug, so a dead API key looked exactly like never having set one.
 * Now the reason is classified and recorded on the way past, and the caller's
 * fallback behaviour is completely unaffected.
 */
export async function ask({ system, user, maxTokens }: Ask): Promise<string | null> {
  const provider = llmProvider();
  if (!provider) return null; // Not a fault — the zero-key path is supported.
  try {
    const text =
      provider === "anthropic"
        ? await askAnthropic(system, user, maxTokens)
        : await askGemini(system, user, maxTokens);
    /* AN EMPTY 200 IS A FAILURE, and one this app has actually shipped: Flash
       spending the entire token ceiling on thinking returned a successful
       response containing nothing. Counting that as a success would have made
       the status page report "healthy" through the exact bug it exists to
       catch. */
    if (text === null || text.trim() === "") {
      noteFault("llm", "bad-response", `${provider} returned no usable text`);
      return null;
    }
    noteOk("llm");
    return text;
  } catch (e) {
    noteFault("llm", classify(e), `${provider}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function askAnthropic(system: string, user: string, maxTokens: number): Promise<string | null> {
  const res = await new Anthropic().messages.create({
    model: process.env.CLAUDE_MODEL || "claude-haiku-4-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  // A refusal is a valid, successful response that answers nothing. Treated as
  // "no answer" so the caller falls back instead of parsing an apology.
  if (res.stop_reason === "refusal") return null;
  const block = res.content.find((c) => c.type === "text");
  return block && block.type === "text" ? block.text : null;
}

async function askGemini(system: string, user: string, maxTokens: number): Promise<string | null> {
  /* DISCOVERED, NOT HARDCODED. The pinned default was "gemini-2.5-flash", and
     on the real deployment that model was NOT FOUND for the key in use — so
     every model-backed feature was switched off by a stale constant while the
     key itself was perfectly good. See lib/gemini-model.ts: an explicit
     GEMINI_MODEL still wins, and the literal below is only the last resort if
     discovery itself fails. */
  const model = (await geminiModel()) ?? "gemini-2.0-flash";
  const res = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens,
      /* THINKING OFF, AND THIS IS LOAD-BEARING RATHER THAN A COST TWEAK.
         Flash reasons before answering by default, and those tokens come out
         of maxOutputTokens — so a small ceiling like the 300 these callers use
         can be spent entirely on thinking, returning an EMPTY answer with no
         error. None of these questions need deliberation: they are extraction
         and one-line summary. */
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return res.text ?? null;
}

/* ── PARSING WHAT COMES BACK ──────────────────────────────────────────────
   Every JSON caller was doing the same two things by hand: regex the object or
   array out of whatever prose the model wrapped it in, then JSON.parse inside
   a try. Models are asked for "ONLY JSON" and mostly comply, but "mostly" is
   why the regex existed in the first place, so it stays — once, here. */

/** Pull the first JSON object out of a reply, or null if there isn't one. */
export function jsonObject<T>(reply: string | null): T | null {
  return firstJson<T>(reply, /\{[\s\S]*\}/);
}

/** Pull the first JSON array out of a reply, or null if there isn't one. */
export function jsonArray<T>(reply: string | null): T[] | null {
  const parsed = firstJson<T[]>(reply, /\[[\s\S]*\]/);
  return Array.isArray(parsed) ? parsed : null;
}

function firstJson<T>(reply: string | null, pattern: RegExp): T | null {
  if (!reply) return null;
  const match = reply.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
