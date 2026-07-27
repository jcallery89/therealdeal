import { LeagueConfig, TE_PREMIUM_MULTIPLIER } from "../config";
import { CanonicalPlayer } from "../players/canonical";

export type ValueSource = "fc" | "ktc" | "blend";

export interface ValueContext {
  fcDynMax: number;
  fcRedMax: number;
  ktcSfMax: number;
  ktcOneQbMax: number;
}

export function computeValueContext(players: Record<string, CanonicalPlayer>): ValueContext {
  let fcDynMax = 1, fcRedMax = 1, ktcSfMax = 1, ktcOneQbMax = 1;
  for (const p of Object.values(players)) {
    fcDynMax = Math.max(fcDynMax, p.values.fcDynastySf?.value ?? 0);
    fcRedMax = Math.max(fcRedMax, p.values.fcRedraft?.value ?? 0);
    ktcSfMax = Math.max(ktcSfMax, p.values.ktc?.sf ?? 0);
    ktcOneQbMax = Math.max(ktcOneQbMax, p.values.ktc?.oneQb ?? 0);
  }
  return { fcDynMax, fcRedMax, ktcSfMax, ktcOneQbMax };
}

const BLEND_SCALE = 10000;

function tepAdjust(value: number, position: string): number {
  return position === "TE" ? Math.round(value * TE_PREMIUM_MULTIPLIER) : value;
}

/**
 * Format-aware player value.
 * - Dynasty SF league: FC dynasty-SF and/or KTC SF. Blend = mean of the two
 *   after normalizing each source to share-of-top-player x 10000 (the sources
 *   use different absolute scales).
 * - Keeper league (1QB, win-now): FC redraft is primary. KTC has no redraft
 *   values, so 'ktc'/'blend' fall back to FC redraft there (KTC 1QB dynasty
 *   value is surfaced separately as context in the UI).
 * Both leagues apply the TE-premium multiplier.
 */
export function playerValue(
  p: CanonicalPlayer,
  league: LeagueConfig,
  source: ValueSource,
  ctx: ValueContext
): number {
  if (league.isDynasty) {
    const fc = p.values.fcDynastySf?.value ?? 0;
    const ktc = p.values.ktc?.sf ?? 0;
    const fcNorm = (fc / ctx.fcDynMax) * BLEND_SCALE;
    const ktcNorm = (ktc / ctx.ktcSfMax) * BLEND_SCALE;
    let v: number;
    if (source === "fc") v = fc;
    else if (source === "ktc") v = ktc;
    else if (fc > 0 && ktc > 0) v = Math.round((fcNorm + ktcNorm) / 2);
    else v = Math.round(Math.max(fcNorm, ktcNorm));
    return tepAdjust(v, p.position);
  }
  return tepAdjust(p.values.fcRedraft?.value ?? 0, p.position);
}

/** Secondary context value shown alongside the primary (keeper league only). */
export function keeperContextValue(p: CanonicalPlayer): number | null {
  return p.values.ktc?.oneQb ?? null;
}

export function trend30(p: CanonicalPlayer, league: LeagueConfig): number {
  return (league.isDynasty ? p.values.fcDynastySf?.trend30Day : p.values.fcRedraft?.trend30Day) ?? 0;
}
