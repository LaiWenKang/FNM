// ═══ WHAT KIND OF FOOD IS THIS ════════════════════════════════════════════
//
// `cuisine` used to be a bare `string`, and nothing kept it honest. What
// accumulated was three different kinds of label in one field:
//
//   ETHNICITY   hainanese, teochew, cantonese
//   FORMAT      salads, fast-food, kopitiam
//   AD HOC      american-wings, singapore-ramen, teochew-noodles
//
// which meant the field could not be compared, only displayed. Three things
// were quietly broken by that:
//
//   1. THE REPEAT PENALTY compares `meal.cuisine === place.cuisine`. "teochew"
//      and "teochew-noodles" are different strings, so fishball noodles on
//      Monday did nothing to damp minced meat noodles on Tuesday.
//   2. LIVE PLACES got raw Google type strings — `japanese_restaurant`,
//      `meal_takeaway` — so a curated Japanese place and a Google Japanese
//      place never matched each other on anything. You could be sent for
//      Japanese two days running and the app would not notice.
//   3. THE GLYPH LOOKUP is keyed on cuisine, so every live place fell through
//      to the flavour-archetype fallback and the specific drawings were dead
//      code for two thirds of results.
//
// So: a closed vocabulary, a FAMILY above it, and one function that turns
// Google's types into it. Cuisine is what you tell the user; family is what
// the maths compares, because "had Japanese yesterday" is the question worth
// asking, not "had this exact sub-label yesterday".

export const FAMILIES = [
  "chinese",
  "malay",
  "indian",
  "japanese",
  "korean",
  "thai",
  "vietnamese",
  "western",
  "mediterranean",
  "latin",
  "cafe",
  "dessert",
  "healthy",
  "seafood",
  "other",
] as const;
export type Family = (typeof FAMILIES)[number];

interface Entry {
  /** What the card says. Title case, because it is read, not parsed. */
  label: string;
  family: Family;
}

/* Sub-labels are kept where they carry real information a diner acts on —
   Teochew and Sichuan are not interchangeable to anyone who eats them — and
   collapsed where they do not. */
export const CUISINES = {
  hainanese: { label: "Hainanese", family: "chinese" },
  cantonese: { label: "Cantonese", family: "chinese" },
  teochew: { label: "Teochew", family: "chinese" },
  hokkien: { label: "Hokkien", family: "chinese" },
  sichuan: { label: "Sichuan", family: "chinese" },
  chinese: { label: "Chinese", family: "chinese" },
  "dim-sum": { label: "Dim Sum", family: "chinese" },
  "zi-char": { label: "Zi Char", family: "chinese" },
  hotpot: { label: "Hotpot", family: "chinese" },

  malay: { label: "Malay", family: "malay" },
  indonesian: { label: "Indonesian", family: "malay" },
  peranakan: { label: "Peranakan", family: "malay" },

  indian: { label: "Indian", family: "indian" },
  "south-indian": { label: "South Indian", family: "indian" },
  mamak: { label: "Indian-Muslim", family: "indian" },

  japanese: { label: "Japanese", family: "japanese" },
  sushi: { label: "Sushi", family: "japanese" },
  ramen: { label: "Ramen", family: "japanese" },

  korean: { label: "Korean", family: "korean" },
  thai: { label: "Thai", family: "thai" },
  vietnamese: { label: "Vietnamese", family: "vietnamese" },

  american: { label: "American", family: "western" },
  burgers: { label: "Burgers", family: "western" },
  "fried-chicken": { label: "Fried Chicken", family: "western" },
  pizza: { label: "Pizza", family: "western" },
  italian: { label: "Italian", family: "western" },
  french: { label: "French", family: "western" },
  steak: { label: "Steak", family: "western" },
  pub: { label: "Pub Food", family: "western" },
  "fast-food": { label: "Fast Food", family: "western" },

  mediterranean: { label: "Mediterranean", family: "mediterranean" },
  "middle-eastern": { label: "Middle Eastern", family: "mediterranean" },
  turkish: { label: "Turkish", family: "mediterranean" },
  greek: { label: "Greek", family: "mediterranean" },

  mexican: { label: "Mexican", family: "latin" },
  spanish: { label: "Spanish", family: "latin" },
  brazilian: { label: "Brazilian", family: "latin" },

  kopitiam: { label: "Kopitiam", family: "cafe" },
  cafe: { label: "Cafe", family: "cafe" },
  bakery: { label: "Bakery", family: "cafe" },
  brunch: { label: "Brunch", family: "cafe" },

  dessert: { label: "Dessert", family: "dessert" },
  "ice-cream": { label: "Ice Cream", family: "dessert" },
  "bubble-tea": { label: "Bubble Tea", family: "dessert" },

  salads: { label: "Salads & Bowls", family: "healthy" },
  vegetarian: { label: "Vegetarian", family: "healthy" },
  vegan: { label: "Vegan", family: "healthy" },

  seafood: { label: "Seafood", family: "seafood" },

  "hawker-centre": { label: "Hawker Centre", family: "other" },
  singaporean: { label: "Singaporean", family: "other" },
  fusion: { label: "Fusion", family: "other" },
  restaurant: { label: "Restaurant", family: "other" },
} as const satisfies Record<string, Entry>;

