// The driver page's grading math — the season grades (rate, utilization,
// margin on the one margin goal), the profit-lever bottleneck, and the last
// complete quarter's stat line. The career rank, personal bests and trophies
// that rode these left with the game layer (the Redesign, phase B). Pure; take
// `now` explicitly so it's testable.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import { deadheadPctOver } from "./deadhead";
// GROSS revenue — avgRpm (booking rate), bestLane, and the best-week/biggest-load
// records are market value (Jason's ruling). The net figures (netRevenue, netProfit,
// trueNet) are derived from the P&L `income`, not from loadRevenue.
import { loadRevenue } from "./loads";
import { type RateLadder } from "./rateTargets";
import { resolvePeriod } from "./recap";
import { qboPretaxMargin, type FinancialMonth } from "./cashflow";
import { MARGIN_GOAL } from "@/lib/constants/targets";
import { isDelivered } from "./status";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Grade = "below" | "minimum" | "target" | "strong";
const ORDER: Grade[] = ["below", "minimum", "target", "strong"];

// The lower of two grades (a weakness in either dimension caps the season).
export const worseGrade = (a: Grade | null, b: Grade | null): Grade | null => {
  if (a == null) return b;
  if (b == null) return a;
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
};

// ---------- season grades ----------
// Margin bands derive from the ONE margin knob — margin_goal on Settings
// (Jason's researched 15% for flatbed/oversize, 2026-09-02): goal −5pts /
// goal / goal +5pts ⇒ 10 / 15 / 20. Single source, so no surface can grade
// the same margin differently from another. (Replaced the hardcoded 8/17/27
// bands that predated depreciation-honest margins.)
// Rounded to 4 decimals so float dirt (0.17 − 0.05 = 0.12000000000000001)
// can't break the inclusive band edges.
const r4 = (n: number) => Math.round(n * 10000) / 10000;
export const marginBandsFrom = (goal: number = MARGIN_GOAL) => ({
  minimum: Math.max(0, r4(goal - 0.05)),
  target: r4(goal),
  strong: r4(goal + 0.05),
});

export const marginGrade = (
  pct: number | null,
  goal: number = MARGIN_GOAL,
): Grade | null => {
  if (pct == null) return null;
  const bands = marginBandsFrom(goal);
  if (pct >= bands.strong) return "strong";
  if (pct >= bands.target) return "target";
  if (pct >= bands.minimum) return "minimum";
  return "below";
};

// Where your rate lands on your own break-even ladder.
export const rpmGrade = (rpm: number | null, ladder: RateLadder): Grade | null => {
  if (rpm == null || ladder.walkAway == null) return null;
  if (ladder.strong != null && rpm >= ladder.strong) return "strong";
  if (ladder.target != null && rpm >= ladder.target) return "target";
  return rpm >= ladder.walkAway ? "minimum" : "below";
};

// THE graded margin — one definition per page (Nod Sheet 2026-11-04, §5):
// the QBO pretax margin over the last three CLOSED months when the archive
// has them (accountant-grade, depreciation included), else the app's season
// operating margin, labelled as the estimate it is. The lever, the medal and
// the Trophy Hall all read this one, so a medal can't say "strong" while the
// lever two inches above it says BELOW.
export interface GradedMargin {
  value: number | null;
  grade: Grade | null;
  label: string; // "Pretax margin" (QBO) | "Op margin" (app estimate)
  basis: string; // "QBO · May–Jul ’26" | "app est. · Apr–Jun 2026"
  source: "qbo" | "app";
}

export const gradedMargin = (
  financials: FinancialMonth[],
  season: SeasonStats,
  now: Date,
  goal: number = MARGIN_GOAL,
): GradedMargin => {
  const qbo = qboPretaxMargin(financials, now);
  if (qbo)
    return { value: qbo.margin, grade: marginGrade(qbo.margin, goal), label: "Pretax margin", basis: `QBO · ${qbo.label}`, source: "qbo" };
  return {
    value: season.netMargin,
    grade: marginGrade(season.netMargin, goal),
    label: "Op margin",
    basis: `app est. · ${season.label}`,
    source: "app",
  };
};

// Utilization graded on the industry benchmark (70 / 80 / 85%).
export const utilizationGrade = (u: number | null): Grade | null => {
  if (u == null) return null;
  if (u >= 0.85) return "strong";
  if (u >= 0.8) return "target";
  if (u >= 0.7) return "minimum";
  return "below";
};

// ---------- profit-lever bottleneck (Rate × Utilization × Margin) ----------
export interface Lever {
  key: string;
  label: string;
  grade: Grade | null;
}

const GRADE_RANK: Record<Grade, number> = {
  below: 0,
  minimum: 1,
  target: 2,
  strong: 3,
};

// The weakest lever(s) worth flagging — only when the weakest is below/minimum.
// Ties return every lever at that grade. Empty = no bottleneck (all at target+,
// or nothing graded yet).
export const bottleneckLevers = (levers: Lever[]): Lever[] => {
  const graded = levers.filter((l) => l.grade != null);
  if (!graded.length) return [];
  const minRank = Math.min(...graded.map((l) => GRADE_RANK[l.grade!]));
  if (minRank > GRADE_RANK.minimum) return [];
  return graded.filter((l) => GRADE_RANK[l.grade!] === minRank);
};

