// A dispatcher's RECAP — the season stats plus the two poster-only figures
// (detention she collected, her best pay-week). Same scope as the season:
// booked by her, not cancelled, picked up in the range; all GROSS. Pure.
import type { Load } from "@/types/load";
import { loadGross, payWeekRange, type RateLadder } from "./rateTargets";
import { detentionCollectedMinutes } from "@/lib/detention";
import { PAY_WEEK_START_DOW } from "@/lib/constants/targets";
import type { RecapScope, RecapRange } from "./recap";
import {
  dispatchSeason,
  loadsInPeriod,
  type DispatchSeason,
} from "./dispatcherSeason";

const WEEK_MS = 7 * 86400000;

export interface DispatcherRecapStats extends DispatchSeason {
  detentionCollectedMin: number; // confirmed billable AND paid
  bestWeekGross: number | null; // gross booked in her best pay-week; null with no loads
}

const pickupTime = (l: Load): number =>
  new Date(l.pickup_date.slice(0, 10) + "T00:00:00Z").getTime();

// Best pay-week = most gross booked, loads bucketed by PICKUP day. Walks the
// pay-weeks from the one containing the range start, stepping 7 days to the
// range end. `mine` is already range-filtered, so the partial leading and
// trailing weeks only ever hold in-range pickups — unlike the owner's recap,
// which sums over ALL loads and has to skip the leading week.
const bestWeekOf = (mine: Load[], range: RecapRange): number | null => {
  if (mine.length === 0) return null;
  const dated = mine.map((l) => ({ t: pickupTime(l), gross: loadGross(l) }));
  let best: number | null = null;
  const firstWeek = payWeekRange(range.start, PAY_WEEK_START_DOW).start.getTime();
  for (let t = firstWeek; t < range.end.getTime(); t += WEEK_MS) {
    const we = t + WEEK_MS;
    const gross = dated.reduce(
      (s, d) => s + (d.t >= t && d.t < we ? d.gross : 0),
      0,
    );
    if (best == null || gross > best) best = gross;
  }
  return best;
};

export const dispatcherRecap = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  range: RecapRange,
  ladder: RateLadder,
  freeHours: number,
): DispatcherRecapStats => {
  const mine = loadsInPeriod(loads, userId, range);
  return {
    ...dispatchSeason(loads, userId, scope, range, ladder, freeHours),
    detentionCollectedMin: mine.reduce(
      (s, l) => s + detentionCollectedMinutes(l, freeHours),
      0,
    ),
    bestWeekGross: bestWeekOf(mine, range),
  };
};
