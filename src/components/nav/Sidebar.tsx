"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEAGUES } from "@/lib/config";

const LEAGUE_LINKS = [
  { slug: "", label: "Roster" },
  { slug: "/trade", label: "Trade Analyzer" },
  { slug: "/strategy", label: "Strategy" },
  { slug: "/startsit", label: "Start/Sit" },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-emerald-500/15 font-medium text-emerald-300"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-800 bg-slate-950/80 px-4 py-6 md:flex">
      <Link href="/" className="px-2">
        <div className="text-lg font-bold tracking-tight text-slate-100">🏈 League HQ</div>
        <div className="text-xs text-slate-500">Sleeper manager</div>
      </Link>

      <nav className="flex flex-col gap-6">
        <NavLink href="/" label="Overview" active={pathname === "/"} />
        {LEAGUES.map((league) => (
          <div key={league.id}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {league.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {LEAGUE_LINKS.map(({ slug, label }) => {
                const href = `/league/${league.id}${slug}`;
                const active =
                  slug === ""
                    ? pathname === `/league/${league.id}`
                    : pathname.startsWith(href);
                return <NavLink key={href} href={href} label={label} active={active} />;
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto px-3 text-[11px] leading-relaxed text-slate-600">
        Values: FantasyCalc &amp; KeepTradeCut.
        <br />
        Rosters sync from the Sleeper API.
      </div>
    </aside>
  );
}
