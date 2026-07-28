"use client";

import { useEffect, useRef, useState } from "react";
import { AREAS } from "@/lib/areas";
import {
  Plan,
  effectiveHour,
  formatHour,
  loadPlan,
  mealFor,
  planFromArea,
  planFromCoords,
  savePlan,
} from "@/lib/plan";
import { ClockIcon, LocateIcon, PinIcon } from "@/components/icons";

// The plan bar: shows the two inputs the recommendation is actually computed
// from — where and when — and lets the user correct either. The app should
// never silently guess these.

const TIME_PRESETS: { label: string; hour: number | null }[] = [
  { label: "Now", hour: null },
  { label: "Breakfast", hour: 8 },
  { label: "Lunch", hour: 12 },
  { label: "Dinner", hour: 19 },
  { label: "Supper", hour: 23 },
];

interface PlanBarProps {
  /** Fired on mount with the stored plan, and on every user change. */
  onChange?: (plan: Plan) => void;
}

export default function PlanBar({ onChange }: PlanBarProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const notify = useRef(onChange);
  notify.current = onChange;

  useEffect(() => {
    const stored = loadPlan();
    setPlan(stored);
    notify.current?.(stored);
  }, []);

  function commit(next: Plan) {
    setPlan(next);
    savePlan(next);
    notify.current?.(next);
  }

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
        commit(planFromCoords(pos.coords.latitude, pos.coords.longitude, plan.hour));
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
  const timeText = plan.hour === null ? `Now · ${formatHour(hour)}` : formatHour(plan.hour);
  const timeValue = `${String(hour).padStart(2, "0")}:00`;

  return (
    <div className={`plan-bar${open ? " open" : ""}`}>
      <button
        type="button"
        className="plan-summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="plan-slot">
          <PinIcon size={14} strokeWidth={1.9} />
          <span className="plan-value">{plan.label}</span>
        </span>
        <span className="plan-div" aria-hidden="true" />
        <span className="plan-slot">
          <ClockIcon size={14} strokeWidth={1.9} />
          <span className="plan-value">{timeText}</span>
          <span className="plan-meal">{mealFor(hour)}</span>
        </span>
        <span className="plan-edit">{open ? "Done" : "Change"}</span>
      </button>

      {open && (
        <div className="plan-editor">
          <p className="eyebrow">Where</p>
          <button
            type="button"
            className="chip locate-chip"
            onClick={useMyLocation}
            disabled={locating}
          >
            <LocateIcon size={14} strokeWidth={1.9} />
            {locating ? "Locating…" : "Use my location"}
          </button>
          {geoError && <p className="plan-error">{geoError}</p>}
          <div className="mood-chips">
            {AREAS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${!plan.fromGps && plan.label === a.label ? "on" : ""}`}
                onClick={() => commit(planFromArea(a.id, plan.hour))}
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
                onClick={() => commit({ ...plan, hour: t.hour })}
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
                if (Number.isFinite(h)) commit({ ...plan, hour: h });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
