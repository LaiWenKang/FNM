"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Eat", icon: "🍜" },
  { href: "/taste", label: "Taste", icon: "🎯" },
  { href: "/profile", label: "You", icon: "⚙️" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`tab ${active ? "active" : ""}`}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
