// Preset areas the user can plan for. The curated catalog covers the Singapore
// CBD, so these are the places a pick is actually good for today; "Use my
// location" always remains available for anywhere else.

export interface Area {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export const AREAS: Area[] = [
  { id: "raffles", label: "Raffles Place", lat: 1.2841, lng: 103.8515 },
  { id: "tanjong-pagar", label: "Tanjong Pagar", lat: 1.2765, lng: 103.8456 },
  { id: "chinatown", label: "Chinatown", lat: 1.2825, lng: 103.8442 },
  { id: "telok-ayer", label: "Telok Ayer", lat: 1.2810, lng: 103.8478 },
  { id: "marina-bay", label: "Marina Bay", lat: 1.2820, lng: 103.8585 },
  { id: "clarke-quay", label: "Clarke Quay", lat: 1.2884, lng: 103.8465 },
  { id: "bugis", label: "Bugis", lat: 1.3005, lng: 103.8560 },
  { id: "orchard", label: "Orchard", lat: 1.3040, lng: 103.8318 },
];

export const DEFAULT_AREA = AREAS[0];

/** Nearest preset area to a coordinate — used to label a GPS fix. */
export function nearestArea(lat: number, lng: number): { area: Area; km: number } {
  let best = AREAS[0];
  let bestD = Infinity;
  for (const a of AREAS) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  // Rough degrees→km at Singapore's latitude; only used for a "near X" label.
  return { area: best, km: Math.sqrt(bestD) * 111 };
}

/** Human label for a coordinate: the preset area if close, else coordinates. */
export function labelForCoords(lat: number, lng: number): string {
  const { area, km } = nearestArea(lat, lng);
  if (km < 0.7) return area.label;
  if (km < 3) return `Near ${area.label}`;
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}
