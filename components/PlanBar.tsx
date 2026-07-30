"use client";

import { useEffect, useRef, useState } from "react";
import { PICKER_AREAS, searchAreas } from "@/lib/areas";
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
import Needle from "@/components/Needle";
import Sheet from "@/components/Sheet";
import Togo, { TogoMood } from "@/components/Togo";
import { ClockIcon, LocateIcon } from "@/components/icons";

// The plan bar: shows the two inputs the recommendation is computed from —
// where and when — and lets the user correct either.
//
// Location follows GPS automatically until the user pins an area; time is live
// unless they pin an hour. Nothing is ever silently guessed without being shown.
//
// STRUCTURALLY SUBORDINATE. It would otherwise land as a fourth glass rectangle
// in a column already made of glass rectangles, with the same material and
// radius as the content card directly beneath it — two adjacent identical
// containers where one is chrome and one is content. So: .mat-thin, 44px,
// pill radius, inset past the content cards, 13px type.
//
// THE NEEDLE IS THE STATUS INDICATOR, replacing what would otherwise be four
// separate spinners. A compass is native to this control and native to this
// animal; that is not a coincidence, it is why he is a husky.
//   resolving        → READING, needle spinning
//   locked           → needle settles with the 7° overshoot, LOCKED for 600ms
//   future hour      → BANKED, needle greys and stops (he waits with you)
//   manual override  → HEDGING for 400ms, then he relents. He complies AFTER he
//                      disagrees; disagreement that never yields is a tantrum.

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

type Status = "rest" | "resolving" | "locked" | "override";

