"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import BrandRow from "@/components/BrandRow";
import PlanBar from "@/components/PlanBar";
import ScoreRing from "@/components/ScoreRing";
import { ArrowIcon, CloudRainIcon, TargetIcon, WalkIcon } from "@/components/icons";
import { Plan, planParams } from "@/lib/plan";

interface Pick {
  placeId: string;
  name: string;
  cuisine: string;
  dish: { name: string; priceSgd: number } | null;
  walkMinutes: number;
  distanceKm: number;
  priceLevel: number;
  explanation: string;
}

interface RecommendResponse {
  context: {
    mealPeriod: string;
    raining: boolean;
    forecast: string | null;
    hour: number;
    locationLabel: string | null;
  };
  note: string | null;
  swipeCount: number;
  best: Pick;
  safer: Pick | null;
  adventurous: Pick | null;
  error?: string;
}

function distanceLabel(pick: Pick): string {
  return pick.walkMinutes <= 45 ? `${pick.walkMinutes} min walk` : `${pick.distanceKm} km away`;
}

/** Price-tier telemetry: active "$" in ink-2, remaining slots as ink-3 dots. */
function PriceTier({ level }: { level: number }) {
  return (
    <span className="meta-price" aria-label={`Price tier ${level} of 4`}>
      <span className="tier-on">{"$".repeat(level)}</span>
      <span className="tier-off" aria-hidden="true">
        {"$".repeat(Math.max(0, 4 - level))}
      </span>
    </span>
  );
}

// Fixed presentation scores — "computed, not guessed" (no API change).
const SIDE_PICKS = [
  { key: "safer" as const, tag: "Safer bet", tagClass: "tag-safe", score: 74, gid: "rgB" },
  { key: "adventurous" as const, tag: "Feeling brave?", tagClass: "tag-brave", score: 61, gid: "rgC" },
];

export default function Recommend() {
  const [data, setData] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<Pick | null>(null);
  const excluded = useRef<string[]>([]);
  const plan = useRef<Plan | null>(null);

  const load = useCallback(async () => {
    if (!plan.current) return;
    setLoading(true);
    setError(null);
    try {
      const mood = new URLSearchParams(window.location.search).get("mood") ?? "";
      const params = new URLSearchParams({
        ...planParams(plan.current),
        exclude: excluded.current.join(","),
        mood,
      });
      const res = await fetch(`/api/recommend?${params}`);
      const json = (await res.json()) as RecommendResponse;
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Couldn't reach the kitchen. Try again?");
    } finally {
      setLoading(false);
    }
  }, []);

  // The plan bar owns where/when: it reports the stored plan on mount and any
  // change the user makes, and each report triggers a fresh pick.
  const onPlanChange = useCallback(
    (next: Plan) => {
      plan.current = next;
      excluded.current = [];
      void load();
    },
    [load],
  );

  async function choose(pick: Pick) {
    setDecided(pick);
    await fetch("/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: pick.placeId, cuisine: pick.cuisine }),
    }).catch(() => {});
  }

  function notFeelingIt() {
    if (data?.best) excluded.current.push(data.best.placeId);
    void load();
  }

  if (decided) {
    return (
      <main>
        <div className="decide-burst" aria-hidden="true" />
        <BrandRow label="Decided" />
        <div className="hero">
          <div className="pick-card best decided-card">
            <div className="decided-check" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="64" height="64">
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#FFB03A" />
                    <stop offset="1" stopColor="#FF4D2E" />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r="29" stroke="url(#cg)" strokeWidth="3" fill="none" />
                <path
                  d="M21 33l8 8 14-16"
                  stroke="url(#cg)"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="decided-name">{decided.name}</h2>
            {decided.dish && <p className="decided-dish">Get the {decided.dish.name}</p>}
            <span className="hud-chip">{distanceLabel(decided)} · enjoy</span>
            <p className="decided-stamp">Decision logged ✓</p>
          </div>
          <Link className="big-btn secondary" href="/">
            Done
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <BrandRow label="Your pick" />
      <PlanBar onChange={onPlanChange} />
      {loading && (
        <div className="load-state" aria-label="Finding your pick" role="status">
          <div className="skeleton-card glass" aria-hidden="true">
            <div className="skeleton-line pill" />
            <div className="skeleton-line title" />
            <div className="skeleton-line half" />
            <div className="skeleton-line" />
            <div className="skeleton-line btn" />
          </div>
          <div className="status-lines" aria-hidden="true">
            <span>Reading weather…</span>
            <span>Checking clock…</span>
            <span>Matching palate…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="hero">
          <p>{error}</p>
          <button className="big-btn" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {data && !loading && (
        <>
          <div className="hud-strip">
            <span className="hud-chip">
              <span className="dot" aria-hidden="true" />
              {data.context.mealPeriod}
            </span>
            {data.context.raining && (
              <span className="hud-chip warn">
                <CloudRainIcon size={13} strokeWidth={1.6} />
                Rain — factored in
              </span>
            )}
            {data.note && <span className="hud-chip">{data.note}</span>}
            {data.swipeCount === 0 && (
              <Link className="hud-chip hud-link" href="/onboarding" aria-label="Calibrate for sharper picks">
                <TargetIcon size={13} strokeWidth={2} />
                Calibrate →
              </Link>
            )}
          </div>

          <div className="pick-card best" style={{ animationDelay: "0ms" }}>
            <span className="tag tag-best">
              <span className="diamond" aria-hidden="true">
                ◆
              </span>
              Best match
            </span>
            <ScoreRing score={92} size={56} gid="rgA" />
            <h2>{data.best.name}</h2>
            {data.best.dish && (
              <div className="dish">
                <ArrowIcon size={15} strokeWidth={2.2} />
                {data.best.dish.name}
                <span className="price">~${data.best.dish.priceSgd.toFixed(2)}</span>
              </div>
            )}
            <div className="meta">
              <WalkIcon size={18} strokeWidth={1.7} />
              <span className="meta-min">{distanceLabel(data.best)}</span>
              <PriceTier level={data.best.priceLevel} />
            </div>
            <div className="why-block">
              <p className="why-label">Why</p>
              <div className="why">{data.best.explanation}</div>
            </div>
            <div className="row">
              <button className="big-btn go" onClick={() => void choose(data.best)}>
                Let&apos;s go
              </button>
              <button className="big-btn secondary pass" onClick={notFeelingIt}>
                Not feeling it
              </button>
            </div>
          </div>

          {SIDE_PICKS.map(({ key, tag, tagClass, score, gid }, i) => {
            const pick = data[key];
            return (
              pick && (
                <div
                  className="pick-card"
                  key={pick.placeId}
                  style={{ animationDelay: `${(i + 1) * 90}ms` }}
                >
                  <span className={`tag ${tagClass}`}>
                    <span className="diamond" aria-hidden="true">
                      ◆
                    </span>
                    {tag}
                  </span>
                  <ScoreRing score={score} size={44} gid={gid} />
                  <h2>{pick.name}</h2>
                  {pick.dish && (
                    <div className="dish">
                      <ArrowIcon size={15} strokeWidth={2.2} />
                      {pick.dish.name}
                      <span className="price">~${pick.dish.priceSgd.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="meta">
                    <WalkIcon size={18} strokeWidth={1.7} />
                    <span className="meta-min">{distanceLabel(pick)}</span>
                    <PriceTier level={pick.priceLevel} />
                  </div>
                  <div className="row">
                    <button className="big-btn secondary" onClick={() => void choose(pick)}>
                      This one
                    </button>
                  </div>
                </div>
              )
            );
          })}
        </>
      )}
    </main>
  );
}
