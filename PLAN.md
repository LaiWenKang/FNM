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
- **Cold-start swipe bootstrap:** first session shows ~20 food/restaurant photo cards to
  swipe (yes/no). Fun, on-brand, ~60 seconds, and yields a usable taste vector *before*
  the first recommendation. This resolves the near-zero-input vs. personalisation
  contradiction at day one.
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

Explicitly **not** in Phase 1: group mode, social imports, dish-level recommendations,
fairness rotation, delivery/reservations, any native app.

### Phase 2 — Group mode (the moat + the growth loop)

- One person starts a session, shares a link; joiners need no registration.
- Existing users auto-contribute saved preferences; new joiners answer 2–3 one-tap
  questions (dietary, budget, veto anything?).
- Group scoring v1 is deliberately simple: hard filters union across members, drop
  anything any member strongly vetoes, then rank by average fit with a floor on the
  least-satisfied member. **No fairness rotation yet** — it needs longitudinal data that
  doesn't exist at launch, and veto + budget + no-strong-objection covers most real friction.
- Every group session recruits new users — this is the primary growth mechanic.

### Phase 3 — Learning depth + social imports

- Fairness across repeated group meals (rotate whose preference leads) — now the
  history exists to power it.
- **User-imported discoveries:** paste a TikTok/Rednote/Douyin/Instagram link (later:
  screenshots) → extract restaurant name, recommended dishes, sentiment, creator, source
  link → add to the user's "want to try" pool and boost it in scoring. This is the legal,
  user-initiated answer to social-platform data — no scraping.
- **Dish-level intelligence:** mined from imported content + review text + user feedback.
  Note: this is *not* available from Google Places; it must be earned here. Dish-level
  recommendations ("get the beef noodles") ship only when this exists.
- Trusted-source graph: which creators/friends does this user's taste actually track?

### Phase 4 — Monetisation + expansion

Only after repeat decision usage is proven (see metrics):

- Booking/ordering commissions; labelled sponsored discovery (per the trust rule);
  premium planning features (dates, travel); restaurant insight tools.
- Expand segments: couples/dates, friend groups, travellers. Expand geography city by
  city — recommendation quality is hyper-local.

## 4. Recommendation Logic (v1)

```
candidates = places within radius
  → HARD FILTERS: open now, travel limit, budget, dietary
  → SCORE: w1·tasteMatch + w2·contextFit − w3·recencyPenalty (+ groupFloor in Phase 2)
  → DIVERSIFY: best match + safer alternative + more adventurous alternative
  → EXPLAIN: LLM renders structured reasons into one human sentence per pick
```

Weights start hand-tuned; revisit with real outcome data. No deep-learning
infrastructure until the simple model demonstrably plateaus.

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
| Cold start: first recommendation is generic | Swipe bootstrap before first recommendation |
| Hawker/stall data coverage is poor | Manual curation of launch clusters is in-scope for MVP |
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