export default function PlanBar({ onChange }: PlanBarProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [where, setWhere] = useState("");
  const [status, setStatus] = useState<Status>("rest");
  const notify = useRef(onChange);
  notify.current = onChange;
  const relent = useRef<number | null>(null);

  /** He registers the disagreement, then relents. Never longer than half a second. */
  function hold(next: Status, ms: number) {
    setStatus(next);
    if (relent.current) window.clearTimeout(relent.current);
    relent.current = window.setTimeout(() => setStatus("rest"), ms);
  }

  useEffect(() => () => void (relent.current && window.clearTimeout(relent.current)), []);

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
    setStatus("resolving");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = planFromCoords(pos.coords.latitude, pos.coords.longitude, stored);
        const moved = kmBetween(stored.lat, stored.lng, next.lat, next.lng) > MOVED_KM;
        // Always store the fresh fix; only refetch if it actually changes the answer.
        setPlan(next);
        savePlan(next);
        if (moved) notify.current?.(next);
        setStatus("locked");
        if (relent.current) window.clearTimeout(relent.current);
        relent.current = window.setTimeout(() => setStatus("rest"), 600);
      },
      () => {
        setLocating(false); // silent on load — the user didn't ask yet
        setStatus("rest");
      },
      { timeout: 4000, maximumAge: 120000 },
    );
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation || !plan) {
      setGeoError("This browser can't share a location.");
      return;
    }
    setLocating(true);
    setStatus("resolving");
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        apply(planFromCoords(pos.coords.latitude, pos.coords.longitude, plan));
        hold("locked", 600);
      },
      (err) => {
        setLocating(false);
        setStatus("rest");
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
  const auto = plan.locationMode === "auto";
  const banked = plan.hour !== null;
  const whenIndex = Math.max(0, TIME_PRESETS.findIndex((t) => t.hour === plan.hour));

  const mood: TogoMood =
    status === "resolving"
      ? "reading"
      : status === "locked"
        ? "locked"
        : status === "override"
          ? "hedging"
          : banked
            ? "banked"
            : "harnessed";

  return (
    <>
      <div className="plan-bar mat mat-thin" data-status={status}>
        <button
          type="button"
          className="plan-summary"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {/* Tapping him opens the sheet — the mascot IS the affordance for
              "confirm where and when", which is otherwise a dry form. */}
          <span className="plan-togo">
            <Togo mood={mood} size={24} gid="pb" className="togo-face" />
          </span>

          {/* Always show a real place; locating is a quiet refinement, never a
              placeholder that hides where the pick is coming from. */}
          <span className={`plan-slot loc${locating ? " locating" : ""}`}>
            <Needle
              size={13}
              tone={banked ? "unsigned" : "ice"}
              spin={status === "resolving"}
              gid="pbn"
              className="plan-needle"
            />
            <span className="plan-value">{plan.label}</span>
          </span>
          <span className="plan-div" aria-hidden="true" />
          <span className="plan-slot time">
            <ClockIcon size={13} strokeWidth={1.9} />
            {plan.hour === null && <span className="live-dot" aria-hidden="true" />}
            <span className="plan-value">{formatHour(hour)}</span>
            <span className="plan-meal">{mealFor(hour)}</span>
          </span>
          <span className="plan-edit">Change</span>
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Where and when" sub="Inputs to the pick">
        <p className="eyebrow">Where</p>
        {/* A FIXED TWO-COLUMN GRID with the locate control as a full-width
            leading row. A wrapping pill cloud that rags 1/2/3/3 and orphans the
            live chip on its own line is the same failure the budget control was
            rebuilt to avoid; it is not allowed to reappear in the sheet. */}
        {/* TYPE TO REACH THE OTHER FORTY-ONE. The chips below are eight CBD
            areas, so the app could LABEL you in Yishun or Tampines from a GPS
            fix but you could not CHOOSE either — while "When" beneath this had
            a segmented control AND an exact-hour stepper. The two inputs the
            pick is computed from were not being treated as equals. */}
        <input
          className="where-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Type an area — Tampines, Jurong, Yishun…"
          aria-label="Search for an area"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
        />

        {/* A FIXED TWO-COLUMN GRID with the locate control as a full-width
            leading row. A wrapping pill cloud that rags 1/2/3/3 and orphans the
            live chip on its own line is the same failure the budget control was
            rebuilt to avoid; it is not allowed to reappear in the sheet. */}
        <div className="where-grid">
          {!where.trim() && (
            <button
              type="button"
              className={`chip locate-chip${auto ? " on" : ""}`}
              onClick={useMyLocation}
              disabled={locating}
            >
              <LocateIcon size={14} strokeWidth={1.9} />
              {locating ? "Locating…" : auto ? "Following my location" : "Use my location"}
            </button>
          )}
          {(where.trim() ? searchAreas(where) : PICKER_AREAS).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip ${!auto && plan.label === a.label ? "on" : ""}`}
              onClick={() => {
                apply(planFromArea(a.id, plan));
                setWhere("");
                hold("override", 400);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {/* SAYING SO BEATS AN EMPTY GRID. A search that silently returns
            nothing reads as a broken control rather than as "no such area". */}
        {where.trim() && searchAreas(where).length === 0 && (
          <p className="plan-error">
            No area called &ldquo;{where.trim()}&rdquo;. Try a nearby MRT or town name.
          </p>
        )}
        {geoError && <p className="plan-error">{geoError}</p>}

        <p className="eyebrow">When</p>
        {/* A MUTUALLY-EXCLUSIVE FIVE-WAY CHOICE, so it is a segmented control
            with a sliding capsule — never a wrapping row of pills. */}
        <div
          className="segmented when-seg"
          role="group"
          aria-label="When"
          style={{ ["--seg-n" as string]: TIME_PRESETS.length, ["--seg-i" as string]: whenIndex }}
        >
          <span className="seg-capsule" aria-hidden="true" />
          {TIME_PRESETS.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`seg-btn ${plan.hour === t.hour ? "on" : ""}`}
              aria-pressed={plan.hour === t.hour}
              onClick={() => apply(planWithHour(plan, t.hour))}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* A bare type="time" input renders as an OS widget with a 12px radius
            in the middle of a monospace telemetry system. This is a stepper. */}
        <div className="stepper" role="group" aria-label="Exact hour">
          <button
            type="button"
            className="stepper-btn"
            aria-label="An hour earlier"
            onClick={() => apply(planWithHour(plan, (hour + 23) % 24))}
          >
            −
          </button>
          <span className="stepper-val">
            {String(hour).padStart(2, "0")}
            <span className="stepper-unit">:00</span>
          </span>
          <button
            type="button"
            className="stepper-btn"
            aria-label="An hour later"
            onClick={() => apply(planWithHour(plan, (hour + 1) % 24))}
          >
            +
          </button>
        </div>

        <p className="plan-hint">
          {auto
            ? "Following your location each visit. Pick an area to pin it instead."
            : `Pinned to ${plan.label}. Tap “Use my location” to follow you again.`}
          {plan.hour !== null && " Time resets to Now for your next meal."}
        </p>
      </Sheet>
    </>
  );
}
