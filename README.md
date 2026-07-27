# FNM — Food Near Me

A near-zero-input **food decision engine**: open it, and it tells you where (and what) to eat — one confident pick, two backups, under 60 seconds. Not another restaurant list.

Full product plan: [PLAN.md](./PLAN.md).

## What's in this Phase 1 scaffold

- **Swipe bootstrap** (`/onboarding`) — ~16 dish cards build your flavor-level taste vector in about a minute.
- **"Eat now"** (`/recommend`) — hard filters (open now, distance, budget) → flavor-vector scoring → context nudges (rain → soupy/warm via the free NEA weather API; recency penalty so you don't repeat meals) → 1 best pick + safer + adventurous alternatives, each with a one-line "why".
- **Dish-level picks** for the curated catalog (e.g. Wingstop → Mango Habanero if you like sweet-heat) — tier 1 of the dish/flavor catalog in PLAN.md.
- **PWA** — add to home screen from the browser; no app store needed.

Runs with **zero API keys**: a curated Singapore CBD place catalog is built in, explanations fall back to templates, and your taste profile lives in a cookie (no database yet — the Postgres upgrade path is sketched in `prisma/schema.prisma`).

## Run it locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Optional keys (`.env.local`, see `.env.example`)

| Key | Adds |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Live nearby restaurants merged into the candidate pool |
| `ANTHROPIC_API_KEY` | Claude-written "why this pick" explanations |

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
