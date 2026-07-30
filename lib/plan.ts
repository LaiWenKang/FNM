"use client";

import { AREAS, DEFAULT_AREA, labelForCoords } from "@/lib/areas";

// The "plan": where and when the user intends to eat — the two inputs that
// decide the answer, always shown and always overridable.
//
// Defaults lean automatic so the app stays near-zero-input:
//   • location follows GPS on every visit until the user deliberately picks an
//     area (locationMode flips to "manual" and is then respected);
//   • time is live ("Now" = the device clock at request time). A pinned time is
//     a same-session intent, so it expires rather than haunting tomorrow.

export type LocationMode = "auto" | "manual";

export interface Plan {
  lat: number;
  lng: number;
  label: string;
  /** null = use the device clock at request time. */
  hour: number | null;
  /** "auto" = keep following GPS; "manual" = the user chose this place. */
  locationMode: LocationMode;
  /** When a fixed hour was pinned, so it can expire. */
  hourSetAt: number | null;
}

const KEY = "fnm_plan";
/** A pinned time is about *this* meal; after this it reverts to "Now". */
const HOUR_PIN_TTL_MS = 6 * 60 * 60 * 1000;
/** Below this, a new GPS fix isn't worth a refetch. */
export const MOVED_KM = 0.25;

export function defaultPlan(): Plan {
  return {
    lat: DEFAULT_AREA.lat,
    lng: DEFAULT_AREA.lng,
    label: DEFAULT_AREA.label,
    hour: null,
    locationMode: "auto",
    hourSetAt: null,
  };
}

export function loadPlan(): Plan {
  if (typeof window === "undefined") return defaultPlan();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultPlan();
    return freshen({ ...defaultPlan(), ...JSON.parse(raw) });
  } catch {
    return defaultPlan();
  }
}

/** Expire a stale pinned time so a plan is never silently out of date. */
function freshen(plan: Plan): Plan {
  if (plan.hour === null) return plan;
  const pinnedAt = plan.hourSetAt ?? 0;
  const stale = Date.now() - pinnedAt > HOUR_PIN_TTL_MS;
  const differentDay = new Date(pinnedAt).getDate() !== new Date().getDate();
  return stale || differentDay ? { ...plan, hour: null, hourSetAt: null } : plan;
}

export function savePlan(plan: Plan): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage blocked (private mode) — the plan just won't persist */
  }
}

/** A GPS fix: keeps following the device on later visits. */
export function planFromCoords(lat: number, lng: number, base: Plan): Plan {
  return { ...base, lat, lng, label: labelForCoords(lat, lng), locationMode: "auto" };
}

/**
 * A place found by searching, rather than one of the preset areas: same
 * pinning behaviour, but the label is the place's own name.
 *
 * The label is carried explicitly instead of being derived from the
 * coordinates, because `labelForCoords` would answer "Woodlands" for a
 * building the user typed "Micron" to find — technically true, and not what
 * they asked for. What somebody typed is what the plan bar should read back.
 */
export function planFromPlace(
  lat: number,
  lng: number,
  label: string,
  base: Plan,
): Plan {
  return { ...base, lat, lng, label: label.slice(0, 40), locationMode: "manual" };
}

/** An explicit area choice: pinned, so GPS stops overriding it. */
export function planFromArea(areaId: string, base: Plan): Plan {
  const area = AREAS.find((a) => a.id === areaId) ?? DEFAULT_AREA;
  return { ...base, lat: area.lat, lng: area.lng, label: area.label, locationMode: "manual" };
}

export function planWithHour(base: Plan, hour: number | null): Plan {
  return { ...base, hour, hourSetAt: hour === null ? null : Date.now() };
}

/** Rough great-circle distance in km — good enough for a "did we move?" test. */
export function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111;
  const dLng = (bLng - aLng) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** The hour this plan resolves to right now (device clock when hour is null). */
export function effectiveHour(plan: Plan): number {
  return plan.hour ?? new Date().getHours();
}

export function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? "am" : "pm"}`;
}

export function mealFor(hour: number): string {
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 21) return "dinner";
  return "supper";
}

/** Query string carrying the plan to /api/recommend. */
export function planParams(plan: Plan): Record<string, string> {
  return {
    lat: String(plan.lat),
    lng: String(plan.lng),
    hour: String(effectiveHour(plan)),
    label: plan.label,
  };
}
