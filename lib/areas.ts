// Preset areas the user can plan for, and the lookup that labels a GPS fix.
//
// THE LIST USED TO BE EIGHT CBD AREAS, which was right when the only candidate
// places were eight CBD areas' worth of curated catalogue. With live Google
// results the app works anywhere, and field testing immediately exposed the
// gap: a user standing in Yishun — ~10 km from the nearest preset — was shown
// "1.392, 103.853" as their location. Raw coordinates are not a place name and
// no user should ever be shown them.
//
// So this now covers Singapore properly. It is a lookup table, not an API call:
// Singapore is 50 km across, these are stable, and a reverse-geocode per page
// load would cost money and latency to answer a question a table answers for
// free.

export interface Area {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Shown in the area picker. The full list is too long to present flat. */
  picker?: boolean;
}

export const AREAS: Area[] = [
  // ── CENTRAL / CBD — the curated catalogue's home ground, so these stay in
  //    the picker where a user is most likely to be planning for one.
  { id: "raffles", label: "Raffles Place", lat: 1.2841, lng: 103.8515, picker: true },
  { id: "tanjong-pagar", label: "Tanjong Pagar", lat: 1.2765, lng: 103.8456, picker: true },
  { id: "chinatown", label: "Chinatown", lat: 1.2825, lng: 103.8442, picker: true },
  { id: "telok-ayer", label: "Telok Ayer", lat: 1.281, lng: 103.8478, picker: true },
  { id: "marina-bay", label: "Marina Bay", lat: 1.282, lng: 103.8585, picker: true },
  { id: "clarke-quay", label: "Clarke Quay", lat: 1.2884, lng: 103.8465, picker: true },
  { id: "bugis", label: "Bugis", lat: 1.3005, lng: 103.856, picker: true },
  { id: "orchard", label: "Orchard", lat: 1.304, lng: 103.8318, picker: true },

  // ── the rest of the island: labelling only, so the picker stays short
  { id: "little-india", label: "Little India", lat: 1.3067, lng: 103.8497 },
  { id: "dhoby-ghaut", label: "Dhoby Ghaut", lat: 1.2993, lng: 103.8455 },
  { id: "somerset", label: "Somerset", lat: 1.3006, lng: 103.8388 },
  { id: "newton", label: "Newton", lat: 1.3138, lng: 103.838 },
  { id: "novena", label: "Novena", lat: 1.3204, lng: 103.8438 },
  { id: "tiong-bahru", label: "Tiong Bahru", lat: 1.286, lng: 103.827 },
  { id: "harbourfront", label: "HarbourFront", lat: 1.2653, lng: 103.822 },
  { id: "sentosa", label: "Sentosa", lat: 1.2494, lng: 103.8303 },
  { id: "kallang", label: "Kallang", lat: 1.311, lng: 103.8714 },
  { id: "geylang", label: "Geylang", lat: 1.3143, lng: 103.8878 },
  { id: "katong", label: "Katong", lat: 1.305, lng: 103.902 },
  { id: "paya-lebar", label: "Paya Lebar", lat: 1.3175, lng: 103.8927 },
  { id: "toa-payoh", label: "Toa Payoh", lat: 1.3323, lng: 103.8474 },
  { id: "bishan", label: "Bishan", lat: 1.3509, lng: 103.8485 },
  { id: "serangoon", label: "Serangoon", lat: 1.3496, lng: 103.8737 },
  { id: "hougang", label: "Hougang", lat: 1.3712, lng: 103.8863 },
  { id: "ang-mo-kio", label: "Ang Mo Kio", lat: 1.3691, lng: 103.8454 },
  { id: "yio-chu-kang", label: "Yio Chu Kang", lat: 1.3817, lng: 103.8449 },
  { id: "seletar", label: "Seletar", lat: 1.4048, lng: 103.87 },
  { id: "sengkang", label: "Sengkang", lat: 1.3916, lng: 103.8954 },
  { id: "punggol", label: "Punggol", lat: 1.4043, lng: 103.9022 },
  { id: "yishun", label: "Yishun", lat: 1.4295, lng: 103.8355 },
  { id: "khatib", label: "Khatib", lat: 1.4173, lng: 103.8329 },
  { id: "sembawang", label: "Sembawang", lat: 1.4491, lng: 103.82 },
  { id: "admiralty", label: "Admiralty", lat: 1.4406, lng: 103.801 },
  { id: "woodlands", label: "Woodlands", lat: 1.436, lng: 103.7865 },
  { id: "bedok", label: "Bedok", lat: 1.324, lng: 103.93 },
  { id: "tampines", label: "Tampines", lat: 1.3546, lng: 103.9437 },
  { id: "pasir-ris", label: "Pasir Ris", lat: 1.3721, lng: 103.9474 },
  { id: "expo", label: "Singapore Expo", lat: 1.3345, lng: 103.9615 },
  { id: "changi", label: "Changi Airport", lat: 1.3592, lng: 103.9894 },
  { id: "bukit-timah", label: "Bukit Timah", lat: 1.3294, lng: 103.8021 },
  { id: "holland-village", label: "Holland Village", lat: 1.311, lng: 103.796 },
  { id: "buona-vista", label: "Buona Vista", lat: 1.307, lng: 103.79 },
  { id: "queenstown", label: "Queenstown", lat: 1.2946, lng: 103.806 },
  { id: "clementi", label: "Clementi", lat: 1.3151, lng: 103.765 },
  { id: "jurong-east", label: "Jurong East", lat: 1.333, lng: 103.742 },
  { id: "boon-lay", label: "Boon Lay", lat: 1.3387, lng: 103.7059 },
  { id: "bukit-batok", label: "Bukit Batok", lat: 1.349, lng: 103.7495 },
  { id: "bukit-panjang", label: "Bukit Panjang", lat: 1.3774, lng: 103.7719 },
  { id: "choa-chu-kang", label: "Choa Chu Kang", lat: 1.3854, lng: 103.7443 },
];

/** The short list offered in the Change sheet. */
export const PICKER_AREAS = AREAS.filter((a) => a.picker);

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

/**
 * Human label for a coordinate. The final fallback is deliberately NOT
 * coordinates: outside Singapore no table will help, and "Your location" is
 * both true and readable, where "1.392, 103.853" is neither.
 */
export function labelForCoords(lat: number, lng: number): string {
  const { area, km } = nearestArea(lat, lng);
  // 2 km is not an arbitrary threshold: a Singapore planning area is roughly
  // 2 km across, so being within 2 km of its centroid genuinely means you are
  // IN it. Prefixing those with "Near" only made the label longer than the
  // plan bar — and "Near Yio Chu ..." truncated is strictly less useful than
  // "Yio Chu Kang" whole.
  if (km < 2) return area.label;
  if (km < 5) return `Near ${area.label}`;
  return "Your location";
}
