# FNM (Food Near Me) — Product Plan

A near-zero-input food decision engine that learns what you and your group enjoy,
understands the current context, and confidently recommends where to eat.

**Not** another restaurant-review platform. The user's problem is not discovering
restaurants — it is reaching a confident decision quickly. Every session ends with
one strong recommendation and two alternatives, in under 60 seconds.

---

## 1. Core Principles

1. **Decide, don't list.** Output is always 1 best match + 2 alternatives (one safer,
   one more adventurous). Never an endless scroll.
2. **Near-zero input.** Infer context automatically (location, time, weather, history).
   Ask only when a missing answer would materially change the recommendation, and ask
   with one-tap choices, never forms.
3. **Learn passively.** Every selection, veto, and "not feeling it" is training data.
   No long onboarding questionnaire.
4. **Explain every pick.** Show *why* this matches ("within your usual budget, sheltered
   walk in the rain, not eaten recently, no group member objects").
5. **Trust rule.** A restaurant can never pay to become the hidden best match. Sponsored
   placements are always visibly labelled and never occupy the "best match" slot.

## 2. Target Wedge: Singapore Office Lunch Groups

Why this segment:

- Recurring daily use case with predictable start location, tight time window, and clear budget.
- Repeated group members → fastest possible preference learning.
- "Decide your team's lunch in under 60 seconds, without repeating recent meals or
  excluding anyone" is a concrete, testable promise.

Known reality check (plan for it, don't discover it later):

- Lunch there heavily means hawker centres and kopitiams, where Google Places coverage
  is weakest — individual stalls are often unlisted or unrated.
- Queue length is a real constraint no API exposes.
- **Mitigation:** manually curate restaurant/stall data for 2–3 CBD clusters at launch.
  Treat curation of one neighbourhood as part of MVP scope, not as a failure of automation.

## 3. Phased Roadmap

### Phase 0 — Concierge validation (1–2 weeks, no product code)

Run the service manually in 2–3 real office lunch WhatsApp groups: collect preferences
once, then post a daily "today's pick + 2 alternates + why" before lunch.

- Validates: will groups accept a top pick? What vetoes actually occur? Is 60 seconds real?
- If groups won't accept a recommendation from an attentive human, they won't accept one
  from an algorithm. Kill or reshape the idea here for near-zero cost.

### Phase 1 — Solo MVP (~4–6 weeks)

The smallest product that delivers the core promise for one person.

- **Platform:** PWA (mobile web). No app-store friction, and shareable links are the
  Phase 2 growth mechanic — the web is where links work.
- **"Eat now" flow only.** Open app → (first time: swipe bootstrap) → 1+2 recommendations
  → pick one or tap "not feeling it" (regenerates with the rejection as signal).
- **Cold-start swipe bootstrap:** first session shows ~20 *dish* photo cards to swipe
  (yes/no), each tagged along flavor dimensions (heat, sweet/savory, saucy/dry,
  fried/soupy, rich/light, familiar/adventurous). Fun, on-brand, ~60 seconds, and yields
  a *flavor-level* taste vector before the first recommendation. This resolves the
  near-zero-input vs. personalisation contradiction at day one.
- **Dish/flavor catalog, tier 1 — chains:** hand-curate the signature menus of the top
  ~50 chains in Singapore (Wingstop, etc.), mapping each item to the flavor dimensions
  once. Small, standardized, public menus make this ~a week of work, and it makes
  dish-level output ("Wingstop — get Mango Habanero, matches your sweet-heat profile")
  real at launch. Where dish data exists, recommend the dish; where it doesn't, recommend
  the restaurant — degrade gracefully, grow coverage weekly.
- **Hard filters:** open now, within travel limit, within budget, dietary restrictions.
- **Scoring:** taste-vector match (cuisine, price band, distance tolerance,
  familiar-vs-adventurous) + context adjustments (meal period, rain → closer/sheltered,
  recency penalty for recently eaten cuisines/places).
- **Implicit meal history:** a selected recommendation counts as eaten unless corrected.
  Post-meal one-tap feedback (👍/👎) is optional gravy — never depend on it.
- **Explanations:** short LLM-generated "why this matches you" from structured signals.
- **Data:** Google Places API (Nearby Search + Place Details) for identity, hours,
  ratings, price level, photos + manual curation layer for hawker clusters. Respect
  Places caching/ToS limits (store place IDs, refresh details on demand). Weather from
  Singapore NEA realtime API (free).

Explicitly **not** in Phase 1: group mode, social imports, fairness rotation,
delivery/reservations, any native app. (Dish-level output *is* in Phase 1, but only for
the curated chain tier — see the dish/flavor catalog tiers below.)

### Phase 2 — Group mode (the moat + the growth loop)

- One person starts a session, shares a link; joiners need no registration.
- Existing users auto-contribute saved preferences; new joiners answer 2–3 one-tap
  questions (dietary, budget, veto anything?).
- Group scoring v1 is deliberately simple: hard filters union across members, drop
  anything any member strongly vetoes, then rank by average fit with a floor on the
  least-satisfied member. **No fairness rotation yet** — it needs longitudinal data that
  doesn't exist at launch, and veto + budget + no-strong-objection covers most real friction.
- Every group session recruits new users — this is the primary growth mechanic.

- **Dish/flavor catalog, tier 2:** LLM batch job mines review text for dish mentions
  ("must try the salted egg chicken, not too spicy") → extracts dish name, sentiment,
  and flavor attributes into the catalog. Runs offline, cached; coverage compounds.

### Phase 3 — Learning depth + social imports

- Fairness across repeated group meals (rotate whose preference leads) — now the
  history exists to power it.
- **User-imported discoveries:** paste a TikTok/Rednote/Douyin/Instagram link (later:
  screenshots) → extract restaurant name, recommended dishes, sentiment, creator, source
  link → add to the user's "want to try" pool and boost it in scoring. This is the legal,
  user-initiated answer to social-platform data — no scraping.
- **Dish/flavor catalog, tier 3:** enriched from imported social content and post-meal
  feedback. Note: dish data is *not* available from Google Places; it is earned through
  the three catalog tiers (curated chains → LLM review mining → imports/feedback), each
  widening coverage from independent restaurants outward.
- Trusted-source graph: which creators/friends does this user's taste actually track?

### Phase 4 — Monetisation + expansion

Only after repeat decision usage is proven (see metrics):

- Booking/ordering commissions; labelled sponsored discovery (per the trust rule);
  premium planning features (dates, travel); restaurant insight tools.
- Expand segments: couples/dates, friend groups, travellers. Expand geography city by
  city — recommendation quality is hyper-local.

## 4. AI & Algorithm Architecture

Hybrid design: a deterministic scoring core, with LLMs at the language-shaped edges.
The LLM never picks the restaurant directly at request time — that would cost seconds
of latency, money per session, inconsistent answers for identical inputs, and
hallucination risk. Instead, each judgment has a designated owner:

| Judgment | Owner | Notes |
|---|---|---|
| Open now / budget / distance / dietary | Database filters | Deterministic facts; no AI |
| Taste & flavor match | Vector similarity | User flavor vector vs. dish/restaurant attribute vector; weighted score, <100ms over hundreds of candidates |
| Extracting dishes + flavors from reviews & imported links | LLM (batch, offline) | Unstructured text → structured catalog rows; cached, zero request-time cost |
| "Why this pick" explanation | LLM (request time) | One cheap call rendering structured signals into a human sentence |
| Free-text mood ("something soupy, not spicy") | LLM | Parses into filter/scoring adjustments; optional input, never required |
| Learning from selections, vetoes, "not feeling it" | Online weight updates (bandit-style) | Each action nudges the flavor dimensions it evidences |
| "Users with your taste loved this" | Collaborative filtering (later) | Needs usage volume first; this is the long-term taste-graph moat |

### Recommendation pipeline (v1)

```
candidates = places within radius
  → HARD FILTERS: open now, travel limit, budget, dietary
  → SCORE: w1·flavorMatch + w2·contextFit − w3·recencyPenalty (+ groupFloor in Phase 2)
  → DIVERSIFY: best match + safer alternative + more adventurous alternative
  → DISH PICK: where the catalog covers this place, attach the best-matching dishes
  → EXPLAIN: LLM renders structured reasons into one human sentence per pick
```

Weights start hand-tuned; revisit with real outcome data. For the latency-tolerant
"plan somewhere" flow, an optional LLM re-rank of the top ~10 scored candidates can
boost quality; "eat now" skips it. No deep-learning infrastructure until the simple
model demonstrably plateaus.

### Flavor model

Users and dishes share one attribute space: heat, sweet/savory, saucy/dry, fried/soupy,
rich/light, familiar/adventurous, plus cuisine affinities, price band, and distance
tolerance. The swipe bootstrap initialises the user vector; every subsequent action
refines it. Dish vectors come from the three-tier catalog (curated chains → LLM review
mining → imports/feedback). Same-space matching is what makes flavor-level output like
"get the Mango Habanero" a dot product, not a special case.

## 5. Privacy

- Request only necessary permissions and say why; approximate location when precise
  isn't needed.
- Users can delete location history, taste profile, imports, and meal history.
- Private dislikes are never revealed to other group members (a veto is anonymous).
- Never sell identifiable preference or location data.

## 6. Success Metrics

**Primary: successful food decisions per active user per week.**

Secondary: median decision time; % of sessions selecting one of the top 3; group veto
rate; repeat group usage; 4-week retention; % of sessions that end with the user
searching elsewhere anyway (failure signal).

## 7. Key Risks

| Risk | Mitigation |
|---|---|
| Cold start: first recommendation is generic | Dish-photo swipe bootstrap yields a flavor vector before first recommendation |
| Hawker/stall data coverage is poor | Manual curation of launch clusters is in-scope for MVP |
| Dish/flavor data doesn't exist off the shelf | Three-tier catalog: curated chains at launch, LLM review mining, then imports/feedback; degrade to restaurant-level where uncovered |
| Post-meal feedback won't be given | Implicit tracking; selection = eaten unless corrected |
| Google Places ToS limits storage | Store place IDs, fetch details on demand, cache within policy |
| Habit competition ("we just walk downstairs") | Phase 0 concierge test proves/disproves demand before build |
| Group mode never goes viral | Solo MVP must retain on its own; group is upside, not a prerequisite |

## 8. Suggested Stack

- **Frontend:** Next.js PWA (React), mobile-first.
- **Backend:** Next.js API routes or a small Node service; Postgres (users, taste
  vectors, sessions, curated places, meal history).
- **External:** Google Places API, Singapore NEA weather API, Claude API for
  explanation generation and (Phase 3) import parsing.
- **Hosting:** any serverless platform (Vercel/Fly/Railway) — optimise for iteration
  speed, not scale, until metrics justify otherwise.
