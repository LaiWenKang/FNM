import { Context } from "@/lib/context";
import { Dish, Place } from "@/lib/data/seed";
import { Craving, cravingFit } from "@/lib/craving";
import { cuisineFamily } from "@/lib/cuisine";
import { FlavorVector, palateFit, similarity } from "@/lib/flavor";
import type { Profile } from "@/lib/profile-shape";

// The recommendation pipeline from PLAN.md:
//   HARD FILTERS -> SCORE (flavor match + context nudges - recency penalty)
//   -> DIVERSIFY (best / safer / adventurous) -> DISH PICK

/**
 * THE SCORE, DECOMPOSED — five signed contributions that literally SUM to the
 * displayed match score. Every term is derived from a signal the pipeline
 * already computes; nothing here is invented for the graphic, which is the
 * whole point: the card can never show one number and say another.
 */
export interface ScoreBreakdown {
  palate: number;
  distance: number;
  weather: number;
  budget: number;
  novelty: number;
  /** Crowd rating, weighted by how many people it took to get there. Zero for
      curated places, which carry no rating — see qualityTerm. */
  quality: number;
  /** What you actually asked for today. Zero when you asked for nothing. */
  craving: number;
  /** You saved this from a post and have not been yet. Zero otherwise. */
  saved: number;
}

export interface ScoredPlace {
  place: Place;
  /** The craving term that matched, for the UI to name. */
  cravingHit?: string | null;
  score: number;
  /** 1–99, and the sum of `breakdown`. The one number the UI ever renders. */
  matchScore: number;
  breakdown: ScoreBreakdown;
  distanceKm: number;
  walkMinutes: number;
  bestDish: Dish | null;
  reasons: string[];
}

