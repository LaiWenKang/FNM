"use client";

// SWIPEDECK — it has been called a swipe test since day one and there was no
// swipe: sixteen taps on two circular buttons, with fling-l/fling-r sitting in
// the stylesheet as dead code. The whole "60 seconds, thumb only" premise
// depends on the gesture, so here it is.
//
// setPointerCapture, live translateX + rotate(dx/22deg), LIKE/NOPE stamps at
// opacity min(|dx|/120, 1), 90px release threshold firing the keyframes that
// already existed. The buttons stay — a gesture must never be the only way.
//
// TOGO IS THE LEAD DOG AND THE STACK IS THE SLED. His bust sits under it with
// the TUGLINE running from his harness up to the cards, and PROGRESS RIDES ON
// THAT LINE via stroke-dashoffset: progress as distance covered on a route,
// which costs one property and beats a bar.

import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { SwipeCard } from "@/lib/data/seed";
import { neutralVector, type FlavorVector } from "@/lib/flavor";
import DishSection from "@/components/DishSection";
import TasteRadar from "@/components/TasteRadar";
import Togo, { TogoMood } from "@/components/Togo";
import { CheckIcon, XIcon } from "@/components/icons";

const THRESHOLD = 90;

/**
 * THE TUGLINE: from his harness ring, up the LEFT gutter clear of both buttons,
 * to a hitch on the bottom edge of the card stack. It used to sweep up into the
 * ember confirm button, which made the rig read as pointing at the wrong thing.
 * Coordinates are local to the 320×234 box the CSS pins between the stack's
 * bottom edge and his ring.
 */
const TUG = "M39 230 C22 190 20 150 34 116 C48 84 62 52 76 26 C88 12 104 6 119 2";

export interface SwipeDeckProps {
  card: SwipeCard;
  index: number;
  total: number;
  axes: string;
  busy: boolean;
  exit: "yes" | "no" | null;
  /** The live server vector — read off the swipe response, not simulated. */
  vector: FlavorVector | null;
  /** Togo's reaction to the last swipe: pull forward, or one ear back. */
  reaction: "yes" | "no" | null;
  beat: string | null;
  onAnswer: (liked: boolean) => void;
}

export default function SwipeDeck({
  card,
  index,
  total,
  axes,
  busy,
  exit,
  vector,
  reaction,
  beat,
  onAnswer,
}: SwipeDeckProps) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || exit) return;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    setDx(e.clientX - startX.current);
  }
  function up() {
    if (startX.current === null) return;
    const d = dx;
    startX.current = null;
    setDx(0);
    if (Math.abs(d) >= THRESHOLD) onAnswer(d > 0);
  }

  const dragging = startX.current !== null && dx !== 0;
  const stamp = Math.min(Math.abs(dx) / 120, 1);
  const progress = (index / total) * 100;

  // He reacts within 120ms of the swipe and holds before the next card lands.
  const mood: TogoMood = exit || reaction ? (reaction === "no" ? "hedging" : "locked") : "harnessed";

  return (
    <div className="deck">
      <div className="deck-stack">
        <div
          key={card.id}
          className={`swipe-card${exit === "yes" ? " exit-yes" : exit === "no" ? " exit-no" : ""}${
            dragging ? " dragging" : ""
          }`}
          style={
            dx
              ? ({
                  transform: `translateX(${dx}px) rotate(${(dx / 22).toFixed(2)}deg)`,
                } as CSSProperties)
              : undefined
          }
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className="swipe-art" aria-hidden="true">
            <DishSection flavor={card.flavor} size={210} gid={`sc-${card.id}`} />
          </span>
          <span className="label">{card.label}</span>
          {axes && <p className="swipe-axes">{axes}</p>}

          <span className="stamp like" style={{ opacity: dx > 0 ? stamp : 0 }} aria-hidden="true">
            Like
          </span>
          <span className="stamp nope" style={{ opacity: dx < 0 ? stamp : 0 }} aria-hidden="true">
            Nope
          </span>
        </div>

        {/* WHAT IS BEING LEARNED, VISIBLY. Sixteen cards used to yield a 5px bar
            advancing 6%; this polygon deforms on every single swipe — and it is
            drawn from card one at the neutral vector, so the user watches it
            leave the centre rather than watching it appear from nowhere. */}
        <div className="deck-radar">
          <TasteRadar vector={vector ?? neutralVector()} decorative gid="deckr" size={54} />
          <span className="deck-radar-cap">{vector ? "Your palate" : "Neutral"}</span>
        </div>
      </div>

      <div className="swipe-actions">
        <button className="no" onClick={() => onAnswer(false)} disabled={busy} aria-label="Not for me">
          <XIcon size={26} strokeWidth={2} />
        </button>
        <button className="yes" onClick={() => onAnswer(true)} disabled={busy} aria-label="Yes please">
          <CheckIcon size={28} strokeWidth={2.2} />
        </button>
      </div>

      {/* THE RIG — the stack is visibly hitched to him, and the tugline is the
          progress indicator. */}
      <div className="deck-rig">
        <svg
          className="deck-tug"
          viewBox="0 0 320 234"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path className="deck-tug-track" d={TUG} fill="none" pathLength={100} />
          <path
            className="deck-tug-fill"
            d={TUG}
            fill="none"
            pathLength={100}
            style={{ ["--done" as string]: progress.toFixed(1) }}
          />
          {/* the hitch, ON the stack — the line never terminates in open space */}
          <circle className="deck-tug-hitch" cx="119" cy="3" r="3.6" />
        </svg>
        <Togo
          variant="bust"
          mood={mood}
          size={86}
          gid="deck"
          className={`deck-togo togo-face${reaction === "yes" ? " togo-pull" : ""}${
            reaction === "no" ? " togo-refuse" : ""
          }`}
        />
        {/* His line only. The 01/16 counter is the mono voice's property and
            lives in the progress head — he never speaks a count. */}
        {beat && <p className="deck-say togo-say">{beat}</p>}
      </div>
    </div>
  );
}