// True when every graded lever is at target or better — no bottleneck to flag.
export const allLeversOnTarget = (levers: Lever[]): boolean => {
  const graded = levers.filter((l) => l.grade != null);
  return graded.length > 0 && graded.every((l) => GRADE_RANK[l.grade!] >= GRADE_RANK.target);
};

// ---------- season stat line ----------
export interface SeasonStats {
  label: string; // e.g. "Apr–Jun 2026"
  netRevenue: number; // P&L income (net of Landstar) over the window
  netProfit: number; // operating profit: income − COGS − expenses
  netMargin: number | null; // operating margin — the graded number
  trueNet: number; // operating profit − debt obligations (draws excluded)
  trueNetMargin: number | null;
  loads: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadPct: number | null;
  avgRpm: number | null; // gross revenue ÷ loaded mile
  bestLane: { lane: string; revenue: number } | null;
  months: number; // months with a P&L in the window
}

const inWindow = (
  d: string | null | undefined,
  months: { year: number; month: number }[],
): boolean => {
  if (!d) return false;
  const dt = new Date(d);
  return months.some(
    (m) => dt.getUTCFullYear() === m.year && dt.getUTCMonth() === m.month,
  );
};

// A "season" is always a calendar QUARTER — the last COMPLETE one (Q1 Jan–Mar,
// Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec), matching the recap. Never a rolling
// window that drifts across a quarter line.
const lastQuarterMonths = (now: Date): { year: number; month: number }[] => {
  const start = resolvePeriod("quarter", 0, now).start;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  return [0, 1, 2].map((i) => ({ year: y, month: m + i }));
};

export const getSeasonStats = (
  periods: ExpensePeriod[],
  loads: Load[],
  trips: Trip[],
  now: Date,
  // Monthly DEBT obligations (owner draws excluded) — subtracted from operating
  // profit to get True Net over the same months the P&L covers.
  obligationsDebtMonthly = 0,
): SeasonStats => {
  const months = lastQuarterMonths(now);

  let income = 0;
  let cost = 0;
  let n = 0;
  for (const p of periods) {
    if (!inWindow(p.period_month, months)) continue;
    income += p.income_total ?? 0;
    cost += (p.cogs_total ?? 0) + (p.expense_total ?? 0);
    n++;
  }
  const netProfit = income - cost;
  const trueNet = netProfit - obligationsDebtMonthly * n;

  const seasonLoads = loads.filter(
    (l) => isDelivered(l) && inWindow(l.delivery_date, months),
  );
  const loaded = seasonLoads.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  // Actual deadhead, odometer-derived, with non-revenue trips counted as fully
  // empty — the same math the dashboard KPI uses, so the two always agree.
  const seasonTrips = trips.filter((t) => inWindow(t.trip_date, months));
  const deadPct = deadheadPctOver(seasonLoads, seasonTrips);
  // Miles run this season. Prefer the odometer window; fall back to loaded +
  // planned deadhead when a load has no readings, so "miles" never reads 0 while
  // loaded miles exist. Trip windows are added on — they're miles too. (This
  // fallback is why totalMiles can exceed the strict odometer base deadheadPct
  // is computed from, on loads whose readings were never entered.)
  const total =
    seasonLoads.reduce((s, l) => {
      const odo =
        l.odometer_end != null && l.odometer_start != null
          ? Number(l.odometer_end) - Number(l.odometer_start)
          : 0;
      return s + (odo > 0 ? odo : Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0));
    }, 0) +
    seasonTrips.reduce((s, t) => {
      const odo =
        t.odometer_end != null && t.odometer_start != null
          ? Number(t.odometer_end) - Number(t.odometer_start)
          : 0;
      return s + Math.max(0, odo);
    }, 0);
  const revenue = seasonLoads.reduce((s, l) => s + loadRevenue(l), 0);

  const laneRev = new Map<string, number>();
  for (const l of seasonLoads) {
    const lane = `${l.origin_market} → ${l.delivery_market}`;
    laneRev.set(lane, (laneRev.get(lane) ?? 0) + loadRevenue(l));
  }
  let bestLane: { lane: string; revenue: number } | null = null;
  for (const [lane, rev] of laneRev)
    if (!bestLane || rev > bestLane.revenue) bestLane = { lane, revenue: rev };

  const label =
    months.length > 0
      ? `${MONTHS[months[0].month]}–${MONTHS[months[months.length - 1].month]} ${months[months.length - 1].year}`
      : "—";

  return {
    label,
    netRevenue: income,
    netProfit,
    netMargin: income > 0 ? netProfit / income : null,
    trueNet,
    trueNetMargin: income > 0 ? trueNet / income : null,
    loads: seasonLoads.length,
    totalMiles: total,
    loadedMiles: loaded,
    deadheadPct: deadPct,
    avgRpm: loaded > 0 ? revenue / loaded : null,
    bestLane,
    months: n,
  };
};
