"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import BrandRow from "@/components/BrandRow";
import SavedPosts from "@/components/SavedPosts";
import Togo from "@/components/Togo";
import {
  CheckIcon,
  EyeOffIcon,
  PersonIcon,
  ShieldIcon,
  SlidersIcon,
  TagIcon,
  WalkIcon,
} from "@/components/icons";
import { togoLine } from "@/lib/togoLines";

// The You tab: account, search settings, and data controls.
//
// Four identical glass rectangles used to sit here with nothing distinguishing
// RANGE from BUDGET from DATA except the icon, and "Erase my data" was the most
// visually prominent control on the screen — a full-width 56px bordered danger
// button, giving profile deletion more weight than setting your budget. On iOS a
// destructive setting is a text row at the bottom of a grouped list. It is one
// now, with Togo beside it stating the consequence honestly and once.

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];
const PRICE_SUBS = ["", "hawker", "casual", "restaurant", "anything"];

const TOGO_PREF = "fnm_togo_hidden";

interface Account {
  signedIn: boolean;
  name: string | null;
  email: string | null;
  image?: string | null;
  storage: "cloud" | "device";
  googleConfigured: boolean;
}

interface Feature {
  label: string;
  fallback: string;
  configured: boolean;
  verdict: "off" | "healthy" | "degraded" | "failing" | "unknown";
  fault: string | null;
  provider?: string;
}

interface Settings {
  maxKm: number;
  priceMax: number;
  swipeCount: number;
  recentCount: number;
  tasteDescription?: string;
  account?: Account;
  features?: Feature[];
}

/* WHAT TO DO ABOUT EACH FAULT — the reason the categories exist at all. A red
   light that does not say "regenerate the key" or "wait until tomorrow" is
   just anxiety. */
const ADVICE: Record<string, string> = {
  auth: "The key was rejected — regenerate it and update the deployment.",
  quota: "The free allowance is spent. It resets daily; adding billing lifts it.",
  "rate-limit": "Too many requests just now. This clears on its own.",
  timeout: "Requests are timing out — usually the network.",
  upstream: "The provider is having an outage. Nothing to fix on this end.",
  "bad-response": "Answers are coming back empty or unreadable.",
  "not-found": "That model name is not available to this key — check GEMINI_MODEL / CLAUDE_MODEL.",
  unknown: "Failing for a reason we do not recognise — the deployment log has it, prefixed [fnm] llm.",
};

const VERDICT_WORD: Record<string, string> = {
  off: "not set up",
  healthy: "working",
  degraded: "patchy",
  failing: "not working",
  unknown: "idle",
};

