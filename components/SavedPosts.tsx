"use client";

import { useCallback, useEffect, useState } from "react";
import Togo from "@/components/Togo";
import { CheckIcon, PinIcon, SearchIcon, StoreIcon, XIcon } from "@/components/icons";
import { loadPlan } from "@/lib/plan";

// ═══ SAVED FROM TIKTOK / REDNOTE / DOUYIN ═════════════════════════════════
//
// Everybody saves food videos. Nobody finds them again at the one moment they
// matter — hungry, standing somewhere, deciding. This turns a saved post into
// a place with coordinates, and then the recommender raises it when you are
// actually near it.
//
// PASTE, NOT SHARE-SHEET. A PWA can register as a Web Share Target, but iOS
// Safari does not implement it — and this user is on an iPhone. Pretending
// otherwise would ship a button that silently does nothing for the only person
// using the app. Paste works everywhere today.

interface Post {
  id: string;
  platform: string;
  url: string;
  caption: string;
  placeName: string | null;
  dishName: string | null;
  resolved: {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    rating: number | null;
    ratingCount: number;
  } | null;
  visitedAt: number | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  douyin: "Douyin",
  rednote: "Rednote",
  instagram: "Instagram",
  other: "Link",
};

export default function SavedPosts() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [durable, setDurable] = useState(true);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/saved").then((x) => x.json()).catch(() => null);
    if (r) {
      setPosts(r.posts ?? []);
      setDurable(r.durable !== false);
    } else setPosts([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    const plan = loadPlan();
    const r = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lat: plan.lat, lng: plan.lng }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r || r.error) {
      setErr(r?.error ?? "Couldn't read that one.");
      return;
    }
    setText("");
    await refresh();
  }

  async function drop(id: string) {
    await fetch("/api/saved", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    await refresh();
  }

  async function visited(id: string) {
    await fetch("/api/saved", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    await refresh();
  }

  const pending = (posts ?? []).filter((p) => !p.visitedAt);

  return (
    <section className="saved">
      <p className="section-eyebrow">
        Want to try{" "}
        {pending.length > 0 && <span className="data-num">{pending.length}</span>}
      </p>

      <div className="saved-add mat mat-regular">
        <p className="saved-say togo-say">
          <Togo mood="reading" size={30} gid="sv" className="togo-face saved-togo" />
          Saw something on TikTok or Rednote? Paste the share text — I&rsquo;ll find the place and
          raise it when you&rsquo;re near it.
        </p>
        <div className="craving-row saved-row">
          <SearchIcon size={17} strokeWidth={1.9} />
          <input
            className="craving-input"
            value={text}
            placeholder="Paste a link or the whole share text"
            aria-label="Paste a saved post"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
        </div>
        <button className="big-btn" type="button" disabled={busy || !text.trim()} onClick={() => void add()}>
          {busy ? "Reading…" : "Add it"}
        </button>
        {err && <p className="saved-err">{err}</p>}
        {!durable && (
          <p className="saved-fine">
            Without <span className="data-num">DATABASE_URL</span> this list lives in server memory
            and will not survive a redeploy.
          </p>
        )}
      </div>

      {posts && posts.length > 0 && (
        <ul className="saved-list">
          {posts.map((p) => (
            <li key={p.id} className={`saved-item mat mat-thin${p.visitedAt ? " done" : ""}`}>
              <div className="saved-main">
                <p className="saved-name">
                  {p.resolved?.name ?? p.placeName ?? "Couldn't identify the place"}
                </p>
                {p.dishName && <p className="saved-dish">{p.dishName}</p>}
                <p className="saved-meta">
                  <span className="saved-platform">{PLATFORM_LABEL[p.platform] ?? "Link"}</span>
                  {p.resolved ? (
                    <>
                      <PinIcon size={12} strokeWidth={1.8} />
                      {p.resolved.address?.split(",").slice(0, 2).join(",") ?? "located"}
                    </>
                  ) : (
                    <>
                      <StoreIcon size={12} strokeWidth={1.8} />
                      {/* Honest: it is saved, but it cannot be recommended
                          because there is nowhere to send you. */}
                      not matched to a place yet
                    </>
                  )}
                </p>
              </div>
              <div className="saved-acts">
                {!p.visitedAt && p.resolved && (
                  <button
                    type="button"
                    className="saved-act"
                    aria-label="Mark as eaten"
                    onClick={() => void visited(p.id)}
                  >
                    <CheckIcon size={14} strokeWidth={2.4} />
                  </button>
                )}
                <button
                  type="button"
                  className="saved-act"
                  aria-label="Remove"
                  onClick={() => void drop(p.id)}
                >
                  <XIcon size={14} strokeWidth={2.2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
