// Season recap — a "Wrapped"-style highlight reel for any period (a month, a
// quarter, or the whole year). Pure aggregation over data we already have.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { ExpensePeriod } from "@/types/expense";
import {
  loadRevenue,
  getWeekBookedGross,
  getGrossTargets,
  getCostBasis,
  payWeekRange,
} from "./rateTargets";
import { mpgWindows } from "./fuelEconomy";
import { classify, bestStreakOf, type WeekStatus } from "./grind";
import {
  PAY_WEEK_START_DOW,
  RATE_TIERS,
  WORKING_DAYS_PER_MONTH,
} from "@/lib/constants/targets";

const WEEK_MS = 7 * 86400000;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type RecapScope = "month" | "quarter" | "year";

export interface RecapRange {
  start: Date;
  end: Date;
  label: string; // "Jun 2026" / "Q2 2026" / "2026"
}

// Range for a scope: unit = month(0-11) for month, quarter(0-3) for quarter,
// ignored for year.
export const rangeFor = (scope: RecapScope, year: number, unit: number): RecapRange => {
  if (scope === "year")
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
      label: `${year}`,
    };
  if (scope === "quarter") {
    const m = unit * 3;
    return {
      start: new Date(Date.UTC(year, m, 1)),
      end: new Date(Date.UTC(year, m + 3, 1)),
      label: `Q${unit + 1} ${year}`,
    };
  }
  return {
    start: new Date(Date.UTC(year, unit, 1)),
    end: new Date(Date.UTC(year, unit + 1, 1)),
    label: `${MONTHS[unit]} ${year}`,
  };
};

// The period `periodsAgo` complete periods before now (0 = most recent complete).
export const resolvePeriod = (
  scope: RecapScope,
  periodsAgo: number,
  now: Date,
): RecapRange => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (scope === "year") return rangeFor("year", y - periodsAgo, 0);
  if (scope === "quarter") {
    const totalQ = y * 4 + Math.floor(m / 3) - 1 - periodsAgo;
    return rangeFor("quarter", Math.floor(totalQ / 4), ((totalQ % 4) + 4) % 4);
  }
  const totalM = y * 12 + m - 1 - periodsAgo;
  return rangeFor("month", Math.floor(totalM / 12), ((totalM % 12) + 12) % 12);
};

const inRange = (d: string | null | undefined, r: RecapRange): boolean => {
  if (!d) return false;
  const t = new Date(d.slice(0, 10) + "T00:00:00Z").getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

export interface RecapStats {
  scope: RecapScope;
  label: string;
  gross: number;
  loadedMiles: number;
  states: number;
  loads: number;
  bestWeek: number | null;
  biggestLoad: number | null;
  longestHaul: number | null;
  bestMpg: number | null;
  avgRpm: number | null;
  topLane: string | null;
  topAgent: string | null;
  netProfit: number | null;
  bestMonth: { label: string; profit: number } | null;
  hardestMonth: { label: string; profit: number } | null;
  bestStreak: number;
}

export const computeRecap = (
  loads: Load[],
  fuel: FuelEntry[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  range: RecapRange,
  scope: RecapScope,
  now: Date,
): RecapStats => {
  const mine = loads.filter((l) => l.load_status === "delivered" && inRange(l.delivery_date, range));

  const gross = mine.reduce((s, l) => s + loadRevenue(l), 0);
  const loadedMiles = mine.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);

  const stateSet = new Set<string>();
  for (const l of mine) {
    if (l.origin_state) stateSet.add(l.origin_state);
    if (l.destination_state) stateSet.add(l.destination_state);
  }

  const biggestLoad = mine.reduce<number | null>((m, l) => {
    const r = loadRevenue(l);
    return m == null || r > m ? r : m;
  }, null);
  const longestHaul = mine.reduce<number | null>((m, l) => {
    const v = Number(l.loaded_miles || 0);
    return m == null || v > m ? v : m;
  }, null);

  const laneRev = new Map<string, number>();
  const agentRev = new Map<string, number>();
  for (const l of mine) {
    const lane = `${l.origin_market} → ${l.delivery_market}`;
    laneRev.set(lane, (laneRev.get(lane) ?? 0) + loadRevenue(l));
    if (l.agent) agentRev.set(l.agent, (agentRev.get(l.agent) ?? 0) + loadRevenue(l));
  }
  const topOf = (m: Map<string, number>): string | null => {
    let best: string | null = null;
    let bv = -1;
    for (const [k, v] of m) if (v > bv) { bv = v; best = k; }
    return best;
  };

  // best MPG tank whose closing fill lands in the range
  let bestMpg: number | null = null;
  for (const w of mpgWindows(fuel)) if (inRange(w.date, range) && (bestMpg == null || w.mpg > bestMpg)) bestMpg = w.mpg;

  // P&L: net profit + best / hardest month over the range
  let netProfit: number | null = null;
  const monthly: { label: string; profit: number }[] = [];
  for (const p of periods) {
    if (!inRange(p.period_month, range)) continue;
    const profit = (p.income_total ?? 0) - (p.cogs_total ?? 0) - (p.expense_total ?? 0);
    netProfit = (netProfit ?? 0) + profit;
    const d = new Date(p.period_month);
    monthly.push({ label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, profit });
  }
  let bestMonth: { label: string; profit: number } | null = null;
  let hardestMonth: { label: string; profit: number } | null = null;
  if (monthly.length >= 2) {
    bestMonth = monthly.reduce((a, b) => (b.profit > a.profit ? b : a));
    hardestMonth = monthly.reduce((a, b) => (b.profit < a.profit ? b : a));
  }

  // weekly gross → best week + best target-beating streak in the range
  const targets = getGrossTargets(
    getCostBasis(periods, obligationsMonthly, loads, now).trueMonthlyCost,
    RATE_TIERS.target,
    WORKING_DAYS_PER_MONTH,
  );
  let bestWeek: number | null = null;
  const statuses: WeekStatus[] = [];
  const firstWeek = payWeekRange(range.start, PAY_WEEK_START_DOW).start.getTime();
  for (let t = firstWeek; t < range.end.getTime(); t += WEEK_MS) {
    if (t < range.start.getTime()) continue; // skip the partial leading week
    const wg = getWeekBookedGross(loads, new Date(t), new Date(t + WEEK_MS));
    if (bestWeek == null || wg > bestWeek) bestWeek = wg;
    statuses.push(classify(wg, targets));
  }

  return {
    scope,
    label: range.label,
    gross,
    loadedMiles,
    states: stateSet.size,
    loads: mine.length,
    bestWeek,
    biggestLoad,
    longestHaul,
    bestMpg,
    avgRpm: loadedMiles > 0 ? gross / loadedMiles : null,
    topLane: topOf(laneRev),
    topAgent: topOf(agentRev),
    netProfit,
    bestMonth,
    hardestMonth,
    bestStreak: bestStreakOf(statuses),
  };
};
