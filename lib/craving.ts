import { cuisineLabel } from "@/lib/cuisine";
import { ask, jsonObject } from "@/lib/llm";
import { Place } from "@/lib/data/seed";
import { DIMS, FlavorVector } from "@/lib/flavor";

// ═══ "I'M CRAVING…" ═══════════════════════════════════════════════════════
//
// The mood chips cover broad shapes — spicy, light, soupy, cheap. They cannot
// express "ramen", "something with cheese", or "korean but not too heavy",
// which is how people actually talk about what they want at 12:15.
//
// THE GOVERNING RULE: A CRAVING OUTRANKS THE LEARNED PALATE. If someone types
// "ramen" and the app serves chicken rice because their profile likes it, the
// app has failed — they told it what they wanted in plain words and it argued.
// So the craving term is worth more than palate (45 vs 54 is close, but a
// literal name hit also carries the flavour nudge, so a real match wins
// decisively). A place that simply does not match scores ZERO rather than a
// penalty — every non-match would take the same hit, changing no ranking among
// them, and when nothing matches at all a penalty would just drag the honest
// fallback down. An explicitly AVOIDED place is a different case and is
// punished hard: "no pork" is an instruction, not a preference.
//
// TWO TIERS, same as everything else here:
//   ZERO KEYS   a lexicon for flavour intent, plus LITERAL TEXT MATCHING
//               against dish, place and cuisine names. The literal match does
//               most of the work: "banana leaf" is in no lexicon and still
//               finds "Indian Banana Leaf Restaurant".
//   WITH A KEY  a model parses negation, cuisine and vagueness the lexicon
//               cannot — "not too heavy", "something like laksa but milder".
//               Anthropic or Gemini, whichever is configured; see lib/llm.ts.

export interface Craving {
  /** What the user typed, trimmed. Echoed back so the UI can show its work. */
  text: string;
  /** Lowercased tokens matched literally against names. The flat union of
      `groups`, kept because callers and the UI already read it. */
  terms: string[];
  /**
   * The same terms, grouped BY THE WORD THE DINER ACTUALLY TYPED — one group
   * per typed concept, holding its synonyms.
   *
   * The distinction decides whether a match is good: synonyms are ALTERNATIVES
   * (typing "salad" should be satisfied by "poke"), while separate words are
   * REQUIREMENTS ("spicy soup" wants both). Scoring over the flat list
   * conflated the two and scored a genuine salad 1-in-3 because the lexicon
   * had expanded one word into three.
   */
  groups: string[][];
  /** Flavour intent, applied to the session vector like a mood. */
  vector: Partial<FlavorVector>;
  /** Terms that must NOT appear — "no pork", "not spicy". */
  avoid: string[];
  priceMax?: 1 | 2 | 3 | 4;
}

/* ── LEXICON ──────────────────────────────────────────────────────────────
   Deliberately small. Its job is flavour INTENT; the literal matcher handles
   identity, and the literal matcher needs no vocabulary. */
const LEXICON: Record<string, { vector?: Partial<FlavorVector>; terms?: string[] }> = {
  spicy: { vector: { heat: 0.88 } },
  hot: { vector: { heat: 0.8 } },
  mala: { vector: { heat: 0.92, rich: 0.7, adventure: 0.6 }, terms: ["mala"] },
  chilli: { vector: { heat: 0.85 } },
  mild: { vector: { heat: 0.15 } },
  soup: { vector: { soupy: 0.9 }, terms: ["soup", "broth"] },
  soupy: { vector: { soupy: 0.9 } },
  brothy: { vector: { soupy: 0.9 } },
  noodle: { terms: ["noodle", "mee", "mian", "ramen", "pho", "udon"] },
  noodles: { terms: ["noodle", "mee", "mian", "ramen", "pho", "udon"] },
  ramen: { vector: { soupy: 0.9, rich: 0.78 }, terms: ["ramen"] },
  rice: { terms: ["rice", "nasi", "don", "bowl"] },
  fried: { vector: { fried: 0.88 } },
  crispy: { vector: { fried: 0.85 } },
  cheese: { vector: { rich: 0.85 }, terms: ["cheese", "cheesy", "pizza", "mac"] },
  cheesy: { vector: { rich: 0.85 }, terms: ["cheese", "cheesy", "pizza"] },
  creamy: { vector: { rich: 0.8 } },
  rich: { vector: { rich: 0.8 } },
  heavy: { vector: { rich: 0.85 } },
  light: { vector: { rich: 0.15, fried: 0.1 } },
  healthy: { vector: { rich: 0.15, fried: 0.08 }, terms: ["salad", "grain", "poke"] },
  salad: { vector: { rich: 0.15, fried: 0.05 }, terms: ["salad", "grain", "poke"] },
  sweet: { vector: { sweet: 0.85 } },
  dessert: { vector: { sweet: 0.92, rich: 0.6 }, terms: ["dessert", "cake", "ice", "sweet"] },
  comfort: { vector: { rich: 0.78, adventure: 0.2 } },
  greasy: { vector: { fried: 0.85, rich: 0.8 } },
  meat: { vector: { rich: 0.75 }, terms: ["beef", "pork", "chicken", "lamb", "steak", "bbq"] },
  meaty: { vector: { rich: 0.78 } },
  seafood: { terms: ["fish", "prawn", "crab", "seafood", "sashimi"] },
  vegetarian: { vector: { rich: 0.25, fried: 0.2 }, terms: ["vegetarian", "vegan", "veg"] },
  vegan: { vector: { rich: 0.2, fried: 0.15 }, terms: ["vegan", "vegetarian"] },
  adventurous: { vector: { adventure: 0.9 } },
  weird: { vector: { adventure: 0.92 } },
};

