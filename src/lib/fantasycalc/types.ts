export interface FcPlayerRef {
  id: number;
  name: string;
  position: string;
  sleeperId: string | null;
  maybeAge: number | null;
  maybeTeam: string | null;
}

export interface FcEntry {
  player: FcPlayerRef;
  value: number;
  overallRank: number;
  positionRank: number | null;
  trend30Day: number | null;
  redraftValue: number | null;
}

export type FcFormat = "dynasty_sf" | "redraft_1qb";
