/** Per-league pages, in-season essentials first. Shared by every nav surface. */
export const LEAGUE_LINKS = [
  { slug: "", label: "Roster" },
  { slug: "/startsit", label: "Start/Sit" },
  { slug: "/players", label: "Players" },
  { slug: "/trade", label: "Trade Analyzer" },
  { slug: "/tradefinder", label: "Trade Finder" },
  { slug: "/keepers", label: "Cutdown" },
  { slug: "/draft", label: "Draft Board" },
  { slug: "/strategy", label: "Strategy" },
  { slug: "/review", label: "Weekly Review" },
] as const;

export function leagueHref(leagueId: string, slug: string): string {
  return `/league/${leagueId}${slug}`;
}

/** Exact match or a nested route — "/trade" must not match "/tradefinder". */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
