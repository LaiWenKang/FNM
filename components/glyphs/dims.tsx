// DIMENSION GLYPHS — the six axes of the flavour space, in DIMS order
// [heat, sweet, soupy, fried, rich, adventure].
//
// 24×24 grid, same three-path grammar.
//
// ADVENTURE IS A FORKED TRAIL, NOT A COMPASS NEEDLE. The needle is now the
// brand monogram; it must never appear as one of six peer glyphs, or the mark
// stops meaning "Togo" and starts meaning "novelty".

export type DimGlyphKey = "flame" | "sugar" | "ripple" | "lattice" | "marbling" | "forked-trail";

export const DIM_PATHS: Record<DimGlyphKey, [string, string, string]> = {
  // heat — one flame, no cartoon lick
  flame: [
    "M12 1.6c4.6 3.6 7.4 7.6 7.4 11.8 0 4.4-3.3 7.8-7.4 7.8s-7.4-3.4-7.4-7.8c0-2.2.8-4.2 2.2-6.1.5 1.4 1.4 2.3 2.6 2.7-.5-3.2.4-5.9 2.6-8.4z",
    "M12 10.4c2.4 2 3.8 4 3.8 6 0 2.3-1.7 4-3.8 4s-3.8-1.7-3.8-4c0-1.4.6-2.6 1.7-3.7.3.8.8 1.3 1.5 1.6-.3-1.6.2-3 .6-3.9z",
    "M9.4 5.8c-.9 1-1.5 2-1.9 3l-1.3-.6c.5-1.2 1.2-2.3 2.2-3.4z",
  ],
  // sweet — a sugar crystal, faceted
  sugar: [
    "M12 1.8l5.6 4.1 2.1 6.6-2.1 6.6L12 23.2l-5.6-4.1-2.1-6.6 2.1-6.6z",
    "M12 5.4l3.6 2.6 1.4 4.5-1.4 4.5-3.6 2.6-3.6-2.6-1.4-4.5 1.4-4.5z",
    "M9.2 4.6L12 2.6v2.4L9.9 6.4z",
  ],
  // soupy — broth ripple, three arcs
  ripple: [
    "M2.4 8.4c1.9-1.6 3.8-2.4 5.6-2.4s3.7.8 5.6 2.4c1.5 1.3 2.9 1.9 4.2 1.9 1.1 0 2.2-.4 3.4-1.3l1.4 1.7c-1.6 1.2-3.2 1.8-4.8 1.8-1.9 0-3.8-.8-5.7-2.4-1.5-1.2-2.8-1.8-4.1-1.8s-2.6.6-4.1 1.8z",
    "M2.4 14.4c1.9-1.6 3.8-2.4 5.6-2.4s3.7.8 5.6 2.4c1.5 1.3 2.9 1.9 4.2 1.9 1.1 0 2.2-.4 3.4-1.3l1.4 1.7c-1.6 1.2-3.2 1.8-4.8 1.8-1.9 0-3.8-.8-5.7-2.4-1.5-1.2-2.8-1.8-4.1-1.8s-2.6.6-4.1 1.8z",
    "M2.4 20.4c1.9-1.6 3.8-2.4 5.6-2.4 1.2 0 2.4.3 3.6 1l-.9 1.6c-.9-.5-1.8-.7-2.7-.7-1.3 0-2.6.6-4.1 1.8z",
  ],
  // fried — a crisp lattice
  lattice: [
    "M3.4 3.4h2.4v17.2H3.4zM10.8 3.4h2.4v17.2h-2.4zM18.2 3.4h2.4v17.2h-2.4z",
    "M3.4 5.6h17.2V8H3.4zM3.4 11h17.2v2.4H3.4zM3.4 16.4h17.2v2.4H3.4z",
    "M3.4 3.4h2.4v2.2H3.4z",
  ],
  // rich — marbling through a cut
  marbling: [
    "M3.6 4.6h16.8c1 0 1.8.8 1.8 1.8v11.2c0 1-.8 1.8-1.8 1.8H3.6c-1 0-1.8-.8-1.8-1.8V6.4c0-1 .8-1.8 1.8-1.8z",
    "M4.4 8.6c2.4 0 3.6 1.6 6 1.6s3.6-1.6 6-1.6c1.5 0 2.4.6 3.4 1.2v2.2c-1-.6-1.9-1.2-3.4-1.2-2.4 0-3.6 1.6-6 1.6s-3.6-1.6-6-1.6c-.9 0-1.6.2-2.2.6V9.2c.6-.4 1.3-.6 2.2-.6zM4.4 14c2.4 0 3.6 1.6 6 1.6s3.6-1.6 6-1.6c1.5 0 2.4.6 3.4 1.2v2.2c-1-.6-1.9-1.2-3.4-1.2-2.4 0-3.6 1.6-6 1.6s-3.6-1.6-6-1.6c-.9 0-1.6.2-2.2.6v-2.2c.6-.4 1.3-.6 2.2-.6z",
    "M3.6 4.6h4.2v1.6H3.6z",
  ],
  // adventure — TWO DIVERGING STROKES. A trail that forks, never a needle.
  "forked-trail": [
    "M10.8 22.4v-7.6L5.4 9.4l1.7-1.7 5.5 5.5v9.2zM11.4 15.4l6.8-6.8 1.7 1.7-6.8 6.8z",
    "M3.4 4.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM20.6 3.4a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z",
    "M10.8 16.8h1.4v5.6h-1.4z",
  ],
};