/** Words that carry no intent and must not become match terms. */
const STOP = new Set([
  "i", "im", "i'm", "am", "a", "an", "the", "some", "something", "want", "wanna", "feel",
  "feeling", "like", "for", "to", "eat", "have", "today", "now", "really", "very", "quite",
  "bit", "of", "and", "or", "my", "me", "craving", "crave", "please", "food", "lunch",
  "dinner", "breakfast", "supper", "meal", "is", "it", "in", "on", "at", "with", "good",
]);

const NEGATORS = new Set(["no", "not", "without", "avoid", "except", "anything", "but"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** The zero-key parser. Always runs; the LLM refines its output when available. */
export function parseCravingLocal(text: string): Craving {
  const clean = text.trim().slice(0, 120);
  const tokens = tokenize(clean);
  const vector: Partial<FlavorVector> = {};
  const terms = new Set<string>();
  const avoid = new Set<string>();
  // One entry per word the diner actually typed — see Craving.groups.
  const groups: string[][] = [];

  let negating = false;
  for (const raw of tokens) {
    const t = raw.replace(/^'+|'+$/g, "");
    if (NEGATORS.has(t)) {
      negating = true;
      continue;
    }
    if (STOP.has(t) || t.length < 2) continue;

    const entry = LEXICON[t];
    if (negating) {
      // "not spicy" inverts the intent rather than merely dropping the word.
      if (entry?.vector) {
        for (const [dim, v] of Object.entries(entry.vector)) {
          vector[dim as keyof FlavorVector] = (v as number) > 0.5 ? 0.1 : 0.85;
        }
      }
      for (const term of entry?.terms ?? [t]) avoid.add(term);
      negating = false;
      continue;
    }
    if (entry) {
      Object.assign(vector, entry.vector ?? {});
      // The lexicon's synonyms for ONE typed word are alternatives to it, so
      // they travel together as a single group.
      const alts = entry.terms ?? [t];
      groups.push([...alts]);
      for (const term of alts) terms.add(term);
    } else {
      // Unknown word — still a literal target. This is the line that makes the
      // zero-key version genuinely useful.
      groups.push([t]);
      terms.add(t);
    }
  }
  return { text: clean, terms: [...terms], groups, vector, avoid: [...avoid] };
}

/** Model refinement — handles negation, cuisine and vagueness a lexicon can't. */
export async function parseCraving(text: string): Promise<Craving> {
  const local = parseCravingLocal(text);
  if (!local.text) return local;

  const reply = await ask({
    maxTokens: 400,
    system:
      "Turn a diner's craving into search intent. Return ONLY JSON, no prose: " +
      '{"terms":[..],"avoid":[..],"flavor":{' + DIMS.join(",") + '},"priceMax":1-4|null}. ' +
      "terms: lowercase words to match against restaurant, cuisine and dish names — include " +
      "synonyms and the local Singapore name where one exists (noodles -> mee, rice -> nasi). " +
      "avoid: words that must NOT appear, for negations like 'no pork' or 'not spicy'. " +
      "flavor: only the dimensions the craving actually implies, each 0..1; omit the rest. " +
      "heat=chilli, sweet=sweetness, soupy=broth, fried=deep-fried, rich=fat/heaviness, " +
      "adventure=unusualness. priceMax only if they mention budget. Be literal: do not " +
      "broaden 'ramen' into 'asian food'.",
    user: local.text,
  });

  const p = jsonObject<{
    terms?: unknown;
    avoid?: unknown;
    flavor?: Record<string, unknown>;
    priceMax?: unknown;
  }>(reply);
  if (!p) return local;

  const strs = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().slice(0, 24)).slice(0, 12)
      : [];
  const vector: Partial<FlavorVector> = {};
  for (const d of DIMS) {
    const v = p.flavor?.[d];
    if (typeof v === "number" && Number.isFinite(v)) vector[d] = Math.max(0, Math.min(1, v));
  }
  const terms = strs(p.terms);
  const price = typeof p.priceMax === "number" && p.priceMax >= 1 && p.priceMax <= 4
    ? (Math.round(p.priceMax) as 1 | 2 | 3 | 4)
    : undefined;
  return {
    text: local.text,
    // Union with the local parse: the model occasionally drops the literal word
    // the user typed in favour of a synonym, and the typed word is the one
    // thing we know for certain they meant.
    terms: [...new Set([...terms, ...local.terms])],
    /* The model is asked for synonyms, so everything it returns is one more
       way of naming the SAME request — one extra alternatives-group, never a
       set of new requirements. Grouping them any other way would let a
       three-synonym answer quietly triple what the diner has to match. */
    groups: terms.length ? [...local.groups, terms] : local.groups,
    avoid: [...new Set([...strs(p.avoid), ...local.avoid])],
    vector: Object.keys(vector).length ? vector : local.vector,
    priceMax: price,
  };
}

/* ── MATCHING ─────────────────────────────────────────────────────────────
   Scored against everything a place is NAMED, because that is what the user
   is picturing: the restaurant, its cuisine, and its dishes. */
function haystack(place: Place): string {
  // BOTH the canonical id and its display label, because they read differently
  // and a user could type either: the id is "fried-chicken", the label is
  // "Fried Chicken", and "bubble-tea" only matches "bubble tea" once the
  // separator is gone.
  return [
    place.name,
    place.cuisine.replace(/[-_]/g, " "),
    cuisineLabel(place.cuisine),
    ...place.dishes.map((d) => d.name),
  ]
    .join(" ")
    .toLowerCase();
}

export interface CravingFit {
  /** −1 (explicitly avoided) … 0 (no signal) … 1 (direct hit). */
  score: number;
  hit: string | null;
}

/**
 * WHOLE WORDS ONLY. Plain `includes` is why "spicy soup" once recommended a
 * McDonald's: the haystack contains the dish "McSpicy", `"mcspicy".includes(
 * "spicy")` is true, and a burger scored a direct hit on a soup craving.
 * Matching on a word boundary costs nothing and removes a whole class of
 * nonsense — while still letting "laksa" find "Laksa Bowl", because that is a
 * word, and "bubble tea" find "bubble-tea" once separators are normalised.
 */
function hasWord(hay: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(term, from);
    if (i === -1) return false;
    const before = i === 0 ? "" : hay[i - 1];
    const after = hay[i + term.length] ?? "";
    // A letter or digit on either side means we landed inside a longer word.
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

export function cravingFit(place: Place, craving: Craving | null): CravingFit {
  // THE GUARD HAS TO ADMIT PURE NEGATIONS. It used to require `terms`, and
  // "no pork" produces NO terms — the word goes to `avoid` — so an outright
  // instruction not to serve someone something was silently discarded before
  // the avoid list was ever consulted.
  if (!craving || (!craving.terms.length && !craving.avoid.length)) return { score: 0, hit: null };
  const hay = haystack(place);

  for (const bad of craving.avoid) {
    if (bad.length > 2 && hasWord(hay, bad)) return { score: -1, hit: null };
  }

  /* SCORED BY HOW MUCH OF THE REQUEST WAS ACTUALLY MET. A flat 0.7 for any
     single hit meant "spicy soup" paid a stall almost as much for the word
     "spicy" alone as it paid a real spicy soup for both — a partial match was
     worth 70% of a perfect one, which is how a burger out-ranked the thing
     that was asked for.

     Coverage is counted over GROUPS, not raw terms: a group is one word the
     diner typed, and it is satisfied by ANY of its synonyms. So "salad" still
     scores a full 1.0 when a place matches "poke", while "spicy soup" needs
     both halves to earn the whole bonus. */
  const groups = (craving.groups?.length ? craving.groups : craving.terms.map((t) => [t]))
    .map((g) => g.filter((t) => t.length > 2))
    .filter((g) => g.length > 0);
  if (!groups.length) return { score: 0, hit: null };

  let hits = 0;
  let first: string | null = null;
  for (const group of groups) {
    const found = group.find((term) => hasWord(hay, term));
    if (found) {
      hits += 1;
      first ??= found;
    }
  }
  if (!hits) return { score: 0, hit: null };

  return { score: Math.min(1, hits / groups.length), hit: first };
}
