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

### When the type table runs out, the name is asked instead

Measured against production across eight areas of the island: **nine of fourteen
live picks had no flavour data**, and the same nine fell through to the generic
cuisine `"restaurant"`. Google tags a great many Singapore places `restaurant` /
`food` and nothing more, and a hand-maintained type map cannot read a *name*.

The second consequence was worse than the first. `lib/scoring.ts` compares
`meal.cuisine === place.cuisine` for the repeat penalty, so every place that
fell through shared one string — eating Indian on Monday made an unrelated
Japanese place on Tuesday look like a repeat and take a knock it never earned.

So the table stays in front, and the model is asked only about what it could not
answer. "Qiu Lian Ban Mian" says Teochew, soupy, mild to anyone who has eaten in
Singapore and says nothing at all to a type code.

Four rules keep it honest and cheap:

- **A closed vocabulary.** The model picks from the cuisines this app already
  defines rather than inventing one — a cuisine outside `CUISINES` has no
  family and no glyph, which is this bug recreated one layer up. The generic
  bucket is excluded too, so it cannot answer with the non-answer.
- **An unsure answer is discarded.** The model is asked to set
  `confident: false` when a name gives no clue, and that reply is dropped. A
  guessed cuisine does not sit inertly in the record — it feeds the repeat
  penalty, so a wrong one actively misranks tomorrow's lunch.
- **Asked once, ever.** Cached per place for six months, nulls included. The
  first request in a new neighbourhood pays; every request after it, for
  anyone, is free. That is what makes it affordable to run over the whole
  candidate pool *before* ranking rather than over three picks after it — the
  bug is in the ranking, so fixing it afterwards would only relabel a list that
  was already ordered wrong.
- **A circuit breaker, and a canary in front of it.** If the model has been
  asked three times on this instance and never once answered, enrichment stops
  asking — a revoked key does not fail for free. But the breaker can only act
  on failures already recorded, and on a cold instance the first request would
  fan out a dozen calls in parallel before any of them had failed. So the first
  place is asked alone; if it comes back empty *and* the model has now failed,
  the rest are abandoned. A dead credential therefore costs **one** doomed
  round-trip per instance rather than a dozen — in wasted quota and log noise
  more than in wall-clock, since the calls run in parallel. A null from a
  *working* model just means an unrecognisable name, so the breaker — not the
  null — is what decides. Everything resets when the instance recycles, so a
  key fixed at noon comes back on its own.

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

## Your first pick, before it knows anything

You can eat without calibrating. There is a **Skip — just feed me** exit on the
swipe deck, and the pick screen works from the first tap — sixteen questions
before your first lunch is the opposite of near-zero input, and every swipe is
saved as you go, so stopping after four is four cards' worth of calibration
rather than none.

What was wrong was what the score *claimed* on the way there. An uncalibrated
palate is the neutral vector — every axis at 0.5 — and the palate term happily
scored places against it, handing out a mean of **33 of its 54 points with a
34-point spread** across the catalogue. That spread is the problem: it isn't an
absence of information, it's *wrong* information. It ranks by closeness to the
exact midpoint of every axis, so it systematically favoured the blandest thing
on the street on behalf of someone who had expressed nothing at all. The lead
reason on the card, meanwhile, was hardcoded to *"matches your taste"* — the one
claim the app could not back, as the first sentence a new diner ever read.

Now, before you've said anything, the palate term is a **constant**: the
midpoint of its own range, identical for every candidate. It cannot tilt the
ranking, because there is nothing to tilt it with — distance, opening hours,
price and crowd rating decide, and those are real evidence. It holds its
magnitude rather than dropping to zero, because a first pick judged on where you
are and what's open is a genuinely good recommendation, and scoring it 27 points
below the identical pick tomorrow would be its own kind of lie.

The card says so: the bar is drawn hatched and grey, labelled `PALATE · NOT
SET`, and it still sums into the ring exactly like every other term. Same
contract as `flavorKnown` and `hoursKnown` — the UI must be able to tell a
reading from a placeholder.

**A mood tap or a typed craving counts as having told us.** Both write real
intent into the vector, so a first-run user who taps SPICY gets the real palate
term immediately; telling them it was unknown would be the app ignoring what
they just said.

## Saying where you are

The plan bar carries the two inputs every recommendation is computed from, and
for a long time they were not treated as equals: **When** had a segmented
control *and* an exact-hour stepper, while **Where** had eight chips. The area
table holds 49 Singapore planning areas; only 8 were selectable, so the app
could correctly *label* you in Tampines from a GPS fix and then refuse to let
you say you would be there at one o'clock.

