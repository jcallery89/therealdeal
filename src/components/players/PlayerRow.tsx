import { BYE_WEEKS } from "@/lib/config";
import { CanonicalPlayer } from "@/lib/players/canonical";

export const POSITION_STYLES: Record<string, string> = {
  QB: "bg-rose-500/15 text-rose-300",
  RB: "bg-emerald-500/15 text-emerald-300",
  WR: "bg-sky-500/15 text-sky-300",
  TE: "bg-amber-500/15 text-amber-300",
  K: "bg-violet-500/15 text-violet-300",
  DEF: "bg-slate-500/20 text-slate-300",
};

export function PositionBadge({ position }: { position: string }) {
  return (
    <span
      className={`inline-flex w-9 justify-center rounded px-1 py-0.5 text-[11px] font-semibold ${
        POSITION_STYLES[position] ?? "bg-slate-700 text-slate-300"
      }`}
    >
      {position}
    </span>
  );
}

export function ValueChip({ value, max }: { value: number; max: number }) {
  const share = max > 0 ? value / max : 0;
  const tone =
    share >= 0.75
      ? "text-emerald-300"
      : share >= 0.45
        ? "text-sky-300"
        : share >= 0.2
          ? "text-slate-300"
          : "text-slate-500";
  return (
    <span className={`font-mono text-sm tabular-nums ${tone}`}>
      {value > 0 ? value.toLocaleString() : "—"}
    </span>
  );
}

export function PlayerBadges({
  player,
  currentWeek,
}: {
  player: CanonicalPlayer;
  currentWeek: number;
}) {
  const bye = player.team ? BYE_WEEKS[player.team] : undefined;
  const injury = player.injuryStatus;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      {player.trending?.add !== undefined && (
        <span title={`${player.trending.add.toLocaleString()} adds in 24h`} className="text-orange-400">
          🔥{player.trending.add >= 1000 ? `${Math.round(player.trending.add / 1000)}k` : player.trending.add}
        </span>
      )}
      {player.trending?.drop !== undefined && player.trending?.add === undefined && (
        <span title={`${player.trending.drop.toLocaleString()} drops in 24h`} className="text-slate-500">
          📉
        </span>
      )}
      {injury && injury !== "Healthy" && (
        <span className="font-semibold text-rose-400">
          {injury === "Questionable" ? "Q" : injury === "Doubtful" ? "D" : injury === "Out" ? "O" : injury}
        </span>
      )}
      {bye !== undefined && (
        <span className={bye === currentWeek ? "font-bold text-rose-300" : "text-slate-600"}>
          {bye === currentWeek ? "BYE" : `b${bye}`}
        </span>
      )}
    </span>
  );
}

export function PlayerCell({
  player,
  playerId,
  currentWeek,
}: {
  player: CanonicalPlayer | undefined;
  playerId: string;
  currentWeek: number;
}) {
  if (!player) {
    return <span className="text-sm text-slate-600">Unknown ({playerId})</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PositionBadge position={player.position} />
      <span className="truncate text-sm text-slate-200">{player.name}</span>
      <span className="shrink-0 text-[11px] text-slate-500">
        {player.team ?? "FA"}
        {player.age !== null ? ` · ${player.age}` : ""}
      </span>
      <PlayerBadges player={player} currentWeek={currentWeek} />
    </span>
  );
}
