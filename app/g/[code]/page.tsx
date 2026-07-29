"use client";

import { use, useCallback, useEffect, useState } from "react";
import BrandRow from "@/components/BrandRow";
import Glyph from "@/components/Glyph";
import Togo from "@/components/Togo";
import { CheckIcon, PersonIcon, StoreIcon, TagIcon, TargetIcon, WalkIcon } from "@/components/icons";
import { SWIPE_CARDS } from "@/lib/data/seed";
import { formatHour } from "@/lib/plan";

// THE GROUP SCREEN. One route carrying three states, because a group decision
// is one continuous moment and bouncing people between pages loses them:
//
//   JOIN    you have the link but the app has never met you
//   LOBBY   you are in; who else is here, and who it can steer for
//   PICK    one answer, with the honest cost of it stated
//
// The lobby polls rather than holding a socket. A lunch group lives about four
// minutes and there are at most twelve people in it, so a 3s poll is a handful
// of requests against a Postgres row — and unlike a socket it survives a phone
// locking, backgrounding Safari and reconnecting, which is exactly what phones
// do while people walk to lunch.

/** Three cards, not sixteen. See the note in /api/group/join. */
const QUICK = ["c-laksa", "c-fried-chicken", "c-salad"]
  .map((id) => SWIPE_CARDS.find((c) => c.id === id))
  .filter((c): c is (typeof SWIPE_CARDS)[number] => Boolean(c));

interface MemberView {
  id: string;
  name: string;
  seeded: boolean;
}
interface Lobby {
  code: string;
  label: string;
  hour: number | null;
  durable: boolean;
  full: boolean;
  youAreIn: boolean;
  decidedPlaceId: string | null;
  members: MemberView[];
  error?: string;
}
interface Pick {
  id: string;
  name: string;
  cuisine: string;
  priceLevel: number;
  rating: number | null;
  ratingCount: number;
  source: string;
  groupScore: number;
  meanScore: number;
  minScore: number;
  weakestMemberName: string | null;
  perMember: { id: string; name: string; score: number }[];
  dish: { name: string; priceSgd: number; glyph: string } | null;
}
interface Decision {
  picks: Pick[];
  voters: number;
  waiting: number;
  decidedPlaceId: string | null;
  error?: string;
  context?: { hour: number; raining: boolean };
}