There is now a search field, and it behaves like a search field — suggestions
narrow **as you type**, from two characters, in one list. Two sources feed it:

1. **The area table**, instantly and for free. All 49 are reachable, matching
   ignores case, spaces and punctuation (`chuakang` finds Choa Chu Kang), and a
   prefix beats a mid-word hit so `bugis` gives you Bugis.
2. **Google Places Autocomplete**, for everything a 49-row table cannot hold.
   "Micron", "Changi Business Park", "one-north" — offices, campuses, malls and
   MRT exits number in the tens of thousands, and that is where lunch decisions
   actually get made.

Both land in the **same list, in the same shape**. A box that renders chips for
one kind of answer and rows for another is two controls wearing one costume.

Each row carries a second line, because "Micron" is three different buildings
in Singapore and the road is the only thing that tells them apart.

### Why autocomplete rather than text search

The first cut used Places **Text Search**, which answers "find this thing" once
you have finished describing it — the wrong verb for a field somebody is typing
into. It also cost more, which is the counter-intuitive part:

Autocomplete is billed **per session**, not per request. Every keystroke from
the first letter to the moment you pick a result shares one session token and
bills once, and the coordinates are fetched only for the one place you chose.
Text search per keystroke would have been the expensive way to get a worse
feel. The session token is minted on the client and passed through unchanged to
both calls — generating one per request would silently bill every keystroke
separately.

This needs `GOOGLE_PLACES_API_KEY`. Without it the sheet says so plainly rather
than implying the place does not exist — "this deployment can only match
Singapore area names" is a different sentence from "nothing in Singapore is
called that", and conflating them tells somebody their office isn't real when
the truth is a missing key.

Unlike the saved-post resolver, this search is **not** filtered to food. There
the filter stops a caption resolving to a shopping mall; here the mall is the
answer, because it is where you will be standing.

## The learning loop

Sixteen onboarding swipes bootstrap your palate. After that:

| Signal | Weight | Why |
|---|---|---|
| Calibration swipe | 0.30, decaying | A deliberate answer to a direct question. |
| **You chose this place** | 0.10 | A preference expressed with your feet and your money — better evidence than a card tapped during setup, but noisier: you might have picked it because it was raining. |
| **"Too rich?"** | 0.08 | A flavour complaint. Nudges away. |
| **"Just bored?"** | — | Raises `adventure` only. Boredom is about novelty, not about this dish. |
| **"Too far?"** | **0** | Says nothing about taste. Learning from it would teach the app you dislike a cuisine when all you said was "not that walk". |
| Rejection, no reason | 0.04 | Ambiguous — barely a whisper. |

