// Per-dispatcher SEASON — a month/quarter/year recap of one person's booked
// loads. Scoped by booked_by, all GROSS
// (see agents/lanes principle), reusing the recap RecapScope/range machinery.
// Pure; `now`/ranges are passed in so it's testable.
import type { Load } from "@/types/load";
import { loadGross } from "./rateTargets";
import { agentStops, scoreStops } from "./stopScore";
import { rangeFor, resolvePeriod, type RecapScope, type RecapRange } from "./recap";
import { isDelivered, isNeverRevenue } from "./status";
import { grossPerDrivenMile } from "./drivenRate";
import { cleanName } from "@/lib/relationships/nameOf";

const isReal = (l: Load) => !isNeverRevenue(l);

const inRange = (iso: string | null | undefined, r: RecapRange): boolean => {
  if (!iso) return false;
  const t = new Date(iso.slice(0, 10) + "T00:00:00Z").getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

// A dispatcher's loads inside a period — booked by them, not cancelled, and
// picked up in the range (credit follows when the load actually ran).
export const loadsInPeriod = (loads: Load[], userId: string, r: RecapRange): Load[] =>
  loads.filter(
    (l) => l.booked_by === userId && isReal(l) && inRange(l.pickup_date, r),
  );

// Gross $/DRIVEN-mile over a set — the one ladder (GL-146): the same rate the
// dispatcher card's avgBookedRate and Review grade, so the season and the
// card never disagree. Loads whose driven miles are unknown are
// left out, never driven as 0.
const grossPerMile = (loads: Load[]): number | null => grossPerDrivenMile(loads).rpm;
export interface DispatchSeason {
  scope: RecapScope;
  label: string;
  loadsBooked: number;
  grossBooked: number;
  avgRpm: number | null;
  onTimePct: number | null;
  bestLoad: number | null;
  topAgent: string | null;
  topLane: string | null;
  hasData: boolean;
}

// The period CONTAINING now (the current, in-progress month/quarter/year) — the
// season card's default. (recap's resolvePeriod only looks at finished periods.)
export const currentRange = (scope: RecapScope, now: Date): RecapRange => {
  const y = now.getUTCFullYear();
  if (scope === "year") return rangeFor("year", y, 0);
  if (scope === "quarter")
    return rangeFor("quarter", y, Math.floor(now.getUTCMonth() / 3));
  return rangeFor("month", y, now.getUTCMonth());
};

const topBy = (loads: Load[], keyOf: (l: Load) => string): string | null => {
  const m = new Map<string, number>();
  for (const l of loads) {
    const k = keyOf(l);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of m)
    if (c > n) {
      n = c;
      best = k;
    }
  return best;
};

export const dispatchSeason = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  range: RecapRange,
  freeHours: number,
): DispatchSeason => {
  const mine = loadsInPeriod(loads, userId, range);
  const avgRpm = grossPerMile(mine);
  const delivered = mine.filter((l) => isDelivered(l));
  const onTimePct = delivered.length
    ? scoreStops(agentStops(delivered, freeHours)).onTimePct
    : null;
  return {
    scope,
    label: range.label,
    loadsBooked: mine.length,
    grossBooked: mine.reduce((s, l) => s + loadGross(l), 0),
    avgRpm,
    onTimePct,
    bestLoad: mine.length ? Math.max(...mine.map(loadGross)) : null,
    topAgent: topBy(mine, (l) => cleanName(l.agent)),
    topLane: topBy(mine, (l) =>
      l.origin_market && l.delivery_market
        ? `${l.origin_market} → ${l.delivery_market}`
        : "",
    ),
    hasData: mine.length > 0,
  };
};

// The current in-progress period (what the card shows by default per scope).
export const currentSeason = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  freeHours: number,
  now: Date,
): DispatchSeason =>
  dispatchSeason(loads, userId, scope, currentRange(scope, now), freeHours);

// Recent COMPLETED periods for the history strip: label + loads.
export interface SeasonLogEntry {
  label: string;
  loads: number;
}
export const dispatchSeasonLog = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  freeHours: number,
  now: Date,
  count = 4,
): SeasonLogEntry[] => {
  const out: SeasonLogEntry[] = [];
  for (let ago = count - 1; ago >= 0; ago--) {
    const r = resolvePeriod(scope, ago, now);
    const s = dispatchSeason(loads, userId, scope, r, freeHours);
    out.push({
      label: r.label,
      loads: s.loadsBooked,
    });
  }
  return out;
};
