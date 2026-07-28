"use client";

import { useEffect, useState } from "react";

// The You tab: search settings and data controls. No accounts yet — everything
// lives in this device's cookie (see PLAN.md privacy rules).

interface Settings {
  maxKm: number;
  priceMax: number;
  swipeCount: number;
  recentCount: number;
}

const PRICE_LABELS = ["", "$ hawker", "$$ casual", "$$$ restaurant", "$$$$ anything"];

export default function ProfilePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  async function update(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxKm: next.maxKm, priceMax: next.priceMax }),
    }).catch(() => {});
    setSaved(true);
  }

  async function reset() {
    if (!confirm("Erase your taste profile and meal history on this device?")) return;
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    }).catch(() => {});
    location.reload();
  }

  return (
    <main>
      <div className="brand">
        FNM <span>·</span> you
      </div>
      {!settings ? (
        <div className="center">Loading…</div>
      ) : (
        <>
          <div className="setting-card">
            <p className="setting-label">🚶 How far will you go?</p>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={settings.maxKm}
              onChange={(e) => void update({ maxKm: parseFloat(e.target.value) })}
            />
            <p className="setting-value">{settings.maxKm} km (~{Math.round((settings.maxKm / 4.5) * 60)} min walk)</p>
          </div>

          <div className="setting-card">
            <p className="setting-label">💰 Usual budget ceiling</p>
            <div className="mood-chips">
              {[1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${settings.priceMax === p ? "on" : ""}`}
                  onClick={() => void update({ priceMax: p })}
                >
                  {PRICE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-card">
            <p className="setting-label">📱 Your data</p>
            <p className="setting-note">
              No account, no name, no tracking — your taste profile ({settings.swipeCount} swipes,{" "}
              {settings.recentCount} recent meals) lives in this device&apos;s browser only.
            </p>
            <button className="big-btn secondary danger" type="button" onClick={() => void reset()}>
              Erase my data
            </button>
          </div>
          {saved && <p className="context-line">Saved ✓</p>}
        </>
      )}
    </main>
  );
}
