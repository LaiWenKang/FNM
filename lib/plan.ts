"use client";

import { AREAS, DEFAULT_AREA, labelForCoords } from "@/lib/areas";

// The "plan": where and when the user intends to eat. Defaults to here + now,
// but is always shown and always overridable — the app should never silently
// guess the two inputs that decide the answer.

export interface Plan {
  lat: number;
  lng: number;
  label: string;
  /** null = use the device clock at request time. */
  hour: number | null;
  /** true when lat/lng came from the device's GPS rather than a preset. */
  fromGps: boolean;
}

const KEY = "fnm_plan";

export function defaultPlan(): Plan {
  return {
    lat: DEFAULT_AREA.lat,
    lng: DEFAULT_AREA.lng,
    label: DEFAULT_AREA.label,
    hour: null,
    fromGps: false,
  };
}

export function loadPlan(): Plan {
  if (typeof window === "undefined") return defaultPlan();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultPlan();
    return { ...defaultPlan(), ...JSON.parse(raw) };
  } catch {
    return defaultPlan();
  }
}

export function savePlan(plan: Plan): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage blocked (private mode) — the plan just won't persist */
  }
}

export function planFromCoords(lat: number, lng: number, hour: number | null): Plan {
  return { lat, lng, label: labelForCoords(lat, lng), hour, fromGps: true };
}

export function planFromArea(areaId: string, hour: number | null): Plan {
  const area = AREAS.find((a) => a.id === areaId) ?? DEFAULT_AREA;
  return { lat: area.lat, lng: area.lng, label: area.label, hour, fromGps: false };
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
