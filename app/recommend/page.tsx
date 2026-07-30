"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandRow from "@/components/BrandRow";
import Glyph from "@/components/Glyph";
import Isochrone from "@/components/Isochrone";
import Needle from "@/components/Needle";
import PlanBar from "@/components/PlanBar";
import Receipt from "@/components/Receipt";
import ScoreReadout from "@/components/ScoreReadout";
import ScoreRing from "@/components/ScoreRing";
import Sheet from "@/components/Sheet";
import SkyBand from "@/components/SkyBand";
import StreetMap from "@/components/StreetMap";
import TasteRadar from "@/components/TasteRadar";
import Togo from "@/components/Togo";
import WhyGraphic from "@/components/WhyGraphic";
import { FRESH_PICK_KEY } from "@/components/TabBar";
import { CloudRainIcon, RefreshIcon, SearchIcon, StoreIcon, TargetIcon, WalkIcon } from "@/components/icons";
import type { MealPeriod } from "@/lib/context";
import type { FlavorVector } from "@/lib/flavor";
import { SEED_PLACES } from "@/lib/data/seed";
import { dishGlyph } from "@/lib/glyphs";
import { Plan, planParams } from "@/lib/plan";
import type { ScoreBreakdown } from "@/lib/scoring";
import { resultClause, togoLine } from "@/lib/togoLines";

interface Pick {
  placeId: string;
  name: string;
  cuisine: string;
  dish: { id: string; name: string; priceSgd: number; flavor: FlavorVector } | null;
  walkMinutes: number;
  distanceKm: number;
  priceLevel: number;
  explanation: string;
  matchScore: number;
  breakdown: ScoreBreakdown;
  lat: number;
  lng: number;
  openHour: number;
  closeHour: number;
  sheltered: boolean;
}

interface RecommendResponse {
  context: {
    mealPeriod: MealPeriod;
    raining: boolean;
    forecast: string | null;
    hour: number;
    locationLabel: string | null;
    lat: number;
    lng: number;
  };
  note: string | null;
  canReset?: boolean;
  craving: { text: string; hit: string | null } | null;
  swipeCount: number;
  /** False until the diner has swiped, picked a mood, or typed a craving. */
  palateKnown?: boolean;
  vector: FlavorVector;
  best: Pick;
  safer: Pick | null;
  adventurous: Pick | null;
  error?: string;
}

function distanceLabel(pick: Pick): string {
  // THREE BANDS, because "148633 MIN WALK" is not a distance, it is a defect.
  // Past a few kilometres nobody is walking, so stop calling it a walk; past
  // 60 km it is another city and the round number is the honest unit.
  if (pick.walkMinutes <= 45) return `${pick.walkMinutes} min walk`;
  if (pick.distanceKm < 60) return `${pick.distanceKm} km away`;
  return `${Math.round(pick.distanceKm)} km away`;
}

/** "Tian Tian Chicken Rice (Maxwell)" → title + a mono area chip, never an h2. */
function splitName(name: string): { title: string; area: string | null } {
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { title: m[1], area: m[2] } : { title: name, area: null };
}

/** True compass bearing, origin → destination. The needle is a real instrument. */
function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLat = to.lat - from.lat;
  const dLng = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

/**
 * CLOSES 19:00 · 40 MIN — from closeHour, which the API has always known.
 * The chip used to be gated to the last three hours of service, which meant it
 * effectively never rendered. Closing time is a decision input at every hour of
 * the day, so it always shows; only the countdown and the urgent tint are
 * conditional.
 */
function closesLabel(pick: Pick, hour: number): { text: string; soon: boolean } | null {
  if (pick.closeHour >= 24 && pick.openHour <= 0) return { text: "Open 24h", soon: false };
  let until = pick.closeHour - hour;
  if (until <= 0) until += 24;
  const at = `Closes ${String(pick.closeHour % 24).padStart(2, "0")}:00`;
  return {
    text: until <= 3 ? `${at} · ${until * 60} min` : `${at} · ${until} hr`,
    soon: until <= 1,
  };
}

/** Price-tier telemetry: active "$" in ink-2, remaining slots as ink-3 dots. */
function PriceTier({ level }: { level: number }) {
  return (
    <span className="meta-price" aria-label={`Price tier ${level} of 4`}>
      <span className="tier-on">{"$".repeat(level)}</span>
      <span className="tier-off" aria-hidden="true">
        {"$".repeat(Math.max(0, 4 - level))}
      </span>
    </span>
  );
}

