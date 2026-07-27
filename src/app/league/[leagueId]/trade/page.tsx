import { notFound } from "next/navigation";
import TradeBuilder from "@/components/trade/TradeBuilder";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();

  // Trade Finder hand-off: ?a=&b=&sendA=&sendB= pre-populates the builder.
  const sp = await searchParams;
  const num = (v: string | string[] | undefined) => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  const list = (v: string | string[] | undefined) =>
    v ? String(v).split(",").filter(Boolean) : [];
  const prefill =
    sp.a || sp.b || sp.sendA || sp.sendB
      ? { teamA: num(sp.a), teamB: num(sp.b), sendA: list(sp.sendA), sendB: list(sp.sendB) }
      : null;

  return <TradeBuilder bundle={bundle} prefill={prefill} />;
}
