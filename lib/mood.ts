import { Profile } from "@/lib/profile";

// "Today's mood" — one-tap session preferences layered on top of the learned
// taste profile. Moods adjust THIS request only; the underlying profile is
// untouched.

export interface Mood {
  id: string;
  label: string;
  emoji: string;
}

export const MOODS: Mood[] = [
  { id: "spicy", label: "Spicy", emoji: "🌶️" },
  { id: "light", label: "Light", emoji: "🥗" },
  { id: "soupy", label: "Soupy", emoji: "🍲" },
  { id: "comfort", label: "Comfort", emoji: "🍛" },
  { id: "cheap", label: "Budget", emoji: "💸" },
  { id: "nearby", label: "Super close", emoji: "⚡" },
  { id: "surprise", label: "Surprise me", emoji: "🎲" },
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
