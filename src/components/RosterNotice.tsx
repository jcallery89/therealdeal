"use client";

import Link from "next/link";
import { StoredUser } from "@/lib/hooks/useSleeperUser";

/**
 * Explains why no team is marked "(me)": either no Sleeper account is linked
 * in this browser, or the linked account isn't on a roster in this league.
 */
export default function RosterNotice({
  ready,
  user,
  myRosterId,
  leagueLabel,
}: {
  ready: boolean;
  user: StoredUser | null;
  myRosterId: number | null;
  leagueLabel: string;
}) {
  if (!ready || myRosterId !== null) return null;
  return (
    <div
      data-testid="roster-notice"
      className="mb-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-300"
    >
      {user
        ? `Your Sleeper account (${user.username}) isn't on a roster in ${leagueLabel}, so no team is marked as yours. `
        : "No Sleeper account is linked in this browser, so no team is marked as yours. "}
      <Link href="/setup" className="font-medium underline">
        {user ? "Relink account" : "Link your account"}
      </Link>
    </div>
  );
}
