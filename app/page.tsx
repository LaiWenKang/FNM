import Link from "next/link";

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
        <Link className="big-btn" href="/recommend">
          🍜 Eat now
        </Link>
        <Link className="big-btn secondary" href="/onboarding">
          🎯 Teach it your taste (1 min)
        </Link>
      </div>
    </main>
  );
}
