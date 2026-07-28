"use client";

import { useEffect, useRef, useState } from "react";
import { AREAS } from "@/lib/areas";
import {
  MOVED_KM,
  Plan,
  effectiveHour,
  formatHour,
  kmBetween,
  loadPlan,
  mealFor,
  planFromArea,
  planFromCoords,
  planWithHour,
  savePlan,
} from "@/lib/plan";
import { ClockIcon, LocateIcon, PinIcon } from "@/components/icons";

// The plan bar: shows the two inputs the recommendation is computed from —
// where and when — and lets the user correct either.
//
// Location follows GPS automatically until the user pins an area; time is live
// unless they pin an hour. Nothing is ever silently guessed without being shown.

const TIME_PRESETS: { label: string; hour: number | null }[] = [
  { label: "Now", hour: null },
  { label: "Breakfast", hour: 8 },
  { label: "Lunch", hour: 12 },
  { label: "Dinner", hour: 19 },
  { label: "Supper", hour: 23 },
];

interface PlanBarProps {
  /** Fired on mount with the stored plan, and on every change worth refetching. */
  onChange?: (plan: Plan) => void;
}

export default function PlanBar({ onChange }: PlanBarProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const notify = useRef(onChange);
  notify.current = onChange;

  function apply(next: Plan, refetch = true) {
    setPlan(next);
    savePlan(next);
    if (refetch) notify.current?.(next);
  }

  useEffect(() => {
    const stored = loadPlan();
    setPlan(stored);
    notify.current?.(stored);

    // Auto mode: quietly refresh the fix on every visit so the plan reflects
    // where the user actually is. A pinned area is left alone.
    if (stored.locationMode !== "auto" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = planFromCoords(pos.coords.latitude, pos.coords.longitude, stored);
        const moved = kmBetween(stored.lat, stored.lng, next.lat, next.lng) > MOVED_KM;
        // Always store the fresh fix; only refetch if it actually changes the answer.
        setPlan(next);
        savePlan(next);
        if (moved) notify.current?.(next);
      },
      () => setLocating(false), // silent on load — the user didn't ask yet
      { timeout: 4000, maximumAge: 120000 },
    );
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation || !plan) {
      setGeoError("This browser can't share a location.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        apply(planFromCoords(pos.coords.latitude, pos.coords.longitude, plan));
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location is off for this site — pick an area below instead."
            : "Couldn't get a fix — pick an area below instead.",
        );
      },
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true },
    );
  }

  if (!plan) {
    return <div className="plan-bar plan-bar-skeleton" aria-hidden="true" />;
  }

  const hour = effectiveHour(plan);
  const timeValue = `${String(hour).padStart(2, "0")}:00`;
  const auto = plan.locationMode === "auto";

  return (
    <div className={`plan-bar${open ? " open" : ""}`}>
      <button
        type="button"
        className="plan-summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {/* Always show a real place; locating is a quiet refinement, never a
            placeholder that hides where the pick is coming from. */}
        <span className={`plan-slot loc${locating ? " locating" : ""}`}>
          <PinIcon size={14} strokeWidth={1.9} />
          <span className="plan-value">{plan.label}</span>
        </span>
        <span className="plan-div" aria-hidden="true" />
        <span className="plan-slot time">
          <ClockIcon size={14} strokeWidth={1.9} />
          {plan.hour === null && <span className="live-dot" aria-hidden="true" />}
          <span className="plan-value">{formatHour(hour)}</span>
          <span className="plan-meal">{mealFor(hour)}</span>
        </span>
        <span className="plan-edit">{open ? "Done" : "Change"}</span>
      </button>

      {open && (
        <div className="plan-editor">
          <p className="eyebrow">Where</p>
          <button
            type="button"
            className={`chip locate-chip${auto ? " on" : ""}`}
            onClick={useMyLocation}
            disabled={locating}
          >
            <LocateIcon size={14} strokeWidth={1.9} />
            {locating ? "Locating…" : auto ? "Following my location" : "Use my location"}
          </button>
          {geoError && <p className="plan-error">{geoError}</p>}
          <div className="mood-chips">
            {AREAS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${!auto && plan.label === a.label ? "on" : ""}`}
                onClick={() => apply(planFromArea(a.id, plan))}
              >
                {a.label}
              </button>
            ))}
          </div>

          <p className="eyebrow">When</p>
          <div className="mood-chips">
            {TIME_PRESETS.map((t) => (
              <button
                key={t.label}
                type="button"
                className={`chip ${plan.hour === t.hour ? "on" : ""}`}
                onClick={() => apply(planWithHour(plan, t.hour))}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="plan-time-row">
            <span>Exact time</span>
            <input
              type="time"
              value={timeValue}
              step={3600}
              onChange={(e) => {
                const h = parseInt(e.target.value.slice(0, 2), 10);
                if (Number.isFinite(h)) apply(planWithHour(plan, h));
              }}
            />
          </label>
          <p className="plan-hint">
            {auto
              ? "Following your location each visit. Pick an area to pin it instead."
              : `Pinned to ${plan.label}. Tap “Use my location” to follow you again.`}
            {plan.hour !== null && " Time resets to Now for your next meal."}
          </p>
        </div>
      )}
    </div>
  );
}