// Reasons map onto moods the API ALREADY accepts on the existing `mood` param,
// so refusing a pick genuinely changes the next request instead of theatrically
// pretending to. The mini radar then deforms for real.
const REASONS: { id: string; label: string; mood: string }[] = [
  { id: "far", label: "Too far?", mood: "nearby" },
  { id: "rich", label: "Too rich?", mood: "light" },
  { id: "bored", label: "Just bored?", mood: "surprise" },
];

// Real telemetry only: the catalogue size is a fact, a temperature we have not
// fetched yet is not. The cyan voice never states something it cannot know.
const TELEMETRY = [
  `Scanning ${SEED_PLACES.length} stalls`,
  "Checking the clock",
  "Crossing your palate",
  "Heading locked",
];

export default function Recommend() {
  const [data, setData] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canReset, setCanReset] = useState(false);
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<Pick | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [session, setSession] = useState(0);
  const excluded = useRef<string[]>([]);
  const plan = useRef<Plan | null>(null);
  const reasonMood = useRef<string>("");
  const startedAt = useRef<number>(Date.now());
  const [decidedInSec, setDecidedInSec] = useState(0);

  // Deterministic on the server (0), varied per session on the client, so he
  // never repeats a line inside one sitting and nothing hydrates differently.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("fnm_session_i");
      const i = raw === null ? Math.floor(Date.now() / 1000) % 3 : Number(raw);
      window.sessionStorage.setItem("fnm_session_i", String(i));
      setSession(i);
    } catch {
      /* private mode — index 0 is a perfectly good line */
    }
  }, []);

  const load = useCallback(async () => {
    if (!plan.current) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URLSearchParams(window.location.search);
      const urlMood = url.get("mood") ?? "";
      const mood = [urlMood, reasonMood.current].filter(Boolean).join(",");
      const params = new URLSearchParams({
        ...planParams(plan.current),
        exclude: excluded.current.join(","),
        mood,
      });
      // The craving has to survive the hop from the home card to this fetch, and
      // through every "not feeling it" re-roll after it — dropping it here is
      // how "wings" silently became McDonald's.
      const urlCraving = url.get("craving") ?? "";
      if (urlCraving) params.set("craving", urlCraving);
      const res = await fetch(`/api/recommend?${params}`);
      const json = (await res.json()) as RecommendResponse;
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setCanReset(json.canReset === true);
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Couldn't reach the kitchen. Try again?");
    } finally {
      setLoading(false);
    }
  }, []);

  // The plan bar owns where/when: it reports the stored plan on mount and any
  // change the user makes, and each report triggers a fresh pick.
  const onPlanChange = useCallback(
    (next: Plan) => {
      plan.current = next;
      excluded.current = [];
      void load();
    },
    [load],
  );

  // A pick is waiting → the EAT tab wears the cyan needle badge.
  useEffect(() => {
    try {
      if (data && !decided) window.localStorage.setItem(FRESH_PICK_KEY, "1");
      if (decided) window.localStorage.removeItem(FRESH_PICK_KEY);
    } catch {
      /* storage blocked — the badge is an affordance, not a requirement */
    }
  }, [data, decided]);

  async function choose(pick: Pick, slot: "best" | "safer" | "adventurous") {
    const elapsed = Date.now() - startedAt.current;
    setDecidedInSec(Math.max(1, Math.round(elapsed / 1000)));
    setDecided(pick);
    // SEND THE FLAVOUR, not just the id. Without it the server can record the
    // meal but cannot learn from it, which is how the app came to stop learning
    // anything after onboarding.
    //
    // The slot and the elapsed time ride along for the same reason. This screen
    // was already timing the decision to print "decided in 9s" — it just threw
    // the number away afterwards, so the one metric the whole product is named
    // after was being measured and discarded on every single pick.
    await fetch("/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId: pick.placeId,
        cuisine: pick.cuisine,
        dishFlavor: pick.dish?.flavor ?? null,
        slot,
        decisionMs: elapsed,
      }),
    }).catch(() => {});
  }

  function notFeelingIt(reason?: string) {
    const best = data?.best;
    if (best) {
      excluded.current.push(best.placeId);
      // A REFUSAL IS DATA. It used to be handled entirely client-side, so the
      // strongest negative signal the app ever receives — you looked at its
      // best guess and said no — never reached the server at all.
      void fetch("/api/pick", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason ?? null, dishFlavor: best.dish?.flavor ?? null }),
      }).catch(() => {});
    }
    void load();
  }

  if (decided) {
    const { title, area } = splitName(decided.name);
    return (
      <main className="decided">
        <div className="decide-burst" aria-hidden="true" />
        <BrandRow label="Decided" />
        <Receipt
          name={title}
          area={area}
          dish={decided.dish}
          glyph={dishGlyph(decided.dish?.id, decided.cuisine, decided.dish?.flavor, decided.dish?.name)}
          walkMinutes={decided.walkMinutes}
          matchScore={decided.matchScore}
          decidedInSec={decidedInSec}
          lat={decided.lat}
          lng={decided.lng}
          placeId={decided.placeId}
        />
        <Link className="big-btn secondary" href="/">
          Done
        </Link>
      </main>
    );
  }

  return (
    <main>
      <BrandRow label="Your pick" />
      <PlanBar onChange={onPlanChange} />

      {/* LOADING IS THE SIGNATURE MOMENT, not a placeholder. The mascot IS the
          loading state, so there is no spinner anywhere on this screen. */}
      {loading && (
        <div className="load-state" aria-label="Finding your pick" role="status">
          <div className="reading">
            <TasteRadar ghost gid="ldg" className="reading-ghost" size={180} />
            <Togo mood="reading" variant="bust" size={120} gid="load" className="reading-togo togo-face" />
            {/* the bearing keeps searching for anyone who has hidden him */}
            <Needle size={56} spin tone="ice" gid="loadn" className="reading-needle" />
          </div>
          <p className="reading-say togo-say">{togoLine("reading", session)}</p>
          <div className="status-lines" aria-hidden="true">
            {TELEMETRY.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {/* A masked SWEEP, matching the real card's shape. The old five grey
              bars breathing opacity .5→.9 both reflowed on resolve and read as
              broken; a fade says broken, a sweep says working. */}
          <div className="skeleton-card mat mat-thick" aria-hidden="true">
            <div className="skeleton-band" />
            <div className="skeleton-row">
              <div className="skeleton-line title" />
              <div className="skeleton-ring" />
            </div>
            <div className="skeleton-line half" />
            <div className="skeleton-line" />
            <div className="skeleton-map" />
            <div className="skeleton-line btn" />
          </div>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          message={error}
          canReset={canReset}
          session={session}
          onRetry={() => void load()}
          onReset={() => {
            excluded.current = [];
            reasonMood.current = "";
            void load();
          }}
        />
      )}

      {data && !loading && (
        <>
          <div className="hud-strip">
            {/* Meal period lives in the plan bar above — don't say it twice. */}
            {data.context.raining && (
              <span className="hud-chip warn">
                <CloudRainIcon size={13} strokeWidth={1.6} />
                Rain — factored in
              </span>
            )}
            {data.craving?.text && (
              <span className={`hud-chip${data.craving.hit ? " craving-hit" : ""}`}>
                <SearchIcon size={13} strokeWidth={1.9} />
                {data.craving.text}
              </span>
            )}
            {data.note && <span className="hud-chip">{data.note}</span>}
            {data.swipeCount === 0 && (
              <Link className="hud-chip hud-link" href="/onboarding" aria-label="Calibrate for sharper picks">
                <TargetIcon size={13} strokeWidth={2} />
                Calibrate →
              </Link>
            )}
          </div>

          <HeroCard
            pick={data.best}
            ctx={data.context}
            vector={data.vector}
            palateKnown={data.palateKnown !== false}
            session={session}
            onGo={() => void choose(data.best, "best")}
            onPass={() => setReasonOpen(true)}
          />

          {/* A HORIZONTAL SNAP ROW, not a vertical stack. One move kills the
              tab-bar collision, the hierarchy inversion and the list-feel — and
              a list says "you decide", which is the opposite of the promise. */}
          <div className="alt-rail-head">
            <span className="eyebrow">Alternatives</span>
            {/* THE PEEK IS THE AFFORDANCE. A 10px ink-3 "SWIPE" label at the far
                right was near-invisible on dark and invisible on light; the
                next card showing at the edge plus a page indicator says the
                same thing without a word. */}
            <span className="alt-dots" aria-hidden="true">
              <i />
              <i />
              <span className="alt-dot-thumb" />
            </span>
          </div>
          <div className="alt-rail">
            {data.safer && <AltCard pick={data.safer} kind="safer" session={session} onPick={() => void choose(data.safer!, "safer")} />}
            {data.adventurous && (
              <AltCard
                pick={data.adventurous}
                kind="brave"
                session={session}
                origin={data.context}
                onPick={() => void choose(data.adventurous!, "adventurous")}
              />
            )}
          </div>
        </>
      )}

      <Sheet
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title="Not feeling it"
        sub="Tell me what's wrong with it"
      >
        <div className="mood-chips">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              onClick={() => {
                reasonMood.current = r.mood;
                setReasonOpen(false);
                // The stated reason decides what, if anything, is learned —
                // "too far" says nothing about taste. See /api/pick DELETE.
                notFeelingIt(r.id);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="big-btn secondary"
          onClick={() => {
            setReasonOpen(false);
            notFeelingIt();
          }}
        >
          <RefreshIcon size={18} strokeWidth={2} />
          Just show me another
        </button>
        <p className="plan-hint">Each reason re-runs the pick with that constraint applied.</p>
      </Sheet>
    </main>
  );
}

function HeroCard({
  pick,
  ctx,
  vector,
  palateKnown,
  session,
  onGo,
  onPass,
}: {
  pick: Pick;
  ctx: RecommendResponse["context"];
  vector: FlavorVector;
  palateKnown: boolean;
  session: number;
  onGo: () => void;
  onPass: () => void;
}) {
  const { title, area } = splitName(pick.name);
  const closes = closesLabel(pick, ctx.hour);
  const brg = bearing({ lat: ctx.lat, lng: ctx.lng }, pick);

  return (
    <article
      className="pick-card best mat mat-thick"
      style={{ ["--card-i" as string]: 0, viewTransitionName: `pick-${pick.placeId}` }}
    >
      <SkyBand
        mealPeriod={ctx.mealPeriod}
        raining={ctx.raining}
        sheltered={pick.sheltered}
        glyph={dishGlyph(pick.dish?.id, pick.cuisine, pick.dish?.flavor, pick.dish?.name)}
        closesLabel={closes?.text ?? null}
        closingSoon={closes?.soon}
      />

      <div className="pick-body">
        <span className="tag tag-best">
          <Needle size={9} tone="ice" gid="tgbest" />
          Best match
        </span>

        {/* A FLEX ROW, not position:absolute — which is what deleted the
            padding-right:60px magic number that was wrong for both ring sizes. */}
        <div className="pick-head">
          <div className="pick-title">
            <h2>{title}</h2>
            {area && <span className="area-chip">{area}</span>}
          </div>
          <ScoreReadout score={pick.matchScore} size={72} gid="srA" />
        </div>

        {pick.dish ? (
          <div className="dish-row">
            <Glyph name={dishGlyph(pick.dish.id, pick.cuisine, pick.dish.flavor, pick.dish.name)} size={24} />
            <span className="dish-name">{pick.dish.name}</span>
            {/* A MINED DISH MAY HAVE NO PRICE. Reviews often name the dish and
                never the cost, and the extractor returns 0 for that rather than
                guessing — so the row must omit the price instead of printing a
                confident "~$0.00". */}
            {pick.dish.priceSgd > 0 && (
              <span className="price">~${pick.dish.priceSgd.toFixed(2)}</span>
            )}
          </div>
        ) : (
          /* SAY WHY THERE IS NO DISH. Dish-level picking is the product's whole
             promise, and on a live Google result it silently disappeared —
             which reads as a missing element rather than a stated limit. Google
             has no menu data, so the honest move is to name the limit and still
             be useful about it. */
          <div className="dish-row dish-none">
            <StoreIcon size={20} strokeWidth={1.8} />
            <span className="dish-name">Restaurant match — no menu data here</span>
          </div>
        )}

        <div className="meta">
          <Isochrone walkMinutes={pick.walkMinutes} />
          <span className="meta-min">{distanceLabel(pick)}</span>
          {/* THE MONOGRAM AS A WORKING INSTRUMENT, at almost no visual cost. */}
          <Needle size={16} bearing={brg} ring tone="ice" gid="brg" className="meta-needle" label="Bearing to the restaurant" />
          <PriceTier level={pick.priceLevel} />
        </div>

        <WhyGraphic
          score={pick.matchScore}
          breakdown={pick.breakdown}
          explanation={pick.explanation}
          clause={resultClause({ raining: ctx.raining, hour: ctx.hour, index: session })}
          vector={vector}
          compare={pick.dish?.flavor}
          palateKnown={palateKnown}
          gid="whyA"
        />

        <StreetMap
          origin={{ lat: ctx.lat, lng: ctx.lng }}
          dest={{ lat: pick.lat, lng: pick.lng }}
          destId={pick.placeId}
          walkMinutes={pick.walkMinutes}
        />

        <div className="row">
          <button className="big-btn go" onClick={onGo}>
            Let&apos;s go
          </button>
          <button className="big-btn secondary pass" onClick={onPass}>
            Not feeling it
          </button>
        </div>
      </div>
    </article>
  );
}

function AltCard({
  pick,
  kind,
  session,
  origin,
  onPick,
}: {
  pick: Pick;
  kind: "safer" | "brave";
  session: number;
  origin?: { lat: number; lng: number };
  onPick: () => void;
}) {
  const { title, area } = splitName(pick.name);
  const safer = kind === "safer";
  const brg = origin ? bearing(origin, pick) : 0;

  return (
    <article className={`pick-card alt mat mat-regular alt-${kind}`}>
      <div className="alt-head">
        <span className={`tag ${safer ? "tag-safe" : "tag-brave"}`}>
          {safer ? "Safer bet" : "Feeling brave?"}
        </span>
        {/* THE UNSIGNED NEEDLE. No face, no eyes, no mood, no line of copy: his
            endorsement becomes a currency by being visibly WITHHELD, and the
            safer card gets its exact emotional temperature — "this is fine and
            nobody is proud of it" — from seven path commands and no words. */}
        {safer ? (
          <span className="unsigned">
            <Needle size={14} tone="unsigned" bearing={0} gid="uns" />
            Unsigned
          </span>
        ) : (
          // He is not endorsing it. He is daring you: the brave card is an
          // unknown route, so the needle deliberately sits off the bearing.
          <Togo mood="hedging" tilt size={20} gid="brv" className="alt-togo togo-face" />
        )}
      </div>

      <div className="alt-title">
        <h3>{title}</h3>
        {area && <span className="area-chip">{area}</span>}
      </div>

      <div className="alt-mid">
        <Glyph
          name={dishGlyph(pick.dish?.id, pick.cuisine, pick.dish?.flavor, pick.dish?.name)}
          size={32}
          // The two alternatives differ by NERVE, and the app's own scale for
          // nerve is the score ramp: cool for the known road, plum for the
          // unknown one. A Tailwind green in a bowl on an ember-and-cyan screen
          // read as a component pulled in from another product.
          accent={safer ? "var(--safe-tint)" : "var(--brave-tint)"}
        />
        <ScoreRing score={pick.matchScore} size={44} gid={safer ? "rgB" : "rgC"} />
      </div>

      {pick.dish && (
        <p className="alt-dish">
          {pick.dish.name}
          {pick.dish.priceSgd > 0 && (
            <span className="price">~${pick.dish.priceSgd.toFixed(2)}</span>
          )}
        </p>
      )}

      <div className="alt-meta">
        <WalkIcon size={14} strokeWidth={1.7} />
        <span>{distanceLabel(pick)}</span>
        {!safer && <Needle size={12} bearing={brg + 12} tone="ice" gid="brvn" />}
        <PriceTier level={pick.priceLevel} />
      </div>

      {/* THE SAFER CARD GETS NO LINE AT ALL. The withheld signature already
          said "this is fine and nobody is proud of it"; a caption would only
          spend the thing that makes it work. */}
      {!safer && <p className="alt-say togo-say">{togoLine("brave", session)}</p>}

      <button className="big-btn secondary" onClick={onPick}>
        This one
      </button>
    </article>
  );
}

/**
 * FOUR DESIGNED STATES, not an unstyled paragraph centred in a void. Each has a
 * pose, a human cause line and a SPECIFIC action — the mascot turns a dead end
 * into a control.
 */
function ErrorState({
  message,
  canReset,
  session,
  onRetry,
  onReset,
}: {
  message: string;
  canReset: boolean;
  session: number;
  onRetry: () => void;
  onReset: () => void;
}) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  /* THE SERVER NOW SAYS WHETHER STARTING OVER WOULD HELP, so stop inferring it
     by pattern-matching the prose. Sniffing the message meant that rewording an
     error could silently change which button the user was offered — and it
     already had: "everything open near you turned down" does not contain
     "closed", so a copy edit was one word away from showing "Try again" for a
     situation retrying cannot fix. */
  const kind = offline
    ? ("offline" as const)
    : canReset
      ? ("excluded" as const)
      : /location|where/i.test(message)
        ? ("locationDenied" as const)
        : ("nothingOpen" as const);

  const banked = kind === "offline" || kind === "nothingOpen";

  return (
    <div className="err-state" role="alert">
      <Togo
        mood={banked ? "banked" : "hedging"}
        variant="bust"
        size={120}
        gid="err"
        className="err-togo togo-face"
      />
      <p className="err-say togo-say">{togoLine(kind, session)}</p>
      <p className="err-cause">{message}</p>
      <button className="big-btn" onClick={kind === "excluded" ? onReset : onRetry}>
        <RefreshIcon size={18} strokeWidth={2} />
        {kind === "excluded" ? "Start over" : "Try again"}
      </button>
      {kind !== "offline" && (
        <Link className="hud-chip hud-link" href="/profile">
          Widen the range
        </Link>
      )}
    </div>
  );
}