export default function ProfilePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
    try {
      setHidden(window.localStorage.getItem(TOGO_PREF) === "1");
    } catch {
      /* storage blocked — he simply stays visible */
    }
  }, []);

  /** Offering the exit is what makes him read as confident rather than imposed.
      Hiding removes every face and every line; the bare NEEDLE marks stay,
      because they are brand, not voice. */
  function toggleTogo() {
    const next = !hidden;
    setHidden(next);
    try {
      window.localStorage.setItem(TOGO_PREF, next ? "1" : "0");
    } catch {
      /* nothing to persist to — the class below still applies this session */
    }
    document.documentElement.dataset.togo = next ? "off" : "on";
  }

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
    <main className="profile">
      <BrandRow label="You" />
      {!settings ? (
        <div className="center">Loading…</div>
      ) : (
        <>
          <div className="account-card mat mat-thick" style={{ ["--card-i" as string]: 0 }}>
            <div className="account-row">
              <span className="avatar">
                {settings.account?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.account.image} alt="" width={44} height={44} />
                ) : (
                  <Togo mood="harnessed" size={44} gid="acct" className="avatar-togo togo-face" />
                )}
                <PersonIcon className="avatar-fallback" size={22} />
              </span>
              <div className="account-id">
                <p className="account-name">{settings.account?.name ?? "Guest"}</p>
                <p className="account-sub">
                  {settings.account?.signedIn
                    ? settings.account.email
                    : "Palate stored on this device"}
                </p>
              </div>
            </div>
            {settings.account?.signedIn ? (
              <a className="big-btn secondary" href="/api/auth/signout">
                Sign out
              </a>
            ) : (
              <Link className="big-btn" href="/signin">
                Sign in
              </Link>
            )}
          </div>

          {/* THE STATS MODULE — ~300px of nothing used to sit under these cards. */}
          <p className="section-eyebrow">Your record</p>
          <div className="stats-grid">
            <div className="stat mat mat-regular">
              <span className="stat-k">Meals decided</span>
              <span
                className="stat-v count"
                style={{ ["--score" as string]: settings.recentCount } as CSSProperties}
                aria-hidden="true"
              />
              <span className="sr-only">{settings.recentCount}</span>
            </div>
            <div className="stat mat mat-regular">
              <span className="stat-k">Swipes logged</span>
              <span
                className="stat-v count"
                style={{ ["--score" as string]: settings.swipeCount } as CSSProperties}
                aria-hidden="true"
              />
              <span className="sr-only">{settings.swipeCount}</span>
            </div>
            <div className="stat mat mat-regular wide">
              <span className="stat-k">Palate</span>
              <span className="stat-v small">{settings.tasteDescription ?? "balanced"}</span>
            </div>
          </div>

          {/* SAVED FROM SOCIAL. Sits high on the tab because it is the only
              part of this screen that is a LIST rather than a setting, and
              because the whole point is that you reopen it. */}
          <SavedPosts />

          <p className="section-eyebrow">Search</p>

          <div className="setting-card mat mat-regular" style={{ ["--card-i" as string]: 1 }}>
            <p className="module-head">
              <WalkIcon size={16} />
              Range
            </p>
            <p className="setting-label">How far will you go?</p>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={settings.maxKm}
              aria-label="Maximum distance in kilometres"
              style={{ "--val": settings.maxKm } as CSSProperties}
              onChange={(e) => void update({ maxKm: parseFloat(e.target.value) })}
            />
            <p className="range-readout">
              {settings.maxKm} <span className="unit">KM</span> · ~
              {Math.round((settings.maxKm / 4.5) * 60)} <span className="unit">MIN</span>
            </p>
          </div>

          <div className="setting-card mat mat-regular" style={{ ["--card-i" as string]: 2 }}>
            <p className="module-head">
              <TagIcon size={16} />
              Budget
            </p>
            <p className="setting-label">Usual budget ceiling</p>
            {/* A MUTUALLY-EXCLUSIVE FOUR-WAY CHOICE IS A SEGMENTED CONTROL, never
                a wrapping pill cloud whose selected item lands at the start of
                line two. */}
            <div
              className="segmented"
              role="radiogroup"
              aria-label="Budget ceiling"
              style={{ ["--seg-i" as string]: settings.priceMax - 1 } as CSSProperties}
            >
              <span className="seg-capsule" aria-hidden="true" />
              {[1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={settings.priceMax === p}
                  className={`seg ${settings.priceMax === p ? "on" : ""}`}
                  onClick={() => void update({ priceMax: p })}
                >
                  <span className="seg-mark">{PRICE_LABELS[p]}</span>
                  <span className="seg-sub">{PRICE_SUBS[p]}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="section-eyebrow">Guide</p>

          <div className="setting-card mat mat-regular" style={{ ["--card-i" as string]: 3 }}>
            <p className="module-head">
              <SlidersIcon size={16} />
              Presentation
            </p>
            <button type="button" className="switch-row" onClick={toggleTogo} aria-pressed={hidden}>
              <span className="switch-icon">
                <EyeOffIcon size={16} strokeWidth={1.8} />
              </span>
              <span className="switch-copy">
                <span className="switch-label">Hide Togo</span>
                <span className="switch-note">Every function stays. The bearing marks stay too.</span>
              </span>
              <span className={`switch${hidden ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
          </div>

          <p className="section-eyebrow">Data</p>

          <div className="setting-card mat mat-regular" style={{ ["--card-i" as string]: 4 }}>
            <p className="module-head">
              <ShieldIcon size={16} />
              Storage
            </p>
            <p className="setting-note">
              Your taste profile (<span className="data-num">{settings.swipeCount}</span> swipes,{" "}
              <span className="data-num">{settings.recentCount}</span> recent meals){" "}
              {settings.account?.storage === "cloud"
                ? "is stored in our database against your account, so it follows you across devices."
                : "lives in this device's browser — there's no server copy of it. Saved posts, group shares and anonymous usage counts are kept under a random device id instead, never a name."}{" "}
              We never store contacts, payments, or a location history.
            </p>
          </div>

          {/* WHAT IS SWITCHED ON — and, when something is configured but broken,
              WHY. Every optional capability in this app fails softly by design:
              the pick still arrives, just thinner. That is the right behaviour
              and it is also why a dead key can sit unnoticed for weeks. The
              health report knows; it was simply gated behind a token, an
              environment variable and a redeploy, which is a chore standing
              between somebody and the answer to "why did this go quiet".

              Carries no metrics — pick rates and device ids stay behind
              STATS_TOKEN. Just: is it on, is it working, and which kind of
              failure. */}
          {settings.features && settings.features.length > 0 && (
            <div className="setting-card mat mat-regular" style={{ ["--card-i" as string]: 5 }}>
              <p className="module-head">
                <ShieldIcon size={16} />
                What&rsquo;s switched on
              </p>
              <ul className="feature-list">
                {settings.features.map((f) => (
                  <li key={f.label} className="feature-row" data-state={f.verdict}>
                    <span className="feature-top">
                      <span className="feature-label">{f.label}</span>
                      <span className="feature-state">{VERDICT_WORD[f.verdict] ?? f.verdict}</span>
                    </span>
                    {/* NEVER A BARE RED LIGHT. Say what is lost, and when it is
                        broken rather than merely absent, say what to do. */}
                    <span className="feature-note">
                      {f.verdict === "failing" || f.verdict === "degraded"
                        ? (f.fault && ADVICE[f.fault]) ?? f.fallback
                        : f.verdict === "off"
                          ? f.fallback
                          : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* DEMOTED to a text row, which is where a destructive setting belongs,
              with honest consequence framing beside it. Never guilt-tripping —
              no tears, no pleading; that is both a dark pattern and cheap. */}
          <div className="danger-row">
            {/* A fixed 44px leading column with both lines in the right column,
                so the block has ONE left edge instead of a ragged one. */}
            <span className="danger-mark">
              <Togo mood="banked" size={36} gid="erase" className="danger-togo togo-face" />
            </span>
            <div className="danger-copy">
              <p className="danger-say togo-say">{togoLine("erase")}</p>
              <button className="danger-link" type="button" onClick={() => void reset()}>
                Erase my data
              </button>
            </div>
          </div>

          {saved && (
            <div className="toast" role="status">
              <CheckIcon size={13} strokeWidth={2.4} />
              Saved
            </div>
          )}
        </>
      )}
    </main>
  );
}
