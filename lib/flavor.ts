// The shared flavor space. Users and dishes/places are vectors in the same
// space, so "which dish suits you" is a similarity computation, not a special case.

export const DIMS = [
  "heat", // spice level tolerance / spiciness of dish
  "sweet", // sweet vs savory lean
  "soupy", // soupy/wet vs dry
  "fried", // fried/crispy vs light
  "rich", // rich/heavy vs clean/light
  "adventure", // familiar vs adventurous
] as const;

export type Dim = (typeof DIMS)[number];
export type FlavorVector = Record<Dim, number>; // each dimension in [0, 1]

export function neutralVector(): FlavorVector {
  return { heat: 0.5, sweet: 0.5, soupy: 0.5, fried: 0.5, rich: 0.5, adventure: 0.5 };
}

export function vec(partial: Partial<FlavorVector>): FlavorVector {
  return { ...neutralVector(), ...partial };
}

/* ── HOW WELL A DISH SUITS A PALATE ───────────────────────────────────────
   AXES YOU HAVE NO OPINION ABOUT USED TO COUNT AS MUCH AS THE ONES YOU DO.
   A flat mean over six axes meant somebody sitting at soupy 0.95 and heat
   0.50 had their indifference to chilli drag on the score exactly as hard as
   their love of broth. With six axes and only one or two strong opinions
   apiece, the four quiet ones swamped the signal: measured across the
   catalogue, the palate term moved only 16 points of its 54-point budget,
   handing every place a near-constant ~34 and leaving the app's entire
   premise — this is matched to YOUR taste — the least decisive term in the
   ranking, behind novelty, weather and distance.

   So each axis is weighted by how strongly the palate holds an opinion on it.
   The floor matters as much as the weighting: without it a brand-new profile
   sitting at 0.5 everywhere would have every weight at zero and no opinion at
   all, and with it a neutral palate degrades cleanly to the flat mean this
   used to be. Someone with real preferences gets those preferences amplified;
   someone with none is not punished for it.

   ASYMMETRIC ON PURPOSE — the first argument is the diner, the second is the
   food. All three call sites pass them that way round.

   Returns [0, 1]: 1 = exactly your thing, 0 = the opposite of it. */
const OPINION_FLOOR = 0.25;

export function similarity(taste: FlavorVector, item: FlavorVector): number {
  let weighted = 0;
  let total = 0;
  for (const d of DIMS) {
    const opinion = Math.max(OPINION_FLOOR, Math.abs(taste[d] - 0.5) * 2);
    weighted += opinion * Math.abs(taste[d] - item[d]);
    total += opinion;
  }
  return 1 - weighted / total;
}

/**
 * The same comparison, scaled so the number means something.
 *
 * HALF MARKS FOR A COIN FLIP was the other half of the problem. Raw similarity
 * across real food never drops below about 0.5 — no restaurant is the exact
 * opposite of you on all six axes at once — so scoring it directly handed
 * every candidate roughly half the palate budget before anything was compared.
 * That constant is not a match, it is a floor, and it drowned the part that
 * actually varied.
 *
 * 0.5 is the honest zero: a place as different from you as it is similar tells
 * you nothing, and should contribute nothing. Everything above it is stretched
 * across the full range, so the palate term finally swings as widely as the
 * terms it is supposed to outrank.
 */
export function palateFit(taste: FlavorVector, item: FlavorVector): number {
  return clamp01((similarity(taste, item) - 0.5) * 2);
}

/* ── WHAT A DISH ACTUALLY CLAIMS ──────────────────────────────────────────
   0.5 means "this dish says nothing about that axis", because `vec()` fills
   every unwritten dimension with it. Omakase is a statement about ADVENTURE;
   it has no opinion on soupiness. Treating that silence as a claim of
   "medium" was the single biggest source of bad calibration:

     · LIKING it dragged every unmentioned axis toward the middle. A soup
       lover sitting at soupy 0.95 who liked omakase came out at 0.815 — the
       app un-learned something true because of a dish that never mentioned it.
     · REJECTING it was worse. The push is away from the target, so on an axis
       the dish never claimed, `v - 0.5` pushes v FURTHER from centre. Saying
       no amplified whatever bias you already had, out of nothing.

   So a dimension only moves if the dish speaks to it. The threshold is small
   — anything inside ±0.08 of neutral carries no information worth acting on
   anyway. */
export const SPEAKS = 0.08;

export function asserts(target: FlavorVector, d: Dim): boolean {
  return Math.abs(target[d] - 0.5) >= SPEAKS;
}

