export interface KtcEntry {
  playerName: string;
  position: string;
  team: string | null;
  age: number | null;
  oneQBValues: { value: number };
  superflexValues: { value: number };
}
