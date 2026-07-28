"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DIMS, Dim, FlavorVector } from "@/lib/flavor";

// The Taste tab: what the app has learned about you, and where to retrain it.

const DIM_LABELS: Record<Dim, { label: string; low: string; high: string; emoji: string }> = {
  heat: { label: "Spice", low: "Mild", high: "Fiery", emoji: "🌶️" },
  sweet: { label: "Sweet", low: "Savory", high: "Sweet", emoji: "🍯" },
  soupy: { label: "Texture", low: "Dry", high: "Soupy", emoji: "🍲" },
  fried: { label: "Crisp", low: "Light", high: "Fried", emoji: "🍗" },
  rich: { label: "Body", low: "Clean", high: "Rich", emoji: "🧈" },
  adventure: { label: "Novelty", low: "Familiar", high: "Adventurous", emoji: "✨" },
};

interface ProfileData {
  vector: FlavorVector;
  swipeCount: number;
  tasteDescription: string;
}

export default function Taste() {
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <main>
      <div className="brand">
        FNM <span>·</span> your taste
      </div>
      {!data ? (
        <div className="center">Loading your taste…</div>
      ) : data.swipeCount === 0 ? (
        <div className="hero">
          <h1>A blank palate</h1>
          <p>The app hasn&apos;t learned your taste yet. One minute of swiping fixes that.</p>
          <Link className="big-btn" href="/onboarding">
            🎯 Start the taste test
          </Link>
        </div>
      ) : (
        <>
          <p className="context-line">
            Learned from {data.swipeCount} swipes · you like it {data.tasteDescription}
          </p>
          <div className="taste-bars">
            {DIMS.map((d) => {
              const info = DIM_LABELS[d];
              const value = data.vector[d];
              return (
                <div className="taste-bar" key={d}>
                  <div className="taste-bar-head">
                    <span>
                      {info.emoji} {info.label}
                    </span>
                    <span className="taste-bar-ends">
                      {info.low} ↔ {info.high}
                    </span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Link className="big-btn secondary" href="/onboarding" style={{ marginTop: 18 }}>
            Retrain with more swipes
          </Link>
        </>
      )}
    </main>
  );
}
