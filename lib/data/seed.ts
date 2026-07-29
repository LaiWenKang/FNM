import type { DishGlyphKey } from "@/components/glyphs/dishes";
import { FlavorVector, vec } from "@/lib/flavor";

// Curated launch catalog: Singapore CBD-area places (hawker stalls, kopitiams,
// and chains). Per PLAN.md, manual curation of launch clusters is in scope for
// the MVP — this is tier 1 of the dish/flavor catalog. Coordinates and hours
// are approximate; refine during Phase 0/1 field testing.

export interface Dish {
  id: string;
  name: string;
  flavor: FlavorVector;
  priceSgd: number;
}

export interface Place {
  id: string;
  name: string;
  cuisine: string;
  lat: number;
  lng: number;
  priceLevel: 1 | 2 | 3 | 4; // 1 = hawker, 4 = fine dining
  flavor: FlavorVector; // aggregate flavor profile of the menu
  openHour: number; // local SG time, 24h
  closeHour: number;
  sheltered: boolean; // reachable/seated under shelter (matters when raining)
  dishes: Dish[];
  source: "curated" | "google";
  /** Google crowd rating, 1–5. null when unrated or not a live result. */
  rating?: number | null;
  /** How many ratings back it. A 5.0 from 3 people is not a 4.6 from 900. */
  ratingCount?: number;
  /** False when a live place matched no informative Google type, so its
      flavour vector is a neutral placeholder rather than an estimate. */
  flavorKnown?: boolean;
  /** False when openHour/closeHour are the 0–24 placeholder, so the UI must
      not print a closing time it does not actually know. */
  hoursKnown?: boolean;
  /** Saved from a TikTok / Rednote / Douyin post the user wants to try. */
  wantToTry?: boolean;
  /** The dish that post was actually about, if it named one. */
  savedDish?: string | null;
}