export default function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/group?code=${code}`).then((x) => x.json()).catch(() => null);
    if (r) setLobby(r);
  }, [code]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function join() {
    setBusy(true);
    const liked = Object.entries(answers).filter(([, v]) => v).map(([k]) => k);
    const passed = Object.entries(answers).filter(([, v]) => !v).map(([k]) => k);
    await fetch("/api/group/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, likedCardIds: liked, passedCardIds: passed }),
    }).catch(() => {});
    await refresh();
    setBusy(false);
  }

  async function decide() {
    setBusy(true);
    const r = await fetch(`/api/group/decide?code=${code}`).then((x) => x.json()).catch(() => null);
    setDecision(r);
    setBusy(false);
  }

  async function lockIn(placeId: string) {
    await fetch("/api/group/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, placeId }),
    }).catch(() => {});
    void refresh();
    void decide();
  }

  function share() {
    const url = `${location.origin}/g/${code}`;
    if (navigator.share) {
      void navigator.share({ title: "FNM — let's decide", url }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (!lobby) return <main className="group-page"><BrandRow label="Group" /><div className="center">Loading…</div></main>;

  if (lobby.error) {
    return (
      <main className="group-page">
        <BrandRow label="Group" />
        <div className="group-dead mat mat-regular">
          <Togo mood="hedging" size={48} gid="gx" className="togo-face" />
          <p className="group-say togo-say">Lost the trail.</p>
          <p className="setting-note">{lobby.error}</p>
        </div>
      </main>
    );
  }

  const seeded = lobby.members.filter((m) => m.seeded).length;

  return (
    <main className="group-page">
      <BrandRow label="Group" />

      <div className="group-head mat mat-thin">
        <span className="group-code" aria-label={`Group code ${lobby.code}`}>
          {lobby.code}
        </span>
        <div className="group-where">
          <p className="group-place">{lobby.label}</p>
          {lobby.hour !== null && <p className="group-time">{formatHour(lobby.hour)}</p>}
        </div>
        <button type="button" className="hud-chip hud-link" onClick={share}>
          {copied ? <CheckIcon size={13} strokeWidth={2.4} /> : null}
          {copied ? "Copied" : "Share"}
        </button>
      </div>

      {!lobby.durable && (
        // Told to the host BEFORE they send the link, not after a friend fails
        // to join. An in-memory group can vanish between serverless instances.
        <p className="group-warn">
          This deployment holds groups in memory — set <span className="data-num">DATABASE_URL</span>{" "}
          to make them reliable.
        </p>
      )}

      {!lobby.youAreIn ? (
        <section className="group-join mat mat-regular">
          <Togo mood="harnessed" size={44} gid="gj" className="togo-face group-togo" />
          <p className="group-say togo-say">Tell me who you are and what you eat.</p>

          <label className="group-label" htmlFor="gname">
            Your name
          </label>
          <input
            id="gname"
            className="group-input"
            value={name}
            maxLength={24}
            placeholder="e.g. Wen Kang"
            onChange={(e) => setName(e.target.value)}
          />

          <p className="group-label">Three quick ones</p>
          <div className="quick-cards">
            {QUICK.map((c) => (
              <div key={c.id} className="quick-card mat mat-thin">
                <Glyph name={c.glyph} size={30} />
                <span className="quick-name">{c.label}</span>
                <div className="quick-btns">
                  <button
                    type="button"
                    className={`quick-btn ${answers[c.id] === false ? "on no" : ""}`}
                    aria-pressed={answers[c.id] === false}
                    onClick={() => setAnswers((a) => ({ ...a, [c.id]: false }))}
                  >
                    Nope
                  </button>
                  <button
                    type="button"
                    className={`quick-btn ${answers[c.id] === true ? "on yes" : ""}`}
                    aria-pressed={answers[c.id] === true}
                    onClick={() => setAnswers((a) => ({ ...a, [c.id]: true }))}
                  >
                    Yes
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="group-fine">
            Already calibrated in FNM? Your real palate is used instead of these.
          </p>

          <button className="big-btn" type="button" disabled={busy} onClick={() => void join()}>
            <PersonIcon size={18} strokeWidth={2} />
            {busy ? "Joining…" : "Join the group"}
          </button>
        </section>
      ) : (
        <>
          <section className="group-members">
            <p className="section-eyebrow">
              In the group · <span className="data-num">{lobby.members.length}</span>
            </p>
            <ul className="member-list">
              {lobby.members.map((m) => (
                <li key={m.id} className={`member mat mat-thin ${m.seeded ? "" : "unseeded"}`}>
                  <Togo mood={m.seeded ? "locked" : "hedging"} size={26} gid={`m${m.id.slice(0, 4)}`} className="togo-face" />
                  <span className="member-name">{m.name}</span>
                  <span className="member-state">{m.seeded ? "ready" : "no palate yet"}</span>
                </li>
              ))}
            </ul>
          </section>

          {!decision ? (
            <button
              className="big-btn"
              type="button"
              disabled={busy || seeded === 0}
              onClick={() => void decide()}
            >
              <TargetIcon size={18} strokeWidth={2} />
              {busy ? "Working…" : seeded === 0 ? "Nobody has a palate yet" : `Decide for ${seeded}`}
            </button>
          ) : decision.error ? (
            <div className="group-dead mat mat-regular">
              <Togo mood="hedging" size={44} gid="ge" className="togo-face" />
              <p className="group-say togo-say">{decision.error}</p>
              <button className="hud-chip hud-link" type="button" onClick={() => setDecision(null)}>
                Back
              </button>
            </div>
          ) : (
            <section className="group-result">
              {decision.waiting > 0 && (
                <p className="group-warn">
                  Decided for <span className="data-num">{decision.voters}</span> —{" "}
                  <span className="data-num">{decision.waiting}</span> still haven&rsquo;t shown a
                  palate, so they had no say.
                </p>
              )}
              {decision.picks.map((p, i) => (
                <article key={p.id} className={`group-pick mat ${i === 0 ? "mat-thick lead" : "mat-regular"}`}>
                  <div className="gp-head">
                    <span className={`tag ${i === 0 ? "tag-best" : "tag-safe"}`}>
                      {i === 0 ? "Group pick" : `Option ${i + 1}`}
                    </span>
                    <span className="gp-score" style={{ ["--score" as string]: p.groupScore }}>
                      {p.groupScore}
                    </span>
                  </div>
                  <h3>{p.name}</h3>
                  {p.dish && (
                    <p className="gp-dish">
                      <Glyph name={p.dish.glyph as never} size={20} />
                      {p.dish.name}
                      {p.dish.priceSgd > 0 && (
                        <span className="gp-price">~${p.dish.priceSgd.toFixed(2)}</span>
                      )}
                    </p>
                  )}
                  <p className="gp-meta">
                    <StoreIcon size={13} strokeWidth={1.7} />
                    {p.cuisine.replace(/_/g, " ")}
                    <TagIcon size={13} strokeWidth={1.7} />
                    {"$".repeat(p.priceLevel)}
                    {p.rating !== null && p.ratingCount >= 20 && (
                      <>
                        <WalkIcon size={13} strokeWidth={1.7} />
                        {p.rating.toFixed(1)} · {p.ratingCount}
                      </>
                    )}
                  </p>

                  {/* THE HONEST COST. Averaging hides the person it fails; this
                      names them, because a group tool that quietly overrules
                      one member is worse than one that says so out loud. */}
                  <div className="gp-spread">
                    {p.perMember
                      .slice()
                      .sort((a, b) => a.score - b.score)
                      .map((m) => (
                        <div key={m.id} className="gp-row">
                          <span className="gp-who">{m.name}</span>
                          <span className="gp-bar">
                            <i style={{ ["--v" as string]: Math.max(0, Math.min(1, m.score / 100)) }} />
                          </span>
                          <span className="gp-val">{m.score}</span>
                        </div>
                      ))}
                  </div>
                  {p.weakestMemberName && p.minScore < 55 && (
                    <p className="gp-warn">
                      {p.weakestMemberName} is the stretch here — {p.minScore} for them.
                    </p>
                  )}

                  {i === 0 && (
                    <button className="big-btn" type="button" onClick={() => void lockIn(p.id)}>
                      <CheckIcon size={18} strokeWidth={2.4} />
                      {decision.decidedPlaceId === p.id ? "Locked in" : "Lock it in"}
                    </button>
                  )}
                </article>
              ))}
              <button className="hud-chip hud-link" type="button" onClick={() => void decide()}>
                Recalculate
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
