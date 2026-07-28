"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { DIMS, Dim, FlavorVector } from "@/lib/flavor";
import BrandRow from "@/components/BrandRow";
import Glyph from "@/components/Glyph";
import Needle from "@/components/Needle";
import TasteRadar, { dominantAxis } from "@/components/TasteRadar";
import Togo from "@/components/Togo";
import { DIM_GLYPH } from "@/lib/glyphs";
import { togoLine } from "@/lib/togoLines";
import { SlidersIcon, TargetIcon } from "@/components/icons";

// The Taste tab: what the app has learned about you, and where to retrain it.
//
// FILLED — his head sits at the exact centre of the hexagon (CX 150, CY 140 in
// the radar's own coordinate space): he is literally at the origin of your
// palate, with his six whiskers running out along the six spokes to each
// dimension's value in real DIMS order. His blaze is rigid, so the standalone
// NEEDLE is layered at the hub instead and rotated to your dominant axis —
// because its apex is exactly 60°, its flanks land on that sector's two
// bisectors and it covers precisely that dimension's territory, edge to edge.
//
// EMPTY — the same two shapes, the opposite emotional reading, zero extra art.

const DIM_LABELS: Record<Dim, { label: string; low: string; high: string }> = {
  heat: { label: "Spice", low: "Mild", high: "Fiery" },
  sweet: { label: "Sweet", low: "Savory", high: "Sweet" },
  soupy: { label: "Texture", low: "Dry", high: "Soupy" },
  fried: { label: "Crisp", low: "Light", high: "Fried" },
  rich: { label: "Body", low: "Clean", high: "Rich" },
  adventure: { label: "Novelty", low: "Familiar", high: "Adventurous" },
};

/** The reward, shown rather than described. Things 3, Halide and Robinhood all
    show it; asking for sixty seconds of swiping with no picture of the payoff
    is the coldest thing this app used to do. */
const PREVIEW: FlavorVector = {
  heat: 0.74,
  sweet: 0.46,
  soupy: 0.68,
  fried: 0.55,
  rich: 0.7,
  adventure: 0.5,
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
    <main className="taste">
      <BrandRow label="Your palate" />
      {!data ? (
        <div className="center">Loading your taste…</div>
      ) : data.swipeCount === 0 ? (
        <div className="empty-palate">
          <h1>
            A blank <span className="grad-text">palate</span>
          </h1>

          <div className="empty-stage">
            {/* BANKED, curled inside the ghost hexagon: needle grey and pointing
                nowhere, whiskers drooped, cyan powered down. No "Zzz", ever. */}
            <TasteRadar
              ghost
              gid="rgE"
              className="ghost-radar"
              hub={
                <g transform="translate(-48 -52)">
                  <Togo mood="banked" size={96} gid="empty" className="togo-face empty-togo" />
                </g>
              }
            />
          </div>
          <p className="empty-say togo-say">{togoLine("emptyPalate")}</p>

          {/* THE LOCKED PREVIEW — this is what he will know about you. */}
          <div className="preview mat mat-regular">
            <p className="eyebrow">
              <SlidersIcon size={13} strokeWidth={1.8} />
              What you unlock
            </p>
            <div className="preview-glass">
              <TasteRadar vector={PREVIEW} decorative gid="rgP" size={210} />
              {/* The polygon is full-strength ember; the LOCK is a frosted pane
                  laid over it. Withheld on purpose reads completely differently
                  from unfinished, and the difference is one deliberate layer. */}
              <span className="preview-frost" aria-hidden="true" />
              <span className="preview-lock">
                <Needle size={13} tone="data" gid="pvn" />
                Preview
              </span>
            </div>
            <p className="preview-note">One minute of swiping draws this for real.</p>
          </div>

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
          <div className="taste-panel mat mat-regular" style={{ ["--card-i" as string]: 0 }}>
            <div className="radar-wrap">
              <TasteRadar
                vector={data.vector}
                senses={data.vector}
                gid="rgT"
                hub={
                  <g className="hub-stack">
                    {/* Because the needle's apex is exactly 60° — the radar's own
                        spoke step — its two flanks land on that sector's
                        bisectors, so pointing it down your dominant axis covers
                        precisely that dimension's territory, edge to edge. It is
                        drawn larger than his head so it reads past him. */}
                    <g transform="translate(-25 -27)">
                      <Needle size={50} bearing={dominantAxis(data.vector) * 60} gid="hubn" />
                    </g>
                    <g transform="translate(-14 -15)">
                      <Togo mood="locked" size={28} gid="hub" className="togo-face" />
                    </g>
                  </g>
                }
              />
            </div>
            <p className="taste-desc">You like it {data.tasteDescription}.</p>
            <div className="taste-divider" />
            <div className="taste-bars">
              {DIMS.map((d, i) => {
                const info = DIM_LABELS[d];
                const value = data.vector[d];
                const pct = Math.round(value * 100);
                return (
                  <div className="taste-bar" key={d} style={{ ["--i" as string]: i } as CSSProperties}>
                    <div className="taste-bar-head">
                      <span className="taste-bar-name">
                        <Glyph name={DIM_GLYPH[d]} size={20} />
                        {info.label}
                      </span>
                      <span
                        className="taste-pct count"
                        style={{ ["--score" as string]: pct }}
                        aria-hidden="true"
                      />
                      <span className="sr-only">{pct} percent</span>
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
          <Link className="big-btn secondary mono-btn taste-recal" href="/onboarding">
            Recalibrate +
          </Link>
        </>
      )}
    </main>
  );
}