export const SEED_PLACES: Place[] = [
  {
    id: "maxwell-tiantian",
    name: "Tian Tian Hainanese Chicken Rice (Maxwell)",
    cuisine: "hainanese",
    lat: 1.2803, lng: 103.8445, priceLevel: 1,
    flavor: vec({ heat: 0.2, sweet: 0.3, soupy: 0.2, fried: 0.2, rich: 0.5, adventure: 0.2 }),
    openHour: 10, closeHour: 19, sheltered: true, source: "curated",
    dishes: [
      { id: "ttc-chicken-rice", name: "Chicken Rice", flavor: vec({ heat: 0.15, rich: 0.5, adventure: 0.15 }), priceSgd: 5 },
    ],
  },
  {
    id: "maxwell-zhen-zhen",
    name: "Zhen Zhen Porridge (Maxwell)",
    cuisine: "cantonese",
    lat: 1.2802, lng: 103.8446, priceLevel: 1,
    flavor: vec({ heat: 0.1, sweet: 0.2, soupy: 0.9, fried: 0.1, rich: 0.3, adventure: 0.25 }),
    openHour: 5, closeHour: 14, sheltered: true, source: "curated",
    dishes: [
      { id: "zz-fish-porridge", name: "Sliced Fish Porridge", flavor: vec({ soupy: 0.95, rich: 0.3, heat: 0.05 }), priceSgd: 4.5 },
    ],
  },
  {
    id: "amoy-han-kee",
    name: "Han Kee Fish Soup (Amoy Street)",
    cuisine: "teochew",
    lat: 1.2795, lng: 103.8470, priceLevel: 1,
    flavor: vec({ heat: 0.15, sweet: 0.2, soupy: 0.95, fried: 0.15, rich: 0.25, adventure: 0.3 }),
    openHour: 10, closeHour: 15, sheltered: true, source: "curated",
    dishes: [
      { id: "hk-fish-soup", name: "Sliced Fish Soup", flavor: vec({ soupy: 0.95, rich: 0.25, heat: 0.1 }), priceSgd: 6 },
    ],
  },
  {
    id: "amoy-a-noodle-story",
    name: "A Noodle Story (Amoy Street)",
    cuisine: "singapore-ramen",
    lat: 1.2794, lng: 103.8469, priceLevel: 2,
    flavor: vec({ heat: 0.45, sweet: 0.4, soupy: 0.35, fried: 0.5, rich: 0.7, adventure: 0.6 }),
    openHour: 11, closeHour: 14, sheltered: true, source: "curated",
    dishes: [
      { id: "ans-sg-ramen", name: "Singapore-style Ramen", flavor: vec({ rich: 0.7, fried: 0.5, adventure: 0.6, heat: 0.45 }), priceSgd: 11 },
    ],
  },
  {
    id: "lau-pa-sat-satay",
    name: "Lau Pa Sat Satay Street",
    cuisine: "malay",
    lat: 1.2807, lng: 103.8505, priceLevel: 1,
    flavor: vec({ heat: 0.5, sweet: 0.6, soupy: 0.1, fried: 0.4, rich: 0.6, adventure: 0.4 }),
    openHour: 17, closeHour: 23, sheltered: false, source: "curated",
    dishes: [
      { id: "lps-satay", name: "Chicken & Mutton Satay", flavor: vec({ sweet: 0.65, heat: 0.45, rich: 0.6 }), priceSgd: 10 },
    ],
  },
  {
    id: "market-st-nasi-padang",
    name: "Hjh Maimunah Express (CBD)",
    cuisine: "indonesian",
    lat: 1.2846, lng: 103.8500, priceLevel: 1,
    flavor: vec({ heat: 0.7, sweet: 0.45, soupy: 0.3, fried: 0.5, rich: 0.7, adventure: 0.5 }),
    openHour: 10, closeHour: 20, sheltered: true, source: "curated",
    dishes: [
      { id: "hm-beef-rendang", name: "Beef Rendang with Rice", flavor: vec({ heat: 0.65, rich: 0.85, adventure: 0.45 }), priceSgd: 8 },
      { id: "hm-sambal-goreng", name: "Sambal Goreng", flavor: vec({ heat: 0.85, fried: 0.6, rich: 0.6 }), priceSgd: 7 },
    ],
  },
  {
    id: "wingstop-marina",
    name: "Wingstop (Marina Area)",
    cuisine: "american-wings",
    lat: 1.2839, lng: 103.8517, priceLevel: 2,
    flavor: vec({ heat: 0.55, sweet: 0.5, soupy: 0.05, fried: 0.9, rich: 0.7, adventure: 0.35 }),
    openHour: 11, closeHour: 22, sheltered: true, source: "curated",
    dishes: [
      { id: "ws-mango-habanero", name: "Mango Habanero Wings", flavor: vec({ heat: 0.8, sweet: 0.8, fried: 0.9, rich: 0.6 }), priceSgd: 12 },
      { id: "ws-lemon-pepper", name: "Lemon Pepper Wings", flavor: vec({ heat: 0.2, sweet: 0.3, fried: 0.9, rich: 0.55 }), priceSgd: 12 },
      { id: "ws-garlic-parmesan", name: "Garlic Parmesan Wings", flavor: vec({ heat: 0.1, sweet: 0.25, fried: 0.9, rich: 0.8 }), priceSgd: 12 },
      { id: "ws-atomic", name: "Atomic Wings", flavor: vec({ heat: 0.98, sweet: 0.2, fried: 0.9, rich: 0.55, adventure: 0.7 }), priceSgd: 12 },
    ],
  },
  {
    id: "telok-ayer-sushiro",
    name: "Sushiro (Downtown)",
    cuisine: "japanese",
    lat: 1.2823, lng: 103.8480, priceLevel: 2,
    flavor: vec({ heat: 0.15, sweet: 0.35, soupy: 0.2, fried: 0.3, rich: 0.35, adventure: 0.45 }),
    openHour: 11, closeHour: 22, sheltered: true, source: "curated",
    dishes: [
      { id: "sr-salmon-set", name: "Salmon Sushi Set", flavor: vec({ rich: 0.35, adventure: 0.4, heat: 0.05 }), priceSgd: 15 },
      { id: "sr-chirashi", name: "Chirashi Bowl", flavor: vec({ rich: 0.3, adventure: 0.5, heat: 0.05 }), priceSgd: 17 },
    ],
  },
  {
    id: "tanjong-pagar-kbbq",
    name: "Super Star K (Tanjong Pagar)",
    cuisine: "korean",
    lat: 1.2790, lng: 103.8437, priceLevel: 3,
    flavor: vec({ heat: 0.6, sweet: 0.5, soupy: 0.35, fried: 0.5, rich: 0.75, adventure: 0.5 }),
    openHour: 11, closeHour: 23, sheltered: true, source: "curated",
    dishes: [
      { id: "ssk-kbbq-set", name: "KBBQ Lunch Set", flavor: vec({ rich: 0.8, heat: 0.5, sweet: 0.5 }), priceSgd: 20 },
      { id: "ssk-kimchi-jjigae", name: "Kimchi Jjigae", flavor: vec({ heat: 0.7, soupy: 0.9, rich: 0.6 }), priceSgd: 14 },
    ],
  },
  {
    id: "chinatown-mala",
    name: "Ri Ri Hong Mala Xiang Guo (Chinatown)",
    cuisine: "sichuan",
    lat: 1.2825, lng: 103.8434, priceLevel: 1,
    flavor: vec({ heat: 0.9, sweet: 0.2, soupy: 0.2, fried: 0.6, rich: 0.7, adventure: 0.7 }),
    openHour: 11, closeHour: 21, sheltered: true, source: "curated",
    dishes: [
      { id: "rrh-mala-xiangguo", name: "Mala Xiang Guo (medium spicy)", flavor: vec({ heat: 0.85, rich: 0.7, fried: 0.6, adventure: 0.65 }), priceSgd: 10 },
    ],
  },
  {
    id: "raffles-place-salad",
    name: "SaladStop! (Raffles Place)",
    cuisine: "salads",
    lat: 1.2843, lng: 103.8512, priceLevel: 2,
    flavor: vec({ heat: 0.1, sweet: 0.3, soupy: 0.05, fried: 0.05, rich: 0.15, adventure: 0.3 }),
    openHour: 10, closeHour: 20, sheltered: true, source: "curated",
    dishes: [
      { id: "ss-harvest-bowl", name: "Harvest Grain Bowl", flavor: vec({ rich: 0.2, fried: 0.05, heat: 0.05 }), priceSgd: 13 },
    ],
  },
  {
    id: "boat-quay-thai",
    name: "Whole Earth-side Thai Kitchen (Boat Quay)",
    cuisine: "thai",
    lat: 1.2868, lng: 103.8500, priceLevel: 2,
    flavor: vec({ heat: 0.75, sweet: 0.55, soupy: 0.5, fried: 0.4, rich: 0.5, adventure: 0.55 }),
    openHour: 11, closeHour: 22, sheltered: true, source: "curated",
    dishes: [
      { id: "tk-tom-yum", name: "Tom Yum Soup with Rice", flavor: vec({ heat: 0.8, soupy: 0.9, sweet: 0.4, adventure: 0.5 }), priceSgd: 12 },
      { id: "tk-pad-thai", name: "Pad Thai", flavor: vec({ sweet: 0.7, heat: 0.35, fried: 0.5 }), priceSgd: 10 },
    ],
  },
  {
    id: "hong-lim-curry-chicken",
    name: "Ah Heng Curry Chicken Bee Hoon Mee (Hong Lim)",
    cuisine: "singaporean",
    lat: 1.2851, lng: 103.8463, priceLevel: 1,
    flavor: vec({ heat: 0.6, sweet: 0.35, soupy: 0.85, fried: 0.2, rich: 0.7, adventure: 0.4 }),
    openHour: 9, closeHour: 17, sheltered: true, source: "curated",
    dishes: [
      { id: "ah-curry-chicken", name: "Curry Chicken Noodles", flavor: vec({ heat: 0.6, soupy: 0.85, rich: 0.75 }), priceSgd: 6.5 },
    ],
  },
  // BREAKFAST. The catalogue opened at 10-11 almost everywhere, so a 7am pick
  // could only ever resolve to the 24h chain — the most designed screen in the
  // product was selling a mid-scoring burger. These are the CBD's actual
  // breakfast trade, and they are the reason the hero card now lands on a
  // distinctive local stall in the locked band.
  {
    id: "market-st-ah-kow",
    name: "Ah Kow Minced Meat Noodles (Market Street)",
    cuisine: "teochew-noodles",
    lat: 1.2843, lng: 103.8496, priceLevel: 1,
    flavor: vec({ heat: 0.45, sweet: 0.45, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.45 }),
    openHour: 7, closeHour: 15, sheltered: true, source: "curated",
    dishes: [
      { id: "ak-bak-chor-mee", name: "Bak Chor Mee (dry, extra vinegar)", flavor: vec({ heat: 0.45, sweet: 0.4, soupy: 0.35, fried: 0.4, rich: 0.55, adventure: 0.4 }), priceSgd: 6 },
      { id: "ak-mee-pok-soup", name: "Mee Pok Soup", flavor: vec({ heat: 0.25, sweet: 0.35, soupy: 0.85, fried: 0.2, rich: 0.4, adventure: 0.3 }), priceSgd: 6 },
    ],
  },
  {
    id: "far-east-ya-kun",
    name: "Ya Kun Kaya Toast (Far East Square)",
    cuisine: "kopitiam",
    lat: 1.2846, lng: 103.8482, priceLevel: 1,
    flavor: vec({ heat: 0.05, sweet: 0.75, soupy: 0.25, fried: 0.35, rich: 0.45, adventure: 0.2 }),
    openHour: 7, closeHour: 19, sheltered: true, source: "curated",
    dishes: [
      { id: "yk-kaya-toast", name: "Kaya Toast Set", flavor: vec({ heat: 0.02, sweet: 0.85, soupy: 0.2, fried: 0.3, rich: 0.5, adventure: 0.15 }), priceSgd: 6 },
      { id: "yk-kopi", name: "Kopi-O Kosong", flavor: vec({ heat: 0.02, sweet: 0.3, soupy: 0.6, fried: 0.02, rich: 0.3, adventure: 0.2 }), priceSgd: 2 },
    ],
  },
  {
    id: "amoy-ah-ter",
    name: "Ah Ter Teochew Fishball Noodles (Amoy Street)",
    cuisine: "teochew",
    lat: 1.2800, lng: 103.8467, priceLevel: 1,
    flavor: vec({ heat: 0.25, sweet: 0.35, soupy: 0.7, fried: 0.3, rich: 0.35, adventure: 0.3 }),
    openHour: 7, closeHour: 14, sheltered: true, source: "curated",
    dishes: [
      { id: "at-fishball-noodles", name: "Fishball Noodles", flavor: vec({ heat: 0.2, sweet: 0.35, soupy: 0.75, fried: 0.2, rich: 0.3, adventure: 0.25 }), priceSgd: 5 },
    ],
  },
  {
    id: "cbd-mcdonalds",
    name: "McDonald's (One Raffles Place, 24h)",
    cuisine: "fast-food",
    lat: 1.2848, lng: 103.8511, priceLevel: 1,
    flavor: vec({ heat: 0.2, sweet: 0.5, soupy: 0.05, fried: 0.85, rich: 0.6, adventure: 0.05 }),
    openHour: 0, closeHour: 24, sheltered: true, source: "curated",
    dishes: [
      { id: "mcd-mcspicy", name: "McSpicy", flavor: vec({ heat: 0.7, fried: 0.9, rich: 0.6, adventure: 0.1 }), priceSgd: 9 },
      { id: "mcd-big-mac", name: "Big Mac Meal", flavor: vec({ heat: 0.1, fried: 0.8, rich: 0.65, adventure: 0.02 }), priceSgd: 10 },
    ],
  },
];

