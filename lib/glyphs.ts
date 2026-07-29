import type { DishGlyphKey } from "@/components/glyphs/dishes";
import type { MoodGlyphKey } from "@/components/glyphs/moods";
import type { DimGlyphKey } from "@/components/glyphs/dims";
import type { Cuisine } from "@/lib/cuisine";
import { isCuisine } from "@/lib/cuisine";
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

/** Cuisine → drawing, the second line of defence. Keyed on the CANONICAL
    vocabulary in lib/cuisine.ts, which is also what live Google results now
    carry — before that they arrived as raw type strings, matched nothing here,
    and every one of them fell through to the flavour-archetype fallback. */
export const CUISINE_GLYPH: Partial<Record<Cuisine, DishGlyphKey>> = {
  hainanese: "chicken-rice",
  cantonese: "porridge",
  teochew: "fish-soup",
  hokkien: "bak-chor-mee",
  sichuan: "mala",
  chinese: "dim-sum",
  "dim-sum": "dim-sum",
  "zi-char": "curry-beehoon",
  hotpot: "mala",
  malay: "satay",
  indonesian: "rendang",
  peranakan: "laksa",
  indian: "prata",
  "south-indian": "prata",
  mamak: "prata",
  japanese: "sushi",
  sushi: "sushi",
  ramen: "ramen",
  korean: "kbbq",
  thai: "tom-yum",
  vietnamese: "fish-soup",
  american: "burger",
  burgers: "burger",
  "fried-chicken": "wings",
  pizza: "burger",
  italian: "bak-chor-mee",
  french: "chirashi",
  steak: "kbbq",
  pub: "fried-chicken",
  "fast-food": "burger",
  mediterranean: "grain-bowl",
  "middle-eastern": "prata",
  turkish: "prata",
  greek: "grain-bowl",
  mexican: "sambal",
  spanish: "satay",
  brazilian: "kbbq",
  kopitiam: "kaya-toast",
  cafe: "kopi",
  bakery: "kaya-toast",
  brunch: "kaya-toast",
  dessert: "shaved-ice",
  "ice-cream": "shaved-ice",
  "bubble-tea": "kopi",
  salads: "grain-bowl",
  vegetarian: "grain-bowl",
  vegan: "grain-bowl",
  seafood: "fish-soup",
  "hawker-centre": "curry-beehoon",
  singaporean: "curry-beehoon",
  fusion: "chirashi",
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
  if (cuisine && isCuisine(cuisine) && CUISINE_GLYPH[cuisine]) return CUISINE_GLYPH[cuisine]!;
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
