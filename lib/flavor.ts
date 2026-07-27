// The shared flavor space. Users and dishes/places are vectors in the same
// space, so "which dish suits you" is a similarity computation, not a special case.

export const DIMS = [
  "heat", // spice level tolerance / spiciness of dish
  "sweet", // sweet vs savory lean
  "soupy", // soupy/wet vs dry
  "fried", // fried/crispy vs light
  "rich", // rich/heavy vs clean/light
  "adventure", // familiar vs adventurous
] as const;

export type Dim = (typeof DIMS)[number];
export type FlavorVector = Record<Dim, number>; // each dimension in [0, 1]

export function neutralVector(): FlavorVector {
  return { heat: 0.5, sweet: 0.5, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.5 };
}

export function vec(partial: Partial<FlavorVector>): FlavorVector {
  return { ...neutralVector(), ...partial };
}

/** Similarity in [0, 1]: 1 = identical taste, 0 = maximally different. */
export function similarity(a: FlavorVector, b: FlavorVector): number {
  let dist = 0;
  for (const d of DIMS) dist += Math.abs(a[d] - b[d]);
  return 1 - dist / DIMS.length;
}

/** Move `v` toward (liked) or away from (disliked) `target`. Returns a new vector. */
export function nudge(v: FlavorVector, target: FlavorVector, liked: boolean, weight: number): FlavorVector {
  const out = { ...v };
  for (const d of DIMS) {
    const pull = liked ? target[d] - v[d] : v[d] - target[d];
    out[d] = clamp01(v[d] + pull * weight);
  }
  return out;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Human-readable sketch of a taste vector, used in explanations. */
export function describeTaste(v: FlavorVector): string {
  const parts: string[] = [];
  if (v.heat > 0.65) parts.push("spicy");
  else if (v.heat < 0.35) parts.push("mild");
  if (v.sweet > 0.65) parts.push("sweet-leaning");
  if (v.soupy > 0.65) parts.push("soupy");
  if (v.fried > 0.65) parts.push("crispy");
  if (v.rich > 0.65) parts.push("rich");
  else if (v.rich < 0.35) parts.push("light");
  if (v.adventure > 0.65) parts.push("adventurous");
  return parts.length ? parts.join(", ") : "balanced";
}
