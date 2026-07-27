import { SleeperRoster } from "../sleeper/types";

/**
 * rosterId -> draft slot (1-based). Uses Sleeper's actual draft_order
 * (user_id-keyed) when the order is set; otherwise estimates inverse
 * standings (worst record picks first), the default for rookie drafts.
 */
export function draftSlots(
  rosters: SleeperRoster[],
  draftOrder: Record<string, number> | null
): Map<number, number> {
  const slots = new Map<number, number>();
  if (draftOrder) {
    let assigned = 0;
    for (const r of rosters) {
      const slot = r.owner_id ? draftOrder[r.owner_id] : undefined;
      if (slot !== undefined) {
        slots.set(r.roster_id, slot);
        assigned++;
      }
    }
    if (assigned === rosters.length) return slots;
    slots.clear();
  }
  const byRecord = [...rosters].sort((a, b) => {
    const wa = a.settings.wins / Math.max(1, a.settings.wins + a.settings.losses + a.settings.ties);
    const wb = b.settings.wins / Math.max(1, b.settings.wins + b.settings.losses + b.settings.ties);
    if (wa !== wb) return wa - wb;
    return (a.settings.fpts ?? 0) - (b.settings.fpts ?? 0);
  });
  byRecord.forEach((r, i) => slots.set(r.roster_id, i + 1));
  return slots;
}

export function formatPick(round: number, slot: number): string {
  return `${round}.${String(slot).padStart(2, "0")}`;
}