// Swipe bootstrap cards: dish archetypes tagged in the same flavor space.
// ~60 seconds of swiping yields a usable starting taste vector (PLAN.md Phase 1).
export interface SwipeCard {
  id: string;
  label: string;
  /** A drawn dish glyph — the 96px emoji is gone. See components/glyphs. */
  glyph: DishGlyphKey;
  flavor: FlavorVector;
}

export const SWIPE_CARDS: SwipeCard[] = [
  { id: "c-laksa", label: "Laksa", glyph: "laksa", flavor: vec({ heat: 0.65, soupy: 0.9, rich: 0.75, sweet: 0.4 }) },
  { id: "c-chicken-rice", label: "Chicken Rice", glyph: "chicken-rice", flavor: vec({ heat: 0.15, soupy: 0.2, rich: 0.5, adventure: 0.1 }) },
  { id: "c-mala", label: "Mala Xiang Guo", glyph: "mala", flavor: vec({ heat: 0.9, fried: 0.6, rich: 0.7, adventure: 0.7 }) },
  { id: "c-salad", label: "Grain Bowl / Salad", glyph: "grain-bowl", flavor: vec({ heat: 0.1, fried: 0.05, rich: 0.15, adventure: 0.3 }) },
  { id: "c-fried-chicken", label: "Crispy Fried Chicken", glyph: "fried-chicken", flavor: vec({ fried: 0.95, rich: 0.7, heat: 0.4, sweet: 0.4 }) },
  { id: "c-sushi", label: "Sushi & Sashimi", glyph: "sushi", flavor: vec({ heat: 0.05, fried: 0.1, rich: 0.3, adventure: 0.5 }) },
  { id: "c-tom-yum", label: "Tom Yum Soup", glyph: "tom-yum", flavor: vec({ heat: 0.8, soupy: 0.9, sweet: 0.4, adventure: 0.5 }) },
  { id: "c-burger", label: "Cheeseburger", glyph: "burger", flavor: vec({ fried: 0.75, rich: 0.7, heat: 0.15, adventure: 0.05 }) },
  { id: "c-fish-soup", label: "Sliced Fish Soup", glyph: "fish-soup", flavor: vec({ soupy: 0.95, rich: 0.25, heat: 0.1, adventure: 0.3 }) },
  { id: "c-rendang", label: "Beef Rendang", glyph: "rendang", flavor: vec({ heat: 0.65, rich: 0.85, adventure: 0.45, sweet: 0.4 }) },
  { id: "c-mango-habanero", label: "Sweet-Spicy Glazed Wings", glyph: "wings", flavor: vec({ heat: 0.8, sweet: 0.8, fried: 0.9, rich: 0.6 }) },
  { id: "c-dim-sum", label: "Dim Sum", glyph: "dim-sum", flavor: vec({ heat: 0.15, fried: 0.4, rich: 0.5, adventure: 0.35 }) },
  { id: "c-kbbq", label: "Korean BBQ", glyph: "kbbq", flavor: vec({ rich: 0.8, heat: 0.5, sweet: 0.5, adventure: 0.45 }) },
  { id: "c-pad-thai", label: "Pad Thai (stir-fried noodles)", glyph: "bak-chor-mee", flavor: vec({ sweet: 0.7, heat: 0.35, fried: 0.5, adventure: 0.35 }) },
  { id: "c-porridge", label: "Congee / Porridge", glyph: "porridge", flavor: vec({ soupy: 0.95, rich: 0.3, heat: 0.05, adventure: 0.2 }) },
  { id: "c-omakase", label: "Chef's Choice Omakase", glyph: "chirashi", flavor: vec({ adventure: 0.95, rich: 0.5, heat: 0.3 }) },
];
