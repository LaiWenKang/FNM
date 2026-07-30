"use client";

import { useEffect, useRef, useState } from "react";
import { PICKER_AREAS, searchAreas } from "@/lib/areas";
import type { Suggestion } from "@/lib/geocode";
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
  planFromPlace,
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
  /* SUGGESTIONS WHILE TYPING, the way a search box is supposed to work. The
     local area table answers instantly and for free; Google's autocomplete
     fills in everything a forty-nine-row table cannot — offices, campuses,
     malls, MRT exits — and both land in ONE list rather than the box behaving
     two different ways depending on what you typed. */
  const [found, setFound] = useState<Suggestion[]>([]);
  const [seeking, setSeeking] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  /* ONE TOKEN PER SEARCH, minted here and retired on selection. Autocomplete
     is billed per SESSION, so every keystroke from the first letter to the
     choice shares this and bills once; a fresh token per request would charge
     for each keystroke separately. */
  const session = useRef<string>("");
  if (!session.current && typeof crypto !== "undefined") session.current = crypto.randomUUID();
  const [status, setStatus] = useState<Status>("rest");
  const notify = useRef(onChange);
  notify.current = onChange;
  const relent = useRef<number | null>(null);

  useEffect(() => {
    const q = where.trim();
    if (q.length < 2) {
      setFound([]);
      setSeeking(false);
      return;
    }
    setSeeking(true);
    const ctrl = new AbortController();
    /* 180ms, not the 350 a "search on submit" box wants. This has to feel like
       the list is narrowing as you type; the abort on every keystroke is what
       keeps that from becoming a queue of stale responses arriving out of
       order and flickering the wrong answers in. */
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/where?q=${encodeURIComponent(q)}&s=${encodeURIComponent(session.current)}`,
          { signal: ctrl.signal },
        );
        const json = (await res.json()) as { configured?: boolean; suggestions?: Suggestion[] };
        setNoKey(json.configured === false);
        setFound(json.suggestions ?? []);
      } catch {
        /* aborted or offline — the message below is the fallback */
      } finally {
        setSeeking(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [where]);

  /** Exchange a chosen suggestion for coordinates, then pin it. */
  async function choosePlace(s: Suggestion) {
    if (!plan) return;
    setPicking(s.id);
    try {
      const res = await fetch(
        `/api/where?id=${encodeURIComponent(s.id)}&s=${encodeURIComponent(session.current)}`,
      );
      const json = (await res.json()) as { place?: { lat: number; lng: number; label: string } | null };
      if (!json.place) {
        setGeoError("Couldn't pin that one — try another result.");
        return;
      }
      apply(planFromPlace(json.place.lat, json.place.lng, json.place.label, plan));
      setWhere("");
      setFound([]);
      // The session ended with the selection; the next search starts a new one.
      session.current = crypto.randomUUID();
      hold("override", 400);
    } catch {
      setGeoError("Couldn't pin that one — try another result.");
    } finally {
      setPicking(null);
    }
  }

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

        {/* THE FIELD. Areas, offices, malls, MRT exits — one box, suggestions
            narrowing as you type, which is the only interaction anybody has to
            be taught. The chips below are a shortcut for the common case, not
            the only way in. */}
        <input
          className="where-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search an area, office or mall…"
          aria-label="Search for a place"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
        />

        {/* NOTHING TYPED — the one-tap path. A fixed two-column grid with the
            locate control as a full-width leading row; a wrapping pill cloud
            that rags 1/2/3/3 and orphans the live chip on its own line is the
            same failure the budget control was rebuilt to avoid. */}
        {!where.trim() && (
          <div className="where-grid">
            <button
              type="button"
              className={`chip locate-chip${auto ? " on" : ""}`}
              onClick={useMyLocation}
              disabled={locating}
            >
              <LocateIcon size={14} strokeWidth={1.9} />
              {locating ? "Locating…" : auto ? "Following my location" : "Use my location"}
            </button>
            {PICKER_AREAS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${!auto && plan.label === a.label ? "on" : ""}`}
                onClick={() => {
                  apply(planFromArea(a.id, plan));
                  hold("override", 400);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* TYPING — ONE LIST, narrowing as you go. Areas and real places sit in
            the same column in the same shape, because a box that renders chips
            for one kind of answer and rows for another is two controls wearing
            one costume. Areas come first: they are free, instant, and the
            likelier intent when somebody types "bugis". */}
        {where.trim() && (
          <ul className="where-found">
            {searchAreas(where).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="where-found-btn"
                  onClick={() => {
                    apply(planFromArea(a.id, plan));
                    setWhere("");
                    setFound([]);
                    hold("override", 400);
                  }}
                >
                  <span className="wf-name">{a.label}</span>
                  <span className="wf-addr">Area</span>
                </button>
              </li>
            ))}
            {found.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="where-found-btn"
                  disabled={picking !== null}
                  onClick={() => void choosePlace(f)}
                >
                  <span className="wf-name">{f.main}</span>
                  {/* The secondary line is why this is a list and not a chip:
                      "Micron" is three buildings, and the road is the only
                      thing that tells them apart. */}
                  {f.secondary && (
                    <span className="wf-addr">{picking === f.id ? "Pinning…" : f.secondary}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* SAYING SO BEATS AN EMPTY LIST, and the cases need different
            sentences: still looking, cannot look at all, and looked and found
            nothing. Collapsing them would tell somebody their office does not
            exist when the truth is that no key is configured. */}
        {where.trim().length >= 2 && searchAreas(where).length === 0 && found.length === 0 && (
          <p className="plan-error">
            {seeking
              ? "Searching…"
              : noKey
                ? `No area called “${where.trim()}”. This deployment can only match Singapore area names.`
                : `Nothing in Singapore called “${where.trim()}”. Try the building, mall or MRT name.`}
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
