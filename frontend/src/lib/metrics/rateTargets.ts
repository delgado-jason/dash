import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";

// Rate & pace targets, all derived live from the P&L + loads. Pure functions
// take `now` explicitly so they're testable without touching the clock.

// Load gross revenue = linehaul + fuel surcharge + accessorials (NUMERIC strings).
export const loadRevenue = (l: Load): number =>
  Number(l.linehaul) + Number(l.fuel_surcharge) + Number(l.total_accessorials);

// The `count` COMPLETE calendar months before now's month (excludes the
// in-progress current month — its miles lag its cost and would inflate $/mile).
// now = 2026-07-xx, count = 3 → [Apr, May, Jun] 2026.
export const completeMonthsBefore = (
  now: Date,
  count: number,
): { year: number; month: number }[] => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: { year: number; month: number }[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }
  return out;
};

// Delivered-load miles for one UTC month: total = odometer window, loaded =
// loaded_miles. Mirrors the Expenses page's month-miles logic.
const monthMiles = (loads: Load[], year: number, month: number) => {
  const inMonth = loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.delivery_date &&
      new Date(l.delivery_date).getUTCFullYear() === year &&
      new Date(l.delivery_date).getUTCMonth() === month,
  );
  const total = inMonth.reduce(
    (s, l) =>
      s +
      (l.odometer_end != null && l.odometer_start != null
        ? Number(l.odometer_end) - Number(l.odometer_start)
        : 0),
    0,
  );
  const loaded = inMonth.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  const revenue = inMonth.reduce((s, l) => s + loadRevenue(l), 0);
  return { total, loaded, revenue };
};

export interface CostBasis {
  trueMonthlyCost: number | null; // avg monthly true cost over included months
  loadedMiles: number; // summed over included months
  totalMiles: number;
  breakEvenRpm: number | null; // true cost ÷ loaded miles = the walk-away rate
  windowRpm: number | null; // revenue ÷ loaded miles over the window (your rate)
  months: number; // months with a P&L that were actually included
}

// Blend true cost + miles over the last `monthsBack` COMPLETE months. Only
// months that have a P&L are counted, and their miles are summed over the SAME
// months, so numerator and denominator always cover the same window.
export const getCostBasis = (
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  loads: Load[],
  now: Date,
  monthsBack = 3,
): CostBasis => {
  const byKey = new Map<string, ExpensePeriod>();
  for (const p of periods) {
    const d = new Date(p.period_month);
    byKey.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, p);
  }

  let cost = 0;
  let loaded = 0;
  let total = 0;
  let revenue = 0;
  let n = 0;
  for (const { year, month } of completeMonthsBefore(now, monthsBack)) {
    const p = byKey.get(`${year}-${month}`);
    if (!p) continue; // no P&L for this month → skip cost AND miles (stay aligned)
    n++;
    cost += (p.cogs_total ?? 0) + (p.expense_total ?? 0) + obligationsMonthly;
    const m = monthMiles(loads, year, month);
    loaded += m.loaded;
    total += m.total;
    revenue += m.revenue;
  }

  return {
    trueMonthlyCost: n > 0 ? cost / n : null,
    loadedMiles: loaded,
    totalMiles: total,
    breakEvenRpm: loaded > 0 ? cost / loaded : null,
    windowRpm: loaded > 0 ? revenue / loaded : null,
    months: n,
  };
};

export interface RateTiers {
  minimum: number;
  target: number;
  strong: number;
}

export interface RateLadder {
  walkAway: number | null; // break-even per loaded mile — below this you lose money
  minimum: number | null;
  target: number | null;
  strong: number | null;
}

// Tiers are markups over the walk-away (break-even) rate.
export const getRateLadder = (
  breakEvenRpm: number | null,
  tiers: RateTiers,
): RateLadder => {
  if (breakEvenRpm == null)
    return { walkAway: null, minimum: null, target: null, strong: null };
  return {
    walkAway: breakEvenRpm,
    minimum: breakEvenRpm * (1 + tiers.minimum),
    target: breakEvenRpm * (1 + tiers.target),
    strong: breakEvenRpm * (1 + tiers.strong),
  };
};

const WEEKS_PER_MONTH = 52 / 12;

export interface GrossTargets {
  weeklyBreakEven: number | null; // gross needed to cover true cost
  weeklyTarget: number | null; // + target-tier markup
  dailyBreakEven: number | null;
  dailyTarget: number | null;
}

export const getGrossTargets = (
  trueMonthlyCost: number | null,
  targetTier: number,
  workingDaysPerMonth: number,
): GrossTargets => {
  if (trueMonthlyCost == null || trueMonthlyCost <= 0)
    return {
      weeklyBreakEven: null,
      weeklyTarget: null,
      dailyBreakEven: null,
      dailyTarget: null,
    };
  const weekly = trueMonthlyCost / WEEKS_PER_MONTH;
  const daily = trueMonthlyCost / workingDaysPerMonth;
  return {
    weeklyBreakEven: weekly,
    weeklyTarget: weekly * (1 + targetTier),
    dailyBreakEven: daily,
    dailyTarget: daily * (1 + targetTier),
  };
};

// [start, end) UTC for the pay week containing `now`. startDow: 0=Sun … 6=Sat.
export const payWeekRange = (
  now: Date,
  startDow: number,
): { start: Date; end: Date } => {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const diff = (d.getUTCDay() - startDow + 7) % 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - diff);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
};

// Gross of every non-cancelled load delivering in [start, end) — booked,
// in-transit, and delivered all count, so mid-week shows committed + earned.
export const getWeekBookedGross = (
  loads: Load[],
  start: Date,
  end: Date,
): number => {
  let sum = 0;
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.delivery_date) continue;
    const dd = new Date(l.delivery_date);
    const day = new Date(
      Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()),
    );
    if (day >= start && day < end) sum += loadRevenue(l);
  }
  return sum;
};
