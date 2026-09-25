"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEAGUES } from "@/lib/config";
import { isActive, LEAGUE_LINKS, leagueHref } from "./navLinks";

function NavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
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

/** Overview + every league's pages. `onNavigate` lets a drawer close itself. */
export default function NavTree({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6">
      <NavLink href="/" label="Overview" active={pathname === "/"} onNavigate={onNavigate} />
      {LEAGUES.map((league) => (
        <div key={league.id}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {league.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {LEAGUE_LINKS.map(({ slug, label }) => {
              const href = leagueHref(league.id, slug);
              // The roster page is the league root: only an exact match counts.
              const active = slug === "" ? pathname === href : isActive(pathname, href);
              return (
                <NavLink key={href} href={href} label={label} active={active} onNavigate={onNavigate} />
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
