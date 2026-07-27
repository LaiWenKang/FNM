"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  context: { mealPeriod: string; raining: boolean; forecast: string | null };
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

const DEFAULT_ORIGIN = { lat: 1.2841, lng: 103.8515 };

export default function Recommend() {
  const [data, setData] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<Pick | null>(null);
  const excluded = useRef<string[]>([]);
  const origin = useRef(DEFAULT_ORIGIN);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lat: String(origin.current.lat),
        lng: String(origin.current.lng),
        exclude: excluded.current.join(","),
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

  useEffect(() => {
    if (!navigator.geolocation) {
      void load();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        origin.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        void load();
      },
      () => void load(),
      { timeout: 4000, maximumAge: 300000 },
    );
  }, [load]);

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
        <div className="brand">
          FNM <span>·</span> decided
        </div>
        <div className="hero">
          <div className="swipe-card">
            <span className="emoji">🎉</span>
            <span className="label">{decided.name}</span>
            {decided.dish && <p style={{ marginTop: 8 }}>Get the {decided.dish.name}</p>}
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              {distanceLabel(decided)} · enjoy!
            </p>
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
      <div className="brand">
        FNM <span>·</span> your pick
      </div>
      {loading && <div className="center">Reading the weather, the clock, and your taste…</div>}
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
          <p className="context-line">
            {data.context.mealPeriod}
            {data.context.raining ? " · 🌧️ raining — factored in" : ""}
            {data.note ? ` · ${data.note}` : ""}
            {data.swipeCount === 0 ? " · tip: teach it your taste for sharper picks" : ""}
          </p>

          <div className="pick-card best">
            <span className="tag">Best match</span>
            <h2>{data.best.name}</h2>
            {data.best.dish && (
              <div className="dish">
                → {data.best.dish.name} (~${data.best.dish.priceSgd})
              </div>
            )}
            <div className="meta">
              {distanceLabel(data.best)} · {"$".repeat(data.best.priceLevel)}
            </div>
            <div className="why">{data.best.explanation}</div>
            <div className="row">
              <button className="big-btn" onClick={() => void choose(data.best)}>
                Let&apos;s go
              </button>
              <button className="big-btn secondary" onClick={notFeelingIt}>
                Not feeling it
              </button>
            </div>
          </div>

          {[
            { pick: data.safer, tag: "Safer bet" },
            { pick: data.adventurous, tag: "Feeling brave?" },
          ].map(
            ({ pick, tag }) =>
              pick && (
                <div className="pick-card" key={pick.placeId}>
                  <span className="tag">{tag}</span>
                  <h2>{pick.name}</h2>
                  {pick.dish && (
                    <div className="dish">
                      → {pick.dish.name} (~${pick.dish.priceSgd})
                    </div>
                  )}
                  <div className="meta">
                    {distanceLabel(pick)} · {"$".repeat(pick.priceLevel)}
                  </div>
                  <div className="row">
                    <button className="big-btn secondary" onClick={() => void choose(pick)}>
                      This one
                    </button>
                  </div>
                </div>
              ),
          )}
        </>
      )}
    </main>
  );
}
