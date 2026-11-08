// ONE gross-$/DRIVEN-mile rate for Review and the dispatcher card (Nod Sheet
// 2026-11-05, GL-146): the booking ladder is gross per driven mile, so every
// surface that grades an agent's or a dispatcher's rate grades THAT, not net
// per loaded mile and not gross per loaded mile.
//
// A load's driven miles are, in order:
//   1. its odometer window (end − start) when both readings exist,
//   2. else loaded + deadhead when both are KNOWN (a null deadhead is unknown),
//   3. else UNKNOWN — the load drops out of the rate and is counted in
//      `unknown`; it is never driven as 0 (see scoreLoad's `missing` pattern).
import type { Load } from "@/types/load";
import { loadGross, type RateLadder } from "./rateTargets";
import { loadTotalMiles } from "./deadhead";
import { knownNumber } from "./loadScore";
import { rpmGrade, type Grade } from "./playerCard";

export const loadDrivenMiles = (l: Load): number | null => {
  const odo = loadTotalMiles(l);
  if (odo != null && Number.isFinite(odo) && odo > 0) return odo;
  const loaded = knownNumber(l.loaded_miles);
  const dead = knownNumber(l.deadhead_miles);
  if (loaded == null || dead == null) return null;
  const sum = loaded + dead;
  return sum > 0 ? sum : null;
};

export interface DrivenRate {
  rpm: number | null; // Σ gross ÷ Σ driven over the loads whose driven miles are known
  gross: number; // Σ gross over those loads
  driven: number; // Σ driven miles over those loads
  counted: number; // loads that fed the rate
  unknown: number; // loads left out because their driven miles are unknown
}

export const grossPerDrivenMile = (loads: Load[]): DrivenRate => {
  let gross = 0;
  let driven = 0;
  let counted = 0;
  let unknown = 0;
  for (const l of loads) {
    const d = loadDrivenMiles(l);
    if (d == null) {
      unknown += 1;
      continue;
    }
    gross += loadGross(l);
    driven += d;
    counted += 1;
  }
  return { rpm: driven > 0 ? gross / driven : null, gross, driven, counted, unknown };
};

// The grade of a set of loads: null when no load has known driven miles or
// there is no ladder — unknown is never graded.
export const gradeGrossPerDrivenMile = (loads: Load[], ladder: RateLadder | null): Grade | null =>
  ladder ? rpmGrade(grossPerDrivenMile(loads).rpm, ladder) : null;
