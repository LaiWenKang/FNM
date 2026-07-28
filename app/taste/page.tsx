"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DIMS, Dim, FlavorVector } from "@/lib/flavor";
import BrandRow from "@/components/BrandRow";
import TasteRadar from "@/components/TasteRadar";
import { TargetIcon } from "@/components/icons";

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
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // Flip after data lands so the HUD meters grow from zero on load.
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => setGrown(true), 60);
    return () => window.clearTimeout(t);
  }, [data]);

  return (
    <main>
      <BrandRow label="Your palate" />
      {!data ? (
        <div className="center">Loading your taste…</div>
      ) : data.swipeCount === 0 ? (
        <div className="hero empty-palate">
          <h1>
            A blank <span className="grad-text">palate</span>
          </h1>
          <TasteRadar ghost className="ghost-radar" />
          <p>The app hasn&apos;t learned your taste yet. One minute of swiping fixes that.</p>
          <Link className="big-btn" href="/onboarding">
            <TargetIcon size={20} strokeWidth={2} />
            Start the taste test
          </Link>
        </div>
      ) : (
        <>
          <p className="palate-strip">
            <span className="dot" aria-hidden="true" />
            Palate signature · N={data.swipeCount} swipes
          </p>
          <div className="glass taste-panel">
            <div className="radar-wrap">
              <TasteRadar vector={data.vector} gid="rgT" />
            </div>
            <p className="taste-desc">You like it {data.tasteDescription}.</p>
            <div className="taste-divider" />
            <div className="taste-bars">
              {DIMS.map((d, i) => {
                const info = DIM_LABELS[d];
                const value = data.vector[d];
                const pct = Math.round(value * 100);
                return (
                  <div className="taste-bar" key={d}>
                    <div className="taste-bar-head">
                      <span>
                        {info.emoji} {info.label}
                      </span>
                      <span className="taste-pct">{pct}%</span>
                    </div>
                    <div className="bar">
                      <div
                        className="bar-fill"
                        style={{ width: grown ? `${pct}%` : 0, transitionDelay: `${i * 80}ms` }}
                      />
                    </div>
                    <div className="taste-bar-ends">
                      <span>{info.low}</span>
                      <span>{info.high}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Link className="big-btn secondary mono-btn" href="/onboarding" style={{ marginTop: 18 }}>
            Recalibrate +
          </Link>
        </>
      )}
    </main>
  );
}
