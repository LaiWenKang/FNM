import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// THE PROVIDER SEAM. Four features route through `ask()`, and every one of them
// falls back silently when it returns null — which is correct for the user and
// exactly why a broken branch here can ship unnoticed for weeks. The existing
// llm tests cover the no-key path and the JSON parsing; this covers the part
// that actually talks to a vendor.

const anthropicCreate = vi.hoisted(() => vi.fn());
const geminiGenerate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: geminiGenerate };
  },
}));

const { ask, llmConfigured, llmProvider } = await import("@/lib/llm");
const { clearHealth } = await import("@/lib/health");

const textReply = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

beforeEach(() => {
  clearHealth();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.unstubAllEnvs();
  anthropicCreate.mockReset();
  geminiGenerate.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("choosing a provider", () => {
  it("is nobody with no keys", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(llmProvider()).toBeNull();
    expect(llmConfigured()).toBe(false);
  });

  it("prefers Anthropic when both are set", () => {
    /* Documented and deliberate: it is the paid tier and the one whose terms
       do not include training on the prompt. If this flips, free-tier terms
       silently start applying to a user who paid to avoid them. */
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-a");
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    expect(llmProvider()).toBe("anthropic");
  });

  it("uses Gemini when it is the only key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "g-1");
    expect(llmProvider()).toBe("gemini");
  });
});

describe("with no key", () => {
  it("returns null without calling anybody", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(geminiGenerate).not.toHaveBeenCalled();
  });
});

describe("Anthropic", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-a");
    vi.stubEnv("GEMINI_API_KEY", "");
  });

  it("returns the text of a normal reply", async () => {
    anthropicCreate.mockResolvedValue(textReply("Because it is raining."));
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBe("Because it is raining.");
  });

  it("passes the system prompt and the ceiling through", async () => {
    anthropicCreate.mockResolvedValue(textReply("ok"));
    await ask({ system: "be brief", user: "why?", maxTokens: 123 });
    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "be brief",
        max_tokens: 123,
        messages: [{ role: "user", content: "why?" }],
      }),
    );
  });

  it("honours a model override", async () => {
    vi.stubEnv("CLAUDE_MODEL", "claude-test-model");
    anthropicCreate.mockResolvedValue(textReply("ok"));
    await ask({ system: "s", user: "u", maxTokens: 10 });
    expect(anthropicCreate.mock.calls[0][0].model).toBe("claude-test-model");
  });

  it("treats a refusal as no answer rather than parsing the apology", async () => {
    // A refusal is a successful response that answers nothing. Returning its
    // prose would print an apology where the "why this pick" sentence goes.
    anthropicCreate.mockResolvedValue({ stop_reason: "refusal", content: [{ type: "text", text: "I can't" }] });
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
  });

  it("returns null when the reply carries no text block", async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "tool_use" }] });
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
  });

  it("swallows a thrown error so the caller's fallback runs", async () => {
    anthropicCreate.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
  });

  it("records WHY it failed instead of shrugging", async () => {
    /* The whole point of the health work: a dead key must stop looking exactly
       like never having set one. The caller still gets null; the operator gets
       a classified reason. */
    anthropicCreate.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ask({ system: "s", user: "u", maxTokens: 50 });
    expect(spy.mock.calls[0][0]).toContain("[fnm] llm auth");
  });
});

describe("Gemini", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "g-1");
  });

  it("returns the text of a normal reply", async () => {
    geminiGenerate.mockResolvedValue({ text: "Laksa, because it is wet out." });
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBe("Laksa, because it is wet out.");
  });

  it("turns thinking OFF, which is load-bearing and not a cost tweak", async () => {
    /* Flash reasons before answering by default and those tokens come out of
       maxOutputTokens — so a 300-token ceiling can be spent ENTIRELY on
       thinking, returning an empty answer with no error. This app shipped that
       bug once; the assertion is here so it cannot ship twice. */
    geminiGenerate.mockResolvedValue({ text: "ok" });
    await ask({ system: "s", user: "u", maxTokens: 300 });
    expect(geminiGenerate.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("sends the system prompt as a systemInstruction, not as user text", async () => {
    geminiGenerate.mockResolvedValue({ text: "ok" });
    await ask({ system: "be brief", user: "why?", maxTokens: 42 });
    const cfg = geminiGenerate.mock.calls[0][0];
    expect(cfg.config.systemInstruction).toBe("be brief");
    expect(cfg.contents).toBe("why?");
    expect(cfg.config.maxOutputTokens).toBe(42);
  });

  it("honours a model override", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-test");
    geminiGenerate.mockResolvedValue({ text: "ok" });
    await ask({ system: "s", user: "u", maxTokens: 10 });
    expect(geminiGenerate.mock.calls[0][0].model).toBe("gemini-test");
  });

  it("counts an empty 200 as a failure, not a success", async () => {
    // Counting it as healthy is what would blind the status page to the exact
    // bug above.
    geminiGenerate.mockResolvedValue({ text: "" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
    expect(spy.mock.calls[0][0]).toContain("bad-response");
  });

  it("counts a whitespace-only answer as empty too", async () => {
    geminiGenerate.mockResolvedValue({ text: "   \n  " });
    expect(await ask({ system: "s", user: "u", maxTokens: 50 })).toBeNull();
  });

  it("classifies a rejected key as auth", async () => {
    geminiGenerate.mockRejectedValue(new Error("API key not valid. Please pass a valid API key."));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ask({ system: "s", user: "u", maxTokens: 50 });
    expect(spy.mock.calls[0][0]).toContain("llm auth");
  });

  it("classifies an exhausted free tier as quota, not as a rate limit", async () => {
    /* The distinction that matters most on the tier this app recommends:
       "wait a minute" versus "you are done until tomorrow". */
    geminiGenerate.mockRejectedValue(
      Object.assign(new Error("Quota exceeded for quota metric 'Generate requests'"), { status: 429 }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ask({ system: "s", user: "u", maxTokens: 50 });
    expect(spy.mock.calls[0][0]).toContain("llm quota");
  });

  it("never lets a provider error escape to the caller", async () => {
    // Every caller has a local fallback and expects null, not a throw. An
    // exception here would 500 a recommendation over a "why" sentence.
    geminiGenerate.mockRejectedValue(new Error("boom"));
    await expect(ask({ system: "s", user: "u", maxTokens: 50 })).resolves.toBeNull();
  });
});
