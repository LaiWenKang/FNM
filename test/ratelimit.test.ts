import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimit, clientKey, rateLimited } from "@/lib/ratelimit";

// WHAT A STRANGER CAN SPEND. /api/recommend is unauthenticated by design and
// costs real money per call; before the limiter, one shell loop ran that
// spend flat out until Google's quota page stopped it. The limiter is
// instance-local damping, not a fortress — these tests pin the damping.

beforeEach(() => {
  clearRateLimit();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the sliding window", () => {
  it("lets normal use straight through", () => {
    for (let i = 0; i < 10; i += 1) expect(rateLimited("a", 30)).toBe(false);
  });

  it("shuts the door at the limit", () => {
    for (let i = 0; i < 30; i += 1) rateLimited("a", 30);
    expect(rateLimited("a", 30)).toBe(true);
  });

  it("does not punish being refused", () => {
    // A refusal must not consume a slot, or a client polling on the limit
    // could lock itself out forever.
    for (let i = 0; i < 30; i += 1) rateLimited("a", 30);
    for (let i = 0; i < 100; i += 1) rateLimited("a", 30);
    vi.advanceTimersByTime(61_000);
    expect(rateLimited("a", 30)).toBe(false);
  });

  it("opens again once the minute has passed", () => {
    for (let i = 0; i < 30; i += 1) rateLimited("a", 30);
    expect(rateLimited("a", 30)).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(rateLimited("a", 30)).toBe(false);
  });

  it("keeps callers in separate buckets", () => {
    for (let i = 0; i < 30; i += 1) rateLimited("a", 30);
    expect(rateLimited("a", 30)).toBe(true);
    expect(rateLimited("b", 30)).toBe(false);
  });
});

describe("who a request is", () => {
  const reqWith = (headers: Record<string, string>) =>
    new NextRequest("https://fnm.app/api/recommend", { headers });

  it("takes the first hop of x-forwarded-for", () => {
    expect(clientKey(reqWith({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then a shared local bucket", () => {
    expect(clientKey(reqWith({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientKey(reqWith({}))).toBe("local");
  });
});
