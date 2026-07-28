// Context signals: Singapore local time, meal period, and realtime weather
// from the NEA 2-hour forecast (free, no key). Everything degrades gracefully.

export type MealPeriod = "breakfast" | "lunch" | "dinner" | "supper";

export interface Context {
  hourSg: number;
  mealPeriod: MealPeriod;
  raining: boolean;
  forecast: string | null; // null = weather unavailable
}

export function sgHour(now = new Date()): number {
  // Singapore is UTC+8 year-round.
  return (now.getUTCHours() + 8) % 24;
}

export function mealPeriod(hour: number): MealPeriod {
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 21) return "dinner";
  return "supper";
}

interface NeaForecastResponse {
  area_metadata: { name: string; label_location: { latitude: number; longitude: number } }[];
  items: { forecasts: { area: string; forecast: string }[] }[];
}

export async function getWeather(lat: number, lng: number): Promise<{ raining: boolean; forecast: string | null }> {
  try {
    const res = await fetch("https://api.data.gov.sg/v1/environment/2-hour-weather-forecast", {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`NEA ${res.status}`);
    const data = (await res.json()) as NeaForecastResponse;
    const areas = data.area_metadata ?? [];
    const forecasts = data.items?.[0]?.forecasts ?? [];
    if (!areas.length || !forecasts.length) throw new Error("empty NEA payload");

    let nearest = areas[0];
    let best = Infinity;
    for (const a of areas) {
      const d =
        (a.label_location.latitude - lat) ** 2 + (a.label_location.longitude - lng) ** 2;
      if (d < best) {
        best = d;
        nearest = a;
      }
    }
    const forecast = forecasts.find((f) => f.area === nearest.name)?.forecast ?? null;
    const raining = forecast ? /rain|shower|thunder/i.test(forecast) : false;
    return { raining, forecast };
  } catch {
    return { raining: false, forecast: null };
  }
}

export async function buildContext(
  lat: number,
  lng: number,
  hourOverride?: number,
): Promise<Context> {
  // The client sends the hour it is actually planning for (its own clock, or a
  // time the user picked). Server time is only the fallback.
  const hourSg =
    hourOverride !== undefined && Number.isFinite(hourOverride)
      ? Math.max(0, Math.min(23, Math.floor(hourOverride)))
      : sgHour();
  const weather = await getWeather(lat, lng);
  return { hourSg, mealPeriod: mealPeriod(hourSg), ...weather };
}
