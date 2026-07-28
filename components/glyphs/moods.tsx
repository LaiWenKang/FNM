// MOOD GLYPHS — the seven "today" chips, at last drawn rather than borrowed.
//
// 24×24 grid, same three-path grammar as the dish set. Two corrections the
// emoji set could not make:
//   · "Super close" is a PIN WITH RADIUS RINGS, not a lightning bolt. Lightning
//     means fast; it never meant near.
//   · "Budget" is a COIN STACK, not money-with-wings, which is 2016 clipart and
//     reads as money leaving.

export type MoodGlyphKey =
  | "chilli"
  | "leaf-bowl"
  | "steam-bowl"
  | "claypot"
  | "coin-stack"
  | "pin-radius"
  | "dice";

export const MOOD_PATHS: Record<MoodGlyphKey, [string, string, string]> = {
  // one chilli. The POD takes the accent, not the silhouette: a chilli whose
  // hottest signal is its colour must not render as a pale outline.
  chilli: [
    "M16.2 5.8c-1.7-1.6-1.7-3.6-.2-5.3l2.1 1.9c-.6.7-.6 1.4 0 2zM18.8 3.2c1.6-.6 3.2-.2 4.4 1-1.4.9-3 1-4.4.3z",
    "M17.4 5.6c3.4 2.6 4.2 7 1.9 10.6-2.6 4-8.4 6.3-14.1 5.6-1.6-.2-3-.7-4.2-1.4 5.6.2 10.6-2 13.1-5.8 1.9-2.9 2-6.3.4-9z",
    "M16.8 7.8c1.4 1.6 1.7 3.7.8 5.7l-1.7-.8c.6-1.4.4-2.9-.6-4.1z",
  ],
  // A FLAT PLATE under a tall greens spray. Not a bowl: differentiated by
  // SILHOUETTE — wide and low with foliage standing clear above it — because
  // three near-identical bowls distinguished by a 2px detail is not a set.
  "leaf-bowl": [
    "M1.4 16.6h21.2c0 3.4-4.7 6-10.6 6S1.4 20 1.4 16.6z",
    "M12.8 15.8c-1.3-4.9.6-8.9 5.8-11.8 1.1 5.5-1.1 9.8-5.2 11.8zM10.6 15.8C9.1 11.7 6.6 9.2 3 8c.7 4.3 3.3 7 7 7.4zM11.2 15.8c-.4-3.6.6-6.6 3-9 1.4 3.6.6 6.8-1.4 9z",
    "M4.6 17.8c.9 1.4 3 2.3 6 2.5-4.3.3-7-.7-6-2.5z",
  ],
  // A DEEP bowl with CHOPSTICKS lifting out of it and one steam ribbon. The
  // sticks are what separate this silhouette from Light and Comfort at 20px.
  "steam-bowl": [
    "M2.4 12.6h19.2c0 5.4-4.3 9.5-9.6 9.5s-9.6-4.1-9.6-9.5zM15.6 1.4l1.6.9-7.2 12.5-1.6-.9zM18.6 3.2l1.6.9-6.4 11-1.6-.9zM6.8 10.6c-1.3-1.4-.3-2.6.1-3.5.4-1 .3-1.6-.5-2.3l1.1-1.1c1.3 1.4.3 2.6-.1 3.5-.4 1-.3 1.6.5 2.3z",
    "M6.4 14.6c2.1-1.4 4.7-1.8 7.1-1.1l-.5 1.9c-1.9-.5-3.9-.2-5.5.9zM8.2 18.1c1.8-1.2 4-1.5 6-.9l-.5 1.9c-1.5-.4-3.2-.2-4.5.7z",
    "M5.2 14.6c.2 2.8 1.8 5 4.4 5.9-3.7-.3-5.8-2.9-4.4-5.9z",
  ],
  // A LIDDED CLAYPOT: a domed lid with a knob sitting on a squat pot with two
  // ear handles. Read as one closed mass, which no open bowl can be.
  claypot: [
    "M3.6 13.8h16.8v2.6c0 3.6-3.8 6.4-8.4 6.4s-8.4-2.8-8.4-6.4zM1.1 14.4h2.5v2.8H1.1a1.4 1.4 0 0 1 0-2.8zM20.4 14.4h2.5a1.4 1.4 0 0 1 0 2.8h-2.5z",
    "M12 4.4c4.7 0 8.6 2.6 9.2 6 .1.8-.5 1.5-1.3 1.5H4.1c-.8 0-1.4-.7-1.3-1.5.6-3.4 4.5-6 9.2-6zM10.7 1.6h2.6c.6 0 1.1.5 1.1 1.1s-.5 1.1-1.1 1.1h-2.6c-.6 0-1.1-.5-1.1-1.1s.5-1.1 1.1-1.1z",
    "M6.4 8.6c1.2-1.6 3-2.6 5.4-2.8l.1 1.6c-1.9.2-3.4.9-4.3 2z",
  ],
  // three stacked coins, not money with wings
  "coin-stack": [
    "M12 15.4c4.4 0 8-1.2 8-2.7v3.2c0 1.5-3.6 2.7-8 2.7s-8-1.2-8-2.7v-3.2c0 1.5 3.6 2.7 8 2.7zM12 10.6c4.4 0 8-1.2 8-2.7v3.2c0 1.5-3.6 2.7-8 2.7s-8-1.2-8-2.7V7.9c0 1.5 3.6 2.7 8 2.7z",
    "M12 3c4.4 0 8 1.2 8 2.7s-3.6 2.7-8 2.7-8-1.2-8-2.7S7.6 3 12 3z",
    "M6.2 5.2c1.1-.7 3-1.2 5.2-1.3v1.4c-2 .1-3.7.5-4.7 1z",
  ],
  // a pin with two radius rings — near, not fast
  "pin-radius": [
    "M12 2.6c3.4 0 6.2 2.8 6.2 6.2 0 4.4-4.6 9-6.2 10.4-1.6-1.4-6.2-6-6.2-10.4 0-3.4 2.8-6.2 6.2-6.2z",
    "M12 6.2a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4zM5.4 16.8l1.4 1.4c-.8.5-1.2 1-1.2 1.4 0 1.2 2.9 2.4 6.4 2.4s6.4-1.2 6.4-2.4c0-.4-.4-.9-1.2-1.4l1.4-1.4c1.2.8 1.8 1.7 1.8 2.8 0 2.5-3.8 4.2-8.4 4.2S3.6 22.1 3.6 19.6c0-1.1.6-2 1.8-2.8z",
    "M9.4 4.8c.7-.5 1.5-.8 2.4-.9v1.5c-.6.1-1.2.3-1.6.6z",
  ],
  // A SHUFFLE — two routes crossing and swapping. Not a cube (which read as a
  // generic 3D box) and deliberately NOT the needle, which is the brand
  // monogram and must never appear as one of seven peer glyphs.
  dice: [
    "M1.8 6.2h3.9c1.9 0 3.6 1 4.6 2.6l3.2 5.2c.6 1 1.7 1.6 2.9 1.6h3.4v2.6h-3.4c-2.1 0-4-1.1-5.1-2.8L8.1 10.2c-.5-.9-1.5-1.4-2.4-1.4H1.8z",
    "M17.4 3.2l4.8 3.5-4.8 3.5zM17.4 13.8l4.8 3.5-4.8 3.5z",
    "M1.8 15.4h3.9c1 0 1.9-.5 2.4-1.4l1-1.6 1.6 2.5-.4.7c-1 1.7-2.9 2.8-5 2.8H1.8z",
  ],
};
