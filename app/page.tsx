import Link from "next/link";
import MoodCard from "@/components/MoodCard";

export default function Home() {
  return (
    <main>
      <div className="brand">
        FNM <span>·</span> Food Near Me
      </div>
      <div className="hero">
        <h1>
          Stop asking
          <br />
          &ldquo;what should we eat?&rdquo;
        </h1>
        <p>One confident pick, two backups. Under 60 seconds.</p>
        <MoodCard />
        <Link className="text-link" href="/onboarding">
          First time? Teach it your taste (1 min) →
        </Link>
      </div>
    </main>
  );
}
