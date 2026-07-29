import type { MoodGlyphKey } from "@/components/glyphs/moods";
import type { Profile } from "@/lib/profile-shape";

// "Today's mood" — one-tap session preferences layered on top of the learned
// taste profile. Moods adjust THIS request only; the underlying profile is
// untouched.

export interface Mood {
  id: string;
  label: string;
  /** A drawn two-tone glyph, never a raster emoji. See components/glyphs. */
  glyph: MoodGlyphKey;
}

// "Super close" was ⚡ — lightning means FAST, not NEAR, so it is now a pin with
// radius rings. "Budget" was 💸, money leaving; it is now a coin stack.
export const MOODS: Mood[] = [
  { id: "spicy", label: "Spicy", glyph: "chilli" },
  { id: "light", label: "Light", glyph: "leaf-bowl" },
  { id: "soupy", label: "Soupy", glyph: "steam-bowl" },
  { id: "comfort", label: "Comfort", glyph: "claypot" },
  { id: "cheap", label: "Budget", glyph: "coin-stack" },
  { id: "nearby", label: "Super close", glyph: "pin-radius" },
  { id: "surprise", label: "Surprise me", glyph: "dice" },
];

export function isValidMood(id: string): boolean {
  return MOODS.some((m) => m.id === id);
}

/** Returns a session-effective profile with today's moods applied. */
export function applyMoods(profile: Profile, moodIds: string[]): Profile {
  const p: Profile = { ...profile, vector: { ...profile.vector } };
  for (const id of moodIds) {
    switch (id) {
      case "spicy":
        p.vector.heat = Math.max(p.vector.heat, 0.85);
        break;
      case "light":
        p.vector.rich = Math.min(p.vector.rich, 0.15);
        p.vector.fried = Math.min(p.vector.fried, 0.1);
        break;
      case "soupy":
        p.vector.soupy = Math.max(p.vector.soupy, 0.9);
        break;
      case "comfort":
        p.vector.rich = Math.max(p.vector.rich, 0.75);
        p.vector.adventure = Math.min(p.vector.adventure, 0.25);
        break;
      case "cheap":
        p.priceMax = 1;
        break;
      case "nearby":
        p.maxKm = Math.min(p.maxKm, 0.8);
        break;
      case "surprise":
        p.vector.adventure = 0.95;
        break;
    }
  }
  return p;
}