export type Cuisine = keyof typeof CUISINES;

export function isCuisine(v: string): v is Cuisine {
  return Object.prototype.hasOwnProperty.call(CUISINES, v);
}

/** What the card prints. Falls back to the raw value rather than an empty gap. */
export function cuisineLabel(c: string): string {
  return isCuisine(c) ? CUISINES[c].label : c.replace(/[-_]/g, " ");
}

/**
 * THE UNIT THE REPEAT PENALTY COMPARES. Ramen yesterday and sushi today is
 * "Japanese twice"; Teochew fishball noodles and Sichuan hotpot are not
 * "Chinese twice" in any sense a diner would recognise — but they are closer
 * than either is to pizza, and the family is the honest middle.
 */
export function cuisineFamily(c: string): Family {
  return isCuisine(c) ? CUISINES[c].family : "other";
}

/* ── GOOGLE'S TYPES → OURS ────────────────────────────────────────────────
   Ordered most specific first: a place tagged both `sushi_restaurant` and
   `japanese_restaurant` should read "Sushi", not "Japanese". */
const FROM_GOOGLE: [string, Cuisine][] = [
  ["sushi_restaurant", "sushi"],
  ["ramen_restaurant", "ramen"],
  ["japanese_restaurant", "japanese"],
  ["korean_restaurant", "korean"],
  ["thai_restaurant", "thai"],
  ["vietnamese_restaurant", "vietnamese"],
  ["sichuan_restaurant", "sichuan"],
  ["cantonese_restaurant", "cantonese"],
  ["dim_sum_restaurant", "dim-sum"],
  ["chinese_restaurant", "chinese"],
  ["indonesian_restaurant", "indonesian"],
  ["malaysian_restaurant", "malay"],
  ["indian_restaurant", "indian"],
  ["hamburger_restaurant", "burgers"],
  ["pizza_restaurant", "pizza"],
  ["italian_restaurant", "italian"],
  ["french_restaurant", "french"],
  ["steak_house", "steak"],
  ["barbecue_restaurant", "american"],
  ["american_restaurant", "american"],
  ["bar_and_grill", "pub"],
  ["pub", "pub"],
  ["fast_food_restaurant", "fast-food"],
  ["mediterranean_restaurant", "mediterranean"],
  ["middle_eastern_restaurant", "middle-eastern"],
  ["lebanese_restaurant", "middle-eastern"],
  ["turkish_restaurant", "turkish"],
  ["greek_restaurant", "greek"],
  ["mexican_restaurant", "mexican"],
  ["spanish_restaurant", "spanish"],
  ["brazilian_restaurant", "brazilian"],
  ["seafood_restaurant", "seafood"],
  ["vegan_restaurant", "vegan"],
  ["vegetarian_restaurant", "vegetarian"],
  ["dessert_restaurant", "dessert"],
  ["dessert_shop", "dessert"],
  ["ice_cream_shop", "ice-cream"],
  ["confectionery", "dessert"],
  ["candy_store", "dessert"],
  ["chocolate_shop", "dessert"],
  ["donut_shop", "bakery"],
  ["bagel_shop", "bakery"],
  ["bakery", "bakery"],
  ["tea_house", "bubble-tea"],
  ["juice_shop", "salads"],
  ["acai_shop", "salads"],
  ["breakfast_restaurant", "brunch"],
  ["brunch_restaurant", "brunch"],
  ["coffee_shop", "cafe"],
  ["cafe", "cafe"],
  ["diner", "american"],
  ["deli", "american"],
  ["sandwich_shop", "american"],
  ["fine_dining_restaurant", "fusion"],
  ["buffet_restaurant", "fusion"],
  ["asian_restaurant", "fusion"],
  // FOOD COURT MEANS HAWKER CENTRE HERE, and its absence was the costly one:
  // Google tags Singapore's hawker centres `food_court`, so the single most
  // characteristic eating place in the country had no label and no flavour.
  ["food_court", "hawker-centre"],
  ["meal_takeaway", "restaurant"],
];

/** The most specific cuisine Google's types support, or a plain "Restaurant". */
export function cuisineFromGoogle(types: string[] = [], primary?: string): Cuisine {
  const all = [primary, ...types].filter((t): t is string => Boolean(t));
  for (const [type, cuisine] of FROM_GOOGLE) if (all.includes(type)) return cuisine;
  return "restaurant";
}
