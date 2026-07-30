# The test suite

```bash
npm test              # 495 tests, ~3s
npm run test:coverage # the same, with a per-module report and enforced floors
```

## What these are for

The bugs that actually reached production in this app were **not** in the
recommendation maths. They were in the wiring: a `403` from a mis-restricted key
rendering as "there are no restaurants near you"; a dead API key looking exactly
like never having set one; a group of colleagues meeting a disabled button that
read *"Nobody has a palate yet"*; a headline sentence claiming *"your balanced
palate"* to someone who had never swiped.

So the suite is weighted toward **seams, boundaries and failure paths**, not
toward the pure functions that were always easy to test. Where a module talks to
the outside world, the test drives it through the real seam with a stubbed
`fetch` or a stubbed database driver, because the translation is only correct if
the wiring around it is.

Every test is named for the behaviour it protects and carries a comment
explaining the failure it would catch. If a test's reason is not obvious from
its name, the comment is the missing half — and a test whose purpose cannot be
written down in a sentence is usually testing the implementation rather than the
promise.

## Coverage

96% of statements, 99% of functions across `lib/`, with floors enforced in
`vitest.config.ts`. The floors are set just under what the suite reaches, so the
build fails when a change **adds untested code** — not when someone writes one
test fewer than yesterday.

Coverage is not the goal. It became one for a while because seven modules sat at
**zero percent** — `context`, `mood`, `plan`, `areas`, `profile`, `dishes` and
`member` — and every one of them is in the request path. The floors exist so
they cannot drift back.

Deliberately excluded: `lib/data/**` and `lib/togoLines.ts`. They are data
tables and written voice lines; covering them measures nothing and would mask
the modules that need attention.

## What is NOT covered, and why

- **React components.** No DOM environment is configured. UI regressions here
  are caught by taking screenshots at 390×844 against a real build — which is
  how the "Nobody has a palate yet" dead end and the invented "X is the stretch
  here" line were both found, after the JSON already looked correct.
- **A live Postgres.** The durable paths run against a tagged-template spy. That
  is a real limitation and also how those tests can assert something no live
  database could: that user input arrives as a **parameter**, never as SQL text.
- **A live model or live Google Places.** Both are stubbed. The contracts that
  matter are pinned instead — `thinkingBudget: 0`, `matchScore` echoed exactly,
  a refusal treated as no answer.

## The files

| File | What it protects |
|---|---|
| `scoring` `coldstart` `calibration` `craving` `cuisine` `glyphs` | The engine: the score-sum invariant, the cold-start palate, the deck, craving parsing |
| `flavor` (in `craving-llm`) `verdict` | How a palate moves, and what a post-meal verdict is worth |
| `group` `group-storage` `fairness` | Group blending, join codes, the fairness ledger |
| `context` `plan` (with `areas`) `mood` | Where and when — the two inputs every recommendation is computed from |
| `google` `places` | Live Google data becoming app data |
| `profile` `persistence` `member` | Where a palate survives, and who is who on a shared link |
| `llm` `llm-providers` `explain` `dishes` `craving-llm` | The model seam and everything downstream of it |
| `social` `social-import` | Paste → platform → caption → place → coordinates |
| `metrics` `health` | The six PLAN numbers, and telling failures apart |
| `icon` | The app icon's geometry |

## Adding one

Two rules, both learned the hard way in this repo:

1. **Measure before asserting.** Several thresholds here were set by printing
   the real value first. A guessed bound either never fires or fires on the
   wrong thing — and one test in this suite passed for the wrong reason until
   its assertion was tightened.
2. **A test that pins the wrong behaviour is a bug.** `group.test.ts` once
   asserted that a group with no palates "returns nothing, rather than
   guessing". That assertion *was* the dead end. When a test fights a fix, work
   out which one is right before changing either.
