"use client";

import Link from "next/link";
import { useMemo } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PositionBadge } from "@/components/players/PlayerRow";
import { starterSlots } from "@/lib/analysis/rosterStrength";
import { findTrades } from "@/lib/analysis/tradeFinder";
import { TradeAsset } from "@/lib/analysis/trade";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { CanonicalPlayer } from "@/lib/players/canonical";
import { playerValue } from "@/lib/values/engine";

function AssetLine({ asset }: { asset: TradeAsset }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="flex min-w-0 items-center gap-2 text-sm text-slate-200">
        {asset.kind === "player" && asset.position ? (
          <PositionBadge position={asset.position} />
        ) : (
          <span className="inline-flex w-9 shrink-0 justify-center rounded bg-indigo-500/15 px-1 py-0.5 text-[11px] font-semibold text-indigo-300">
            PICK
          </span>
        )}
        <span className="truncate">{asset.label}</span>
      </span>
      <span className="font-mono text-xs text-slate-400">{asset.value.toLocaleString()}</span>
    </div>
  );
}

export default function TradeFinder({ bundle }: { bundle: LeagueBundle }) {
  const { user } = useSleeperUser();
  const { leagueConfig, league, rosters, users, players, valueContext, picks, pickValues, teamAnalytics, state } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;

  const teamNameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const valueOf = useMemo(
    () => (p: CanonicalPlayer) => playerValue(p, leagueConfig, bundle.defaultSource, valueContext),
    [leagueConfig, bundle.defaultSource, valueContext]
  );

  const suggestions = useMemo(
    () =>
      findTrades({
        league: leagueConfig,
        myRosterId,
        rosters,
        players,
        valueOf,
        slots: starterSlots(league.roster_positions),
        teamAnalytics,
        picks,
        pickValues,
        currentSeason: state.season,
        teamNameById,
        limit: 10,
      }),
    [leagueConfig, myRosterId, rosters, players, valueOf, league.roster_positions, teamAnalytics, picks, pickValues, state.season, teamNameById]
  );

  const analyzerLink = (s: (typeof suggestions)[number]) => {
    const params = new URLSearchParams({
      a: String(myRosterId),
      b: String(s.opponentRosterId),
      sendA: s.send.map((x) => x.id).join(","),
      sendB: s.receive.map((x) => x.id).join(","),
    });
    return `/league/${leagueConfig.id}/trade?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesDegraded={bundle.valuesDegraded} />

      <h1 className="text-2xl font-bold text-slate-100">Trade Finder</h1>
      <p className="mt-1 text-sm text-slate-500">
        {leagueConfig.label} · scans all {rosters.length - 1} opponents for deals that help both
        sides — fair value, complementary needs, matching timelines
      </p>

      <div data-testid="trade-suggestions" className="mt-5 flex flex-col gap-4">
        {suggestions.map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-200">
                with <span className="text-sky-300">{teamNameById.get(s.opponentRosterId)}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-slate-500">
                <span>value gap {s.deltaPct.toFixed(0)}%</span>
                <span>fit score {s.mutualScore.toFixed(1)}</span>
                <Link
                  href={analyzerLink(s)}
                  className="rounded-md bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300 hover:bg-emerald-500/25"
                >
                  Open in analyzer →
                </Link>
              </span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-rose-400">You send</div>
                {s.send.map((a) => (
                  <AssetLine key={a.id} asset={a} />
                ))}
                {s.theirNotes.length > 0 && (
                  <ul className="mt-2 border-t border-slate-800/60 pt-1.5">
                    {s.theirNotes.map((n, j) => (
                      <li key={j} className="text-[11px] text-slate-500">
                        their side: {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-400">
                  You receive
                </div>
                {s.receive.map((a) => (
                  <AssetLine key={a.id} asset={a} />
                ))}
                {s.myNotes.length > 0 && (
                  <ul className="mt-2 border-t border-slate-800/60 pt-1.5">
                    {s.myNotes.map((n, j) => (
                      <li key={j} className="text-[11px] text-emerald-400/80">
                        your side: {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
        {suggestions.length === 0 && (
          <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
            No mutually beneficial trades found right now — rosters may be too balanced. Check back
            as values move, or build something manually in the Trade Analyzer.
          </p>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-600">
        Suggestions pair your surpluses with opponents&apos; needs (and vice versa), keep the
        consolidation-adjusted value gap under 12%, and align with each team&apos;s
        contend/rebuild posture. They&apos;re conversation starters — open one in the analyzer to
        tweak the package.
      </p>
    </div>
  );
}
