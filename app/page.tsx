import Link from "next/link";
import BrandRow from "@/components/BrandRow";
import MoodCard from "@/components/MoodCard";
import PlanBar from "@/components/PlanBar";
import TasteRadar from "@/components/TasteRadar";
import { TargetIcon } from "@/components/icons";
import { SEED_PLACES } from "@/lib/data/seed";

// Decorative watermark vector for the hero mini-radar (brand mark, not data).
const WATERMARK = { heat: 0.72, sweet: 0.45, soupy: 0.6, fried: 0.55, rich: 0.68, adventure: 0.5 };

export default function Home() {
  return (
    <main>
      <BrandRow />
      <div className="hero">
        <div className="headline-wrap">
          <TasteRadar vector={WATERMARK} decorative gid="wm" className="hero-radar" />
          <h1>
            Stop asking
            <br />
            <span className="grad-text">&ldquo;what should we eat?&rdquo;</span>
          </h1>
        </div>
        <p className="sub">
          One confident pick, two backups. Under <span className="data-num">60</span> seconds.
        </p>
        <PlanBar />
        <MoodCard />
        <Link className="hud-chip hud-link" href="/onboarding">
          <TargetIcon size={13} strokeWidth={2} />
          Calibrate your taste — 60 sec
        </Link>
        {/* Describes the catalog, not the user's plan — the plan bar owns that. */}
        <p className="home-foot" aria-hidden="true">
          <span className="dot" />
          Singapore CBD · {SEED_PLACES.length} spots indexed
        </p>
      </div>
    </main>
  );
}