export interface Recommendation {
  best: ScoredPlace;
  safer: ScoredPlace | null;
  adventurous: ScoredPlace | null;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isOpen(place: Place, hourSg: number): boolean {
  if (place.closeHour > place.openHour) {
    return hourSg >= place.openHour && hourSg < place.closeHour;
  }
  // Overnight hours (e.g. 17 -> 2)
  return hourSg >= place.openHour || hourSg < place.closeHour;
}

/** Weather and time-of-day nudges applied to the flavor-match score. */
function contextFit(place: Place, ctx: Context): { delta: number; reasons: string[] } {
  let delta = 0;
  const reasons: string[] = [];
  if (ctx.raining) {
    if (place.flavor.soupy > 0.6) {
      delta += 0.12;
      reasons.push("it's raining — something warm and soupy fits");
    }
    if (place.sheltered) {
      delta += 0.05;
      reasons.push("sheltered from the rain");
    } else {
      delta -= 0.1;
    }
  } else if (ctx.forecast && !ctx.raining && ctx.hourSg >= 12 && ctx.hourSg <= 16) {
    if (place.flavor.rich < 0.35 && place.flavor.fried < 0.3) {
      delta += 0.06;
      reasons.push("light option for a hot afternoon");
    }
  }
  if (ctx.mealPeriod === "breakfast" && place.flavor.rich > 0.7) delta -= 0.08;
  return { delta, reasons };
}

/**
 * COMPARED BY FAMILY, NOT BY LABEL. This used to test `meal.cuisine ===
 * place.cuisine` on a free-text field, so it only fired on an exact string
 * match — and the strings did not match even when the food did. Fishball
 * noodles were "teochew" and minced meat noodles were "teochew-noodles", so
 * two bowls of Teochew noodles on consecutive days registered as unrelated.
 * Live Google places were worse: they carried raw type strings like
 * "japanese_restaurant", which matched no curated place at all, so the penalty
 * could never fire across the two tiers.
 *
 * A same-family repeat now takes a lighter knock than the SAME cuisine, which
 * is the honest ordering: ramen after sushi is repetitive, but less so than
 * sushi after sushi.
 */
function recencyPenalty(place: Place, profile: Profile, now: number): { delta: number; reasons: string[] } {
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
  let delta = 0;
  const reasons: string[] = [];
  const family = cuisineFamily(place.cuisine);
  for (const meal of profile.recent) {
    const age = now - meal.at;
    if (meal.placeId === place.id && age < FIVE_DAYS) delta -= 0.3;
    else if (meal.cuisine === place.cuisine && age < TWO_DAYS) delta -= 0.12;
    else if (family !== "other" && cuisineFamily(meal.cuisine) === family && age < TWO_DAYS) delta -= 0.07;
  }
  if (delta === 0 && profile.recent.length > 0) {
    reasons.push("you haven't had this recently");
  }
  return { delta, reasons };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Presentation scale for the same terms the ranking uses. The RANKING formula is
 * untouched — this only converts those terms into signed points so the card can
 * draw them. Each part is rounded BEFORE summing, so the five bars on screen add
 * up to the number in the ring exactly.
 */
function breakDown(
  flavorMatch: number,
  distanceKm: number,
  ctxDelta: number,
  recencyDelta: number,
  place: Place,
  profile: Profile,
  cravingScore: number,
  palateKnown = true,
): { breakdown: ScoreBreakdown; matchScore: number } {
  const breakdown: ScoreBreakdown = {
    // 62 -> 54 to make room for quality without inflating the total, so the
    // ring keeps the same range it had before the term existed.
    palate: Math.round(flavorMatch * 54),
    distance: Math.round(clamp(18 - distanceKm * 15, -8, 18)),
    weather: Math.round(clamp(ctxDelta * 82, -15, 14)),
    budget: Math.round(clamp((profile.priceMax - place.priceLevel) * 2.4 + 1, -7, 8)),
    /* The repeat penalty is real evidence — it comes from meals actually
       eaten. The adventure bonus beside it is palate-derived, so before
       calibration it takes the same flat midpoint as the palate term: a
       smaller version of the same bug, worth ~4 points of phantom ranking. */
    novelty: Math.round(
      clamp(recencyDelta * 100, -30, 0) +
        (palateKnown
          ? clamp(4 * (1 - Math.abs(place.flavor.adventure - profile.vector.adventure)), 0, 4)
          : 2),
    ),
    quality: qualityTerm(place),
    /* A CRAVING OUTRANKS THE LEARNED PALATE. Someone who typed "ramen" told us
       in plain words; a profile is an inference. A direct hit is therefore
       worth more than any other single term — 45 against palate's 54 ceiling,
       and a hit usually carries a flavour nudge too, so it wins decisively.
       THREE STATES, and the middle one is deliberately neutral:
         HIT     up to +45
         NO HIT  0 — NOT a penalty. Every non-matching place would take the
                 same hit, so it changes no ranking among them; and when
                 nothing matches at all it would drag every score down and
                 print a negative bar on a pick whose only fault is that the
                 user asked for something this street does not sell. The
                 fallback to palate should be quiet, not punitive.
         AVOIDED −34, because "no pork" is an instruction, not a preference. */
    craving: Math.round(cravingScore >= 0 ? cravingScore * 45 : -34),
    /* YOU ALREADY DECIDED YOU WANTED THIS. Saving a post is a deliberate act
       of intent, made when you were not even hungry — which is cleaner
       evidence than most of what the profile infers. The app's job is to
       notice when you are finally standing near it, and 28 is enough to
       surface it over a marginally better stranger without steamrolling an
       explicit craving. */
    saved: place.wantToTry ? 28 : 0,
  };

  /* THE RING CANNOT LIE. The card states "sums to match", and with seven terms
     the raw total can exceed the 99 the ring can draw — at which point a clamp
     would silently break that claim. Scaling the positives keeps every bar an
     honest share of the total AND keeps the arithmetic exact. */
  const raw =
    breakdown.palate +
    breakdown.distance +
    breakdown.weather +
    breakdown.budget +
    breakdown.novelty +
    breakdown.quality +
    breakdown.craving +
    breakdown.saved;

  const keys = ["palate", "distance", "weather", "budget", "novelty", "quality", "craving", "saved"] as const;

  /** Force the bars to sum to `goal` exactly, by scaling one side of the ledger. */
  const fitTo = (goal: number, side: "positive" | "negative") => {
    const negatives = keys.reduce((t, k) => t + Math.min(0, breakdown[k]), 0);
    const positives = raw - negatives;
    if (side === "positive" && positives > 0) {
      const room = goal - negatives;
      for (const k of keys) {
        if (breakdown[k] > 0) breakdown[k] = Math.round((breakdown[k] / positives) * room);
      }
    } else if (side === "negative" && negatives < 0) {
      // Shrink the penalties instead of the credits: at the bottom of the range
      // it is the penalties that have overshot what the ring can draw.
      const room = Math.min(0, goal - positives);
      for (const k of keys) {
        if (breakdown[k] < 0) breakdown[k] = Math.round((breakdown[k] / negatives) * room);
      }
    }
    // Rounding can drift a point or two; put it on the largest bar so the
    // displayed bars sum to the displayed ring EXACTLY.
    const drift = goal - keys.reduce((t, k) => t + breakdown[k], 0);
    if (drift !== 0) {
      const biggest = keys.reduce((a, b) => (Math.abs(breakdown[b]) > Math.abs(breakdown[a]) ? b : a));
      breakdown[biggest] += drift;
    }
    return { breakdown, matchScore: goal };
  };

  /* THE RING CANNOT LIE AT EITHER END. The overflow case was fixed when the
     craving term arrived; the FLOOR was left as a clamp, and a clamp is the
     same quiet lie in the other direction — a pick whose terms summed to −1
     displayed a 1 with bars that added up to −1 beside it. Nothing reached
     that low until the palate term stopped handing out a free ~28 points to
     everything, which is exactly the kind of latent bug a real change
     uncovers. */
  if (raw > 99) return fitTo(99, "positive");
  if (raw < 1) return fitTo(1, "negative");
  return { breakdown, matchScore: raw };
}

/**
 * QUALITY — the one real-world signal in the whole pipeline, and it was being
 * fetched and then thrown away. A 4.6 from 900 people is evidence; a 5.0 from
 * three is noise, so the rating is pulled toward neutral by a confidence factor
 * that only reaches full strength around 200 ratings.
 *
 * Curated places score 0 here rather than a default: they were hand-picked, so
 * inventing a rating for them would put a number on screen that came from
 * nowhere. Zero is honest and it costs them nothing relative to each other.
 */
function qualityTerm(place: Place): number {
  const rating = place.rating;
  const n = place.ratingCount ?? 0;

  // AN UNRATED CURATED PLACE AND AN UNRATED GOOGLE PLACE ARE NOT THE SAME
  // THING, and the first cut treated both as a neutral 0. A curated entry was
  // hand-picked, so silence about its rating carries no information. A live
  // listing with nobody's opinion attached is unvetted by anyone — which is
  // weak evidence, not an absence of evidence, and it let a zero-rating
  // caterer take the top slot in production. Small penalty, not a filter:
  // genuinely new places exist and deserve to surface eventually.
  if (typeof rating !== "number" || n === 0) {
    return place.source === "google" ? -6 : 0;
  }
  if (n < 5) return -3;

  const confidence = Math.min(1, n / 200);
  // 4.0 is the pivot: above it earns, below it loses.
  return Math.round(clamp((rating - 4.0) * 9 * confidence, -10, 10));
}

export function pickBestDish(place: Place, taste: FlavorVector): Dish | null {
  if (!place.dishes.length) return null;
  let best = place.dishes[0];
  let bestSim = -1;
  for (const d of place.dishes) {
    const s = similarity(taste, d.flavor);
    if (s > bestSim) {
      bestSim = s;
      best = d;
    }
  }
  return best;
}

/* ── THE FIRST PICK, BEFORE THE APP KNOWS ANYTHING ────────────────────────
   A brand-new diner can already reach a recommendation without swiping, and
   that is right: making someone answer sixteen questions before their first
   lunch is the opposite of "near-zero input". What was wrong was what the
   score CLAIMED on the way.

   An uncalibrated palate is the neutral vector, every axis at 0.5 — and
   `palateFit` happily scores places against it, handing out a mean of 33 of
   its 54 points across the seed catalogue with a 34-POINT SPREAD between the
   highest and lowest. That spread is the problem. It is not "no information",
   it is WRONG information: it ranks by closeness to the exact midpoint of
   every axis, so it systematically favours the blandest thing on the street
   and penalises anything with a strong character, on behalf of a person who
   has expressed nothing at all.

   So when the palate is unknown, the term becomes a CONSTANT — the midpoint of
   its own range, identical for every candidate. It cannot tilt the ranking,
   because there is nothing to tilt it with; the other terms, which are real
   evidence, decide. And it holds its magnitude rather than dropping to zero,
   because a first pick judged on where you are, what is open, what it costs
   and what it is rated is a genuinely good recommendation, and scoring it 27
   points lower than the identical pick tomorrow would be its own kind of lie. */
export const NO_OPINION = 0.5;

export function recommend(
  profile: Profile,
  places: Place[],
  ctx: Context,
  origin: { lat: number; lng: number },
  excludeIds: string[] = [],
  craving: Craving | null = null,
  /** False before the diner has told us anything. Defaults true: every
      existing caller passes a calibrated profile. */
  palateKnown = true,
): Recommendation | null {
  const now = Date.now();
  const excluded = new Set(excludeIds);

  const scored: ScoredPlace[] = [];
  for (const place of places) {
    if (excluded.has(place.id)) continue;
    const distanceKm = haversineKm(origin.lat, origin.lng, place.lat, place.lng);
    // Hard filters: open now, within travel limit, within budget.
    if (!isOpen(place, ctx.hourSg)) continue;
    if (distanceKm > profile.maxKm) continue;
    if (place.priceLevel > profile.priceMax) continue;

    const flavorMatch = palateKnown ? palateFit(profile.vector, place.flavor) : NO_OPINION;
    const cf = contextFit(place, ctx);
    const rp = recencyPenalty(place, profile, now);
    const cr = cravingFit(place, craving);
    const score =
      flavorMatch + cf.delta + rp.delta - distanceKm * 0.04 + qualityTerm(place) / 100 + cr.score * 1.2;

    // ONE NUMBER. The why-sentence is derived from the SAME value the ring
    // draws, so the card can never show 92 and say 89% four lines apart.
    const { breakdown, matchScore } = breakDown(
      flavorMatch, distanceKm, cf.delta, rp.delta, place, profile, cr.score, palateKnown,
    );

    /* "MATCHES YOUR TASTE" TO SOMEONE WHO HAS NOT TOLD US THEIR TASTE. The
       lead reason was hardcoded, so the very first sentence a new diner ever
       read was the one claim the app could not back. Before calibration it
       says what the pick is ACTUALLY standing on. */
    const reasons = [
      palateKnown
        ? `matches your taste (${matchScore}% match)`
        : `best bet nearby right now (${matchScore}% match)`,
      ...cf.reasons,
      ...rp.reasons,
    ];
    if (typeof place.rating === "number" && (place.ratingCount ?? 0) >= 20) {
      reasons.push(`rated ${place.rating.toFixed(1)} by ${place.ratingCount} people`);
    }
    if (cr.hit) reasons.push(`matches what you're craving (${cr.hit})`);
    if (place.wantToTry) reasons.push("you saved this one");
    scored.push({
      place,
      cravingHit: cr.hit,
      score,
      matchScore,
      breakdown,
      distanceKm,
      walkMinutes: Math.max(1, Math.round((distanceKm / 4.5) * 60)),
      bestDish: pickBestDish(place, profile.vector),
      reasons,
    });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const rest = scored.slice(1);
  // Safer = strong score with lower adventure than the user's comfort ceiling;
  // adventurous = strong score that stretches beyond it.
  const safer =
    rest.find((s) => s.place.flavor.adventure <= profile.vector.adventure) ?? rest[0] ?? null;
  const adventurous =
    rest.find(
      (s) => s !== safer && s.place.flavor.adventure > profile.vector.adventure + 0.1,
    ) ?? rest.find((s) => s !== safer) ?? null;

  return { best, safer, adventurous };
}
