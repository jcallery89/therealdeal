import { notFound } from "next/navigation";
import TradeBuilder from "@/components/trade/TradeBuilder";
import { getLeagueBundle } from "@/lib/bundle";
import { HORIZON_SOURCES, horizonsFor, ValueHorizon, ValueMode, ValueSource } from "@/lib/values/engine";

export const dynamic = "force-dynamic";

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const bundle = await getLeagueBundle(leagueId, Boolean(sp.sync));
  if (!bundle) notFound();
  // Trade Finder hand-off: ?a=&b=&sendA=&sendB= pre-populates the builder.
  const num = (v: string | string[] | undefined) => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  const list = (v: string | string[] | undefined) =>
    v ? String(v).split(",").filter(Boolean) : [];
  // Value lens from the Trade Finder link (?h=&src=), validated for this league.
  const h = String(sp.h ?? "") as ValueHorizon;
  const src = String(sp.src ?? "") as ValueSource;
  const mode: ValueMode | null =
    horizonsFor(bundle.leagueConfig).includes(h) &&
    (src === "consensus" || HORIZON_SOURCES[h].includes(src as never))
      ? { horizon: h, source: src }
      : null;
  const prefill =
    sp.a || sp.b || sp.sendA || sp.sendB
      ? { teamA: num(sp.a), teamB: num(sp.b), sendA: list(sp.sendA), sendB: list(sp.sendB), mode }
      : null;

  return <TradeBuilder bundle={bundle} prefill={prefill} />;
}
