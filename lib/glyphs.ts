import type { DishGlyphKey } from "@/components/glyphs/dishes";
import type { MoodGlyphKey } from "@/components/glyphs/moods";
import type { DimGlyphKey } from "@/components/glyphs/dims";
import type { Dim } from "@/lib/flavor";

// id → glyph mapping tables. PURE DATA, no JSX, so a server component can
// resolve a glyph key without pulling the drawing in.
//
// Every lookup has a fallback, so an unmapped dish can never render an empty
// box: dish id → cuisine → the flavour-archetype default.

export type GlyphKey = DishGlyphKey | MoodGlyphKey | DimGlyphKey;

/** Dish id (lib/data/seed.ts) → drawing. */
export const DISH_GLYPH: Record<string, DishGlyphKey> = {
  "ttc-chicken-rice": "chicken-rice",
  "zz-fish-porridge": "porridge",
  "hk-fish-soup": "fish-soup",
  "ans-sg-ramen": "ramen",
  "lps-satay": "satay",
  "hm-beef-rendang": "rendang",
  "hm-sambal-goreng": "sambal",
  "ws-mango-habanero": "wings",
  "ws-lemon-pepper": "wings",
  "ws-garlic-parmesan": "wings",
  "ws-atomic": "wings",
  "sr-salmon-set": "sushi",
  "sr-chirashi": "chirashi",
  "ssk-kbbq-set": "kbbq",
  "ssk-kimchi-jjigae": "jjigae",
  "rrh-mala-xiangguo": "mala",
  "ss-harvest-bowl": "grain-bowl",
  "tk-tom-yum": "tom-yum",
  "tk-pad-thai": "bak-chor-mee",
  "ah-curry-chicken": "curry-beehoon",
  "ak-bak-chor-mee": "bak-chor-mee",
  "ak-mee-pok-soup": "fish-soup",
  "yk-kaya-toast": "kaya-toast",
  "yk-kopi": "kopi",
  "at-fishball-noodles": "fish-soup",
  "mcd-mcspicy": "burger",
  "mcd-big-mac": "burger",
};

/** Cuisine → drawing, the second line of defence. */
export const CUISINE_GLYPH: Record<string, DishGlyphKey> = {
  hainanese: "chicken-rice",
  cantonese: "porridge",
  teochew: "fish-soup",
  "teochew-noodles": "bak-chor-mee",
  "singapore-ramen": "ramen",
  malay: "satay",
  indonesian: "rendang",
  "american-wings": "wings",
  japanese: "sushi",
  korean: "kbbq",
  sichuan: "mala",
  salads: "grain-bowl",
  thai: "tom-yum",
  singaporean: "curry-beehoon",
  "fast-food": "burger",
  chinese: "dim-sum",
  indian: "prata",
  kopitiam: "kaya-toast",
  cafe: "kopi",
};

/** Last resort: read the dish's own vector and draw its archetype. */
export function glyphForFlavor(f: { soupy: number; fried: number; rich: number }): DishGlyphKey {
  if (f.soupy > 0.6) return "fish-soup";
  if (f.fried > 0.6) return "fried-chicken";
  if (f.rich > 0.6) return "rendang";
  return "grain-bowl";
}

/** The full resolution chain — never returns undefined. */
export function dishGlyph(
  dishId: string | null | undefined,
  cuisine?: string | null,
  flavor?: { soupy: number; fried: number; rich: number } | null,
): DishGlyphKey {
  if (dishId && DISH_GLYPH[dishId]) return DISH_GLYPH[dishId];
  if (cuisine && CUISINE_GLYPH[cuisine]) return CUISINE_GLYPH[cuisine];
  if (flavor) return glyphForFlavor(flavor);
  return "grain-bowl";
}

/** Mood id (lib/mood.ts) → drawing. */
export const MOOD_GLYPH: Record<string, MoodGlyphKey> = {
  spicy: "chilli",
  light: "leaf-bowl",
  soupy: "steam-bowl",
  comfort: "claypot",
  cheap: "coin-stack",
  nearby: "pin-radius",
  surprise: "dice",
};

/** Flavour dimension → drawing, in DIMS order. */
export const DIM_GLYPH: Record<Dim, DimGlyphKey> = {
  heat: "flame",
  sweet: "sugar",
  soupy: "ripple",
  fried: "lattice",
  rich: "marbling",
  adventure: "forked-trail",
};