Until recently `/api/pick` recorded the meal for the recency penalty and nothing
else, so the app learned your palate during onboarding and then never learned
again.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 50 unit tests over the scoring engine
```

### What the tests cover, and why those things

The recommendation engine is pure functions over plain data, so it is cheap to
test precisely — and the bugs that reached production were in the **wiring**,
not the maths. The suite pins the things a hand-check kept catching:

- **The score-sum invariant.** The card prints *"N terms · sums to match"*, so a
  pick whose bars do not add up to its own ring is the UI lying. Held by luck
  until the clamp became a scale; now asserted across 96 profile × craving ×
  radius combinations.
- **A craving outranks the palate** — the rule the whole feature exists for.
- **The group blend** — that it is exactly `0.6·mean + 0.4·min`, that the higher
  floor wins a tie on the mean, and that distance and budget ceilings are the
  strictest member's rather than an average.
- **Hard filters** — never a closed place, never over budget, exclusions honoured.
- **Catalogue integrity** — no duplicate ids, every flavour value in 0..1, and
  *something open at every hour of the day* so the app can never dead-end.

Writing them immediately found two real bugs: `"no pork"` was being discarded
entirely (the avoid list sat behind a guard requiring match terms, and a pure
negation produces none), and the group card showed a mean and a group score a
user doing the arithmetic could not reconcile.

## Optional keys (`.env.local`, see `.env.example`)

| Key | Adds |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Live nearby restaurants merged into the candidate pool, with real crowd ratings and opening hours — **and** the ability to plan for a workplace or building by name, not just one of 49 area names |
| `ANTHROPIC_API_KEY` **or** `GEMINI_API_KEY` | Written "why this pick" explanations, dish mining, smarter craving parsing, caption reading — see below |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` + `AUTH_SECRET` | Google sign-in |
| `REQUIRE_AUTH=true` | Makes sign-in mandatory (ignored unless Google keys are set) |
| `DATABASE_URL` | Postgres — signed-in profiles sync across devices, **and group links become reliable** |
| `STATS_TOKEN` | Unlocks `GET /api/stats` (see [Measuring whether it works](#measuring-whether-it-works)). Without it the route 404s. |

### Which language model, and why you get a choice

Four things use a model: explanations, dish mining from reviews, craving
parsing, and reading a restaurant name out of a social caption. All four ask a
small, well-shaped question — a system prompt in, a short answer out — so the
vendor is a one-line decision in `lib/llm.ts` rather than a dependency baked
into four files.

| | Set | Cost |
|---|---|---|
| **Nothing** | — | Free. Every feature falls back to a local path that ships in the box; the full test suite passes in this mode. |
| **Gemini** | `GEMINI_API_KEY` | **Free, no card.** Get one at [aistudio.google.com](https://aistudio.google.com) with a Google account. The free tier is 1,500 requests/day and this app uses about four. |
| **Anthropic** | `ANTHROPIC_API_KEY` | Prepaid credits at [console.anthropic.com](https://console.anthropic.com). Around **$0.15/month** at one person's usage on `claude-haiku-4-5`. |

If both are set, Anthropic wins — it is the paid tier, and the one whose terms
do not include training on the prompt.

⚠️ **Google may train on free-tier Gemini prompts.** What passes through is a
typed craving, public restaurant names and review text, and a flavour vector —
no name, no email, no coordinates. Low stakes, but real, and the way to opt out
is to set an Anthropic key instead.

Override the model within a provider with `CLAUDE_MODEL` (default
`claude-haiku-4-5`) or `GEMINI_MODEL` (default `gemini-2.5-flash`). Neither
needs changing; both defaults are chosen because these are extraction tasks,
not reasoning ones.

## Saved from TikTok / Rednote / Douyin

The original idea was "pull restaurants from Google, Rednote, TikTok, Douyin".
Two very different things were hiding in that sentence, and conflating them is
what made it look impossible:

| | |
|---|---|
| **Crawling their catalogues** | Not possible, and not worth pretending. None expose a public API for discovering food posts, they block scrapers, and a scraper breaks the week they change their markup. |
| **Importing what you saved** | Entirely possible — and *better*, because it is already filtered by your own taste. |

Everybody saves food videos and then never finds them again at the one moment
they matter: hungry, standing somewhere, deciding. Paste the share text into
**You → Want to try** and FNM turns it into a place with coordinates, an address
and a walk time — then **raises it in the ranking when you are actually near
it**. That is the whole point: not a bookmark folder you never reopen, but the
app remembering it for you.

What is available per platform, and what the code relies on:

- **TikTok** — a public oEmbed endpoint, no auth, officially supported. Returns the caption.
- **Douyin / Rednote** — no oEmbed, but the caption travels in the shared text itself, which is what iOS puts on the clipboard. Rednote's share format is literally `「title」 http://xhslink.com/…`.

So the caption is the raw material in every case, and the extractor works from
caption text alone. Claude reads the restaurant name out of it; Google Places
`searchText` resolves it to coordinates. Without keys it still saves the post
and says plainly that it could not match it to a place.

**Paste, not share-sheet.** A PWA can register as a Web Share Target, but iOS
Safari does not implement it — shipping that button would mean shipping
something that silently does nothing on an iPhone.

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

| Usage events | With `DATABASE_URL` set, an `events` table holding an opaque device id, an event name, a timestamp and a few small numbers. **No third party.** Without it, nothing is recorded at all. |

Stored per user: the six-dimension flavour vector, swipe count, distance and
budget settings, and recent meals (for the "don't repeat" penalty). Never
stored: contacts, payment details, or a location history — the plan bar's
location is used for the request and not retained.

## Measuring whether it works

The plan names six success metrics. None of them was measurable — there was no
instrumentation of any kind, so the product could have been working beautifully
or failing quietly and there was no way to tell which. Every decision about what
to build next was being made on taste alone.

**Deliberately not an analytics SDK.** The privacy note above promises that a
signed-out profile never leaves the device. Shipping behavioural data to a
vendor the moment we wanted a retention chart would have contradicted that on
the first day it mattered, so the events go in the Postgres database that is
already there. Nothing leaves the deployment.

Nine events are recorded — `served`, `picked`, `rejected`, `dead_end`, `rated`,
`calibrated`, and three group ones. Each carries an opaque device id (the same
random cookie the group links use, which identifies a browser and not a person),
the event name, a timestamp, and at most a slot name, a duration, a verdict or a
member count. There is no way to work backwards from that table to who somebody
is, and a metrics write is never awaited by a request that matters — a lost
event is worth less than a lunch recommendation.

Read them back with `GET /api/stats?token=…&days=28`:

| Number | What a bad value means |
|---|---|
| Decisions per active user per week | The primary metric — the app is not part of the routine |
| Median decision seconds | The premise is broken; this app exists to end the scroll |
| Pick rate | The recommendations are not good enough to act on |
| Top-pick share | The *ranking* is wrong — people are picking, but not the one we led with |
| Dead-end rate | The failure signal: everything nearby got turned down |
| Four-week retention | It solved one lunch and not the habit |
| Group completion rate | Groups start and then get abandoned |
| Verdict tally | How the meals actually turned out, which is the only signal that survives contact with the food |

The endpoint is **closed by default**: with no `STATS_TOKEN` it returns the same
404 as a typo'd URL. Pick rates and dead-end counts are the shape of the
business, and the device-id column is exactly the field the privacy note
promises stays put. With no `DATABASE_URL` it returns a 503 that says so —
a page of nulls would be indistinguishable from "nobody used the app this
month", which is the most expensive way for this endpoint to be wrong.

## Knowing when something is broken

Open **You**. There is a *What's switched on* panel listing each optional
capability, whether it is working, and — when it is configured but broken — one
line saying what to do about it:

> **Written reasons and dish details** · NOT WORKING
> The key was rejected — regenerate it and update the deployment.

That panel exists because the honest failure reporting below was, at first,
reachable only through `GET /api/stats` behind `STATS_TOKEN`. That is the right
gate for pick rates and device ids and the wrong one for *"why has this app
stopped writing me sentences"* — answering it took an environment variable, a
redeploy, and squinting at JSON on a phone. A revoked key stayed undiagnosed not
because the app did not know, but because knowing was behind a chore.

The panel carries **no metrics**: no pick rates, no counts, no device ids, and
never the vendor's own error text (which can quote fragments of a request back).
Only *is it configured, is it working, and which kind of failure* — because a
red light that cannot tell "your key is dead" from "you are going too fast" is
just anxiety with a colour. And a capability that is simply **off** says what
you are missing rather than glowing red, since for most installs off is correct.



Everything external here degrades gracefully. The model, Google Places and the
database each sit behind a `catch` that falls back to a local path that works
fine, which is the right design — nobody should lose their lunch because a
vendor is having an afternoon.

It also meant the app could not tell you it was broken. `lib/llm.ts` admitted as
much in its own comment: *a dead API key looks exactly like never having set
one.* `lib/places.ts` had the same hole one line long — `if (!res.ok) return []`
— so a 403 from a key restricted to the wrong API rendered as "there are no
restaurants near you", and the app quietly served the seed catalogue looking
perfectly healthy. There were **zero** logging calls in the codebase.

**Configured and working are different questions.** A status page that reads an
env var and reports `GEMINI_API_KEY: set ✓` is confidently wrong the day after
the key is revoked. So health is recorded from real call outcomes, and a
subsystem nobody has called yet reports `unknown` — never `healthy`.

The same `GET /api/stats` carries a `health` block per subsystem:

| Verdict | Meaning |
|---|---|
| `off` | No key set. Working as intended — **not** a fault, and not flagged as one |
| `healthy` | Configured, calls succeeding |
| `degraded` | Configured, some calls failing |
| `failing` | Configured and nothing is getting through — **the one that needs a human** |
| `unknown` | Configured, but nothing has been asked of it yet |

Faults are classified into the categories that call for different reactions:
`auth` (regenerate the key), `rate-limit` (wait), `quota` (spent until tomorrow,
or add a card), `timeout`, `upstream` (the vendor is down), `bad-response` and
`unknown`. Quota is checked *before* the status code, because Google returns 429
for both a burst limit and an exhausted free tier — and on the free tier this
README recommends, "you are done until tomorrow" is the likeliest real failure.

Recorded in two places, because neither alone is enough: a `console.error` line
prefixed `[fnm]` (durable, in the platform log, but you need a laptop to read
it) and a row in an `incidents` table, throttled to one per subsystem per fault
per minute — a dead key fails on every request, and writing a row each time
turns an outage into a second, self-inflicted one. The table matters on
serverless specifically: the instance answering your status request is usually
not the instance that hit the dead key, so without it a cold box reports a
serene `unknown` while the rest of the fleet fails on the same credential.

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