/**
 * Move `v` toward (liked) or away from (disliked) `target`.
 *
 * LIKING AND REJECTING ARE NOT MIRROR IMAGES, and treating them as such was
 * the second calibration bug. A yes is conjunctive — you accepted the whole
 * dish, so every axis it claims earns full weight. A no is DISJUNCTIVE: one
 * thing was wrong, and you never said which. Pushing away equally on all of
 * them punishes four axes for one axis's crime — rejecting Mala Xiang Guo
 * moved heat, fried, rich AND adventure, so a soup lover who simply turned
 * down every dry dish was recorded as a chilli fiend at heat 0.96.
 *
 * A REJECTION MOVES EXACTLY ONE AXIS: the one it blames. Blame is how loudly
 * the dish claims that axis multiplied by how far the claim sits from what you
 * have already shown you want, so a soup lover turning down a salad is
 * recorded as "not soup" — even though the salad is loudest about being
 * un-fried, and even though it is also mild, dry and cheap. Spreading the push
 * proportionally across every axis instead was still wrong, and subtly: once
 * `soupy` pins at 1.0 it can absorb no more, but the leftover shares kept
 * landing on the other axes, so nine rejections of dry food quietly walked a
 * soup lover's heat from 0.42 up to 0.65 — a taste for chilli assembled
 * entirely out of dishes they turned down for having no broth in them.
 *
 * Early on, while the profile is still neutral, blame reduces to loudness,
 * which is the right guess when nothing is known yet.
 */
export function nudge(
  v: FlavorVector,
  target: FlavorVector,
  liked: boolean,
  weight: number,
  /** The axis the diner NAMED. Beats the guess below, because it is not one. */
  blameOn?: Dim,
): FlavorVector {
  const out = { ...v };
  if (Math.max(...DIMS.map((d) => Math.abs(target[d] - 0.5))) < SPEAKS) return out;

  if (liked) {
    for (const d of DIMS) {
      if (asserts(target, d)) out[d] = clamp01(v[d] + (target[d] - v[d]) * weight);
    }
    return out;
  }

  let culprit: Dim | null = blameOn && asserts(target, blameOn) ? blameOn : null;
  if (!culprit) {
    let worst = 0;
    for (const d of DIMS) {
      if (!asserts(target, d)) continue;
      const blame = Math.abs(target[d] - 0.5) * Math.abs(v[d] - target[d]);
      if (blame > worst) {
        worst = blame;
        culprit = d;
      }
    }
  }
  if (!culprit) return out;

  /* AND IT MOVES BY SURPRISE, NOT BY DISTANCE. Pushing away in proportion to
     `v - target` means the further you already are from a dish, the harder
     rejecting it shoves you — which is backwards, and it runs away: an axis
     that drifts becomes the explanation for every later rejection, which
     drifts it further. Turning down all sixteen cards used to land you at heat
     0.98, a violent opinion assembled from nothing but refusals.

     Rejecting a dish you look nothing like is unsurprising and teaches almost
     nothing; rejecting one you look exactly like is the informative case. So
     the step shrinks as the gap grows, and the axis settles instead of
     sprinting to the wall.

     SQUARED, chosen by measurement rather than taste. Linear damping still let
     sixteen refusals reach heat 0.86; squared brings that to 0.57 — near
     enough to neutral to be the honest answer, which is that someone who liked
     none of it has told us almost nothing — while a genuine soup lover still
     lands at soupy 0.81 and a chilli head at heat 0.81. Cubed damps the
     degenerate case a little further but starts blunting the real ones. */
  const gap = Math.abs(v[culprit] - target[culprit]);
  const away = gap === 0 ? (target[culprit] < 0.5 ? 1 : -1) : Math.sign(v[culprit] - target[culprit]);
  out[culprit] = clamp01(v[culprit] + away * weight * (1 - gap) ** 2);
  return out;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Human-readable sketch of a taste vector, used in explanations. */
export function describeTaste(v: FlavorVector): string {
  const parts: string[] = [];
  if (v.heat > 0.65) parts.push("spicy");
  else if (v.heat < 0.35) parts.push("mild");
  if (v.sweet > 0.65) parts.push("sweet-leaning");
  if (v.soupy > 0.65) parts.push("soupy");
  if (v.fried > 0.65) parts.push("crispy");
  if (v.rich > 0.65) parts.push("rich");
  else if (v.rich < 0.35) parts.push("light");
  if (v.adventure > 0.65) parts.push("adventurous");
  return parts.length ? parts.join(", ") : "balanced";
}
