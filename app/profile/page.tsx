"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import BrandRow from "@/components/BrandRow";
import { PersonIcon, ShieldIcon, TagIcon, WalkIcon } from "@/components/icons";

// The You tab: account, search settings, and data controls.

interface Account {
  signedIn: boolean;
  name: string | null;
  email: string | null;
  storage: "cloud" | "device";
  googleConfigured: boolean;
}

interface Settings {
  maxKm: number;
  priceMax: number;
  swipeCount: number;
  recentCount: number;
  account?: Account;
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
      <BrandRow label="You" />
      {!settings ? (
        <div className="center">Loading…</div>
      ) : (
        <>
          <div className="setting-card account-card" style={{ animationDelay: "0ms", marginTop: 16 }}>
            <p className="module-head">
              <PersonIcon size={20} />
              Account
            </p>
            {settings.account?.signedIn ? (
              <>
                <p className="setting-label">{settings.account.name ?? "Signed in"}</p>
                <p className="setting-note">{settings.account.email}</p>
                <a className="big-btn secondary" href="/api/auth/signout">
                  Sign out
                </a>
              </>
            ) : (
              <>
                <p className="setting-note">
                  You&apos;re browsing as a guest — your palate lives on this device only. Sign in
                  to sync it everywhere.
                </p>
                <Link className="big-btn" href="/signin">
                  Sign in
                </Link>
              </>
            )}
          </div>

          <div className="setting-card" style={{ animationDelay: "60ms" }}>
            <p className="module-head">
              <WalkIcon size={20} />
              Range
            </p>
            <p className="setting-label">How far will you go?</p>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={settings.maxKm}
              style={{ "--val": settings.maxKm } as CSSProperties}
              onChange={(e) => void update({ maxKm: parseFloat(e.target.value) })}
            />
            <p className="range-readout">
              {settings.maxKm} <span className="unit">KM</span> · ~
              {Math.round((settings.maxKm / 4.5) * 60)} <span className="unit">MIN</span>
            </p>
          </div>

          <div className="setting-card" style={{ animationDelay: "120ms" }}>
            <p className="module-head">
              <TagIcon size={20} />
              Budget
            </p>
            <p className="setting-label">Usual budget ceiling</p>
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

          <div className="setting-card" style={{ animationDelay: "180ms" }}>
            <p className="module-head">
              <ShieldIcon size={20} />
              Data
            </p>
            <p className="setting-note">
              Your taste profile (<span className="data-num">{settings.swipeCount}</span> swipes,{" "}
              <span className="data-num">{settings.recentCount}</span> recent meals){" "}
              {settings.account?.storage === "cloud"
                ? "is stored in our database against your account, so it follows you across devices."
                : "lives in this device's browser only — nothing leaves your phone."}{" "}
              We never store contacts, payments, or a location history.
            </p>
            <button className="big-btn secondary danger" type="button" onClick={() => void reset()}>
              Erase my data
            </button>
          </div>
          {saved && (
            <div className="toast" role="status">
              Saved ✓
            </div>
          )}
        </>
      )}
    </main>
  );
}
