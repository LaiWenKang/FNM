# FNM — Food Near Me

A near-zero-input **food decision engine**: open it, and it tells you where (and what) to eat — one confident pick, two backups, under 60 seconds. Not another restaurant list.

Full product plan: [PLAN.md](./PLAN.md).

## What's in this Phase 1 scaffold

- **Swipe bootstrap** (`/onboarding`) — ~16 dish cards build your flavor-level taste vector in about a minute.
- **"Eat now"** (`/recommend`) — hard filters (open now, distance, budget) → flavor-vector scoring → context nudges (rain → soupy/warm via the free NEA weather API; recency penalty so you don't repeat meals) → 1 best pick + safer + adventurous alternatives, each with a one-line "why".
- **Dish-level picks** for the curated catalog (e.g. Wingstop → Mango Habanero if you like sweet-heat) — tier 1 of the dish/flavor catalog in PLAN.md.
- **"Craving anything?"** — type it in plain words (`ramen`, `cheesy`, `not spicy`, `korean but light`) and it goes straight into the ranking. A craving **outranks the learned palate**: you said it out loud, so it wins. Works with zero keys via a lexicon plus literal name matching; `ANTHROPIC_API_KEY` adds negation and synonym handling.
- **Eat together** (`/g/[code]`) — one tap opens a group, you send the link, and everyone who taps it lands on the same decision. See below.
- **PWA** — add to home screen from the browser; no app store needed.

Runs with **zero API keys**: a curated Singapore CBD place catalog is built in, explanations fall back to templates, and your taste profile lives in a cookie. Everything below is an upgrade, not a requirement — but note that without `GOOGLE_PLACES_API_KEY` the app only knows 14 hand-curated places in the Singapore CBD, so it is only useful if you are standing in one.

### Two tiers of place data, and the app says which it is using

| Tier | Source | What it knows |
|---|---|---|
| **Curated** | built in | Dish level — a named dish, its price, and a flavour vector per dish. |
| **Live** | Google Places | Restaurant level. A flavour *estimate* averaged from the place's Google types, plus a real crowd rating. |
| **Mined** | Google reviews → Claude | Dish level, for live places. Claude reads the review text and extracts the dishes people actually name as worth ordering, with a flavour vector each. Needs `ANTHROPIC_API_KEY`. |

Without an Anthropic key a live place stays restaurant-level and the card says
so, rather than inventing a dish nobody ordered.

### How dish mining stays cheap

Three constraints shape it:

1. **Reviews are the expensive Places SKU.** Putting `reviews` in the *nearby
   search* field mask would bill atmosphere data for all 20 results on every
   request, to use at most three. So the nearby search stays cheap and reviews
   are fetched per place, only for the picks actually shown.
2. **Enrichment runs AFTER ranking**, not before — at most three places instead
   of twenty.
3. **One call per place, ever.** Results are cached for six weeks in a Postgres
   `place_dishes` table (or memory without `DATABASE_URL`), including *empty*
   results: a place whose reviews name no dish will still name none tomorrow.

A place's aggregate flavour vector is replaced by the mean of its mined dishes
and cached, so the *next* request for it ranks on real menu data rather than a
type estimate — the catalogue sharpens as it is used. Every failure path
returns the place unchanged; a slow LLM, a rate limit or a bad key degrades to
the restaurant-level card and never blocks a recommendation.

Live places also carry `flavorKnown` and `hoursKnown` flags, so the UI can tell
an estimate from a reading and never prints a closing time it does not actually
have.

## Run it locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Optional keys (`.env.local`, see `.env.example`)

| Key | Adds |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Live nearby restaurants merged into the candidate pool, with real crowd ratings and opening hours |
| `ANTHROPIC_API_KEY` | Claude-written "why this pick" explanations |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` + `AUTH_SECRET` | Google sign-in |
| `REQUIRE_AUTH=true` | Makes sign-in mandatory (ignored unless Google keys are set) |
| `DATABASE_URL` | Postgres — signed-in profiles sync across devices, **and group links become reliable** |

## "Craving anything?"

The mood chips cover broad shapes — spicy, light, cheap. They cannot say
*ramen*, *something with cheese*, or *korean but not too heavy*, which is how
people actually name what they want at 12:15. The craving line takes free text.

**The governing rule: a craving outranks the learned palate.** If you type
"ramen" and the app serves chicken rice because your profile likes it, the app
argued with you — and that is the exact failure this exists to prevent. So a
direct hit is the largest single term in the score, and a place matching nothing
you asked for is *penalised* rather than merely missing a bonus. Without that
asymmetry the gap between "what you asked for" and "what your profile likes" is
too narrow to be decisive.

It never dead-ends. If nothing nearby matches, you still get a pick — and the
screen says *"Nothing nearby matches «ramen» right now — here's the closest
thing."* An app that looked and came up short is a different thing from one that
ignored you.

Two tiers, like everything else here:

| | How it parses |
|---|---|
| **Zero keys** | A small lexicon for flavour intent, plus **literal matching** against place, cuisine and dish names. The literal matcher does most of the work and needs no vocabulary — *"banana leaf"* is in no lexicon and still finds *Indian Banana Leaf Restaurant*. |
| **With `ANTHROPIC_API_KEY`** | Claude handles what a lexicon cannot: negation (*"no pork"*), cuisine, and vagueness (*"something like laksa but milder"*). Its output is unioned with the local parse, because it occasionally swaps the typed word for a synonym and the typed word is the one thing we know for certain you meant. |

## Eat together — the group link

Tap **Eat together** on the home screen. You get a six-character code and a
shareable link; anyone who opens it types a name, answers three quick yes/no
dish cards (or brings their real palate if they have already calibrated), and
joins. One tap then produces a single pick the whole group can live with.

**The math is the interesting part.** Two failure modes pull in opposite
directions, and picking either one alone gives a bad answer:

- **The bland centroid.** Average everyone's flavour vector and you get a dish
  nobody chose — average someone who wants fire with someone who wants congee
  and you recommend lukewarm porridge to two disappointed people.
- **The tyranny of one.** Optimise purely for the least-happy member and one
  fussy eater silently dictates lunch for six.

So a candidate's group score is `0.6 × mean + 0.4 × minimum` across members.
The mean keeps the pick broadly good; the minimum floor stops the group landing
on something one person actively cannot eat. The result screen lists **every
member's individual score, worst first**, and names the person the pick serves
worst — a group tool that quietly overrules someone is worse than one that says
so out loud.

Distance and budget ceilings are **not** averaged; the strictest member's limit
becomes everyone's. Those are constraints, not preferences, and averaging a
constraint breaks it. Members who have not shown a taste yet are excluded from
the vote rather than counted as neutral, and the screen says how many had no
say.

Groups expire after 6 hours and cap at 12 people. **With `DATABASE_URL` set**
they are stored in a Postgres `groups` table and are reliable. **Without it**
they are held in process memory — serverless instances do not share memory, so
a friend can be routed to an instance that has never heard of the group. The
group screen says so before you send the link.

## Where user data is stored

| State | Storage |
|---|---|
| Signed out, or no `DATABASE_URL` | The taste profile lives in an httpOnly cookie **on the user's own device**. Nothing leaves the phone. |
| Signed in with `DATABASE_URL` set | One row in a Postgres `profiles` table (created automatically), keyed by the Google account id, so the profile follows the user across devices. Use Neon or Supabase in the Singapore region. |
| Group members | An opaque random device id in an httpOnly cookie — **not** an account, and it carries no personal data. The display name is whatever you type when joining and never leaves that group. Deliberately separate from sign-in, because making six people authenticate before lunch defeats the point of a forwardable link. |

Stored per user: the six-dimension flavour vector, swipe count, distance and
budget settings, and recent meals (for the "don't repeat" penalty). Never
stored: contacts, payment details, or a location history — the plan bar's
location is used for the request and not retained.

## Deploy

Push to GitHub → import the repo in [Vercel](https://vercel.com) → add the optional env vars → deploy. The PWA is live at your Vercel URL; share the link and friends can add it to their home screen.

## Architecture (Phase 1)

```
Browser (PWA, geolocation, taste-profile cookie)
   └─ Next.js (app router)
        ├─ /api/swipe       nudges the flavor vector per swipe
        ├─ /api/recommend   filters → scores → diversifies → explains
        ├─ /api/pick        records the chosen meal (implicit tracking)
        ├─ lib/flavor.ts    shared user/dish flavor space
        ├─ lib/scoring.ts   recommendation pipeline
        ├─ lib/context.ts   SG time, meal period, NEA weather
        ├─ lib/places.ts    curated catalog + optional Google Places
        └─ lib/explain.ts   Claude (optional) or template explanations
```

Next up (see PLAN.md): group sessions via shared link (Phase 2), social imports and LLM review mining (Phase 3), native wrapper + health integration (Phase 3.5).
