import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";

// Rate & pace targets, all derived live from the P&L + loads. Pure functions
// take `now` explicitly so they're testable without touching the clock.

// The full customer rate (gross) = linehaul + fuel surcharge + accessorials. Used
// for pricing guidance, where the rate you actually book is what matters.
export const loadGross = (l: Load): number => {
  const gross = Number(l.gross_revenue);
  return Number.isFinite(gross)
    ? gross
    : Number(l.linehaul) + Number(l.fuel_surcharge) + Number(l.total_accessorials);
};

// A load's revenue = the owner-op's NET (their company gross after the carrier's
// settlement cut), computed server-side from the settlement schedule. Falls back
// to gross when net_revenue is absent (a user with no schedule, or a test fixture).
// This is THE revenue used everywhere — reporting, RPM, pace, and targets — so
// every number reflects what the company actually keeps.
export const loadRevenue = (l: Load): number => {
  const net = Number(l.net_revenue);
  return Number.isFinite(net) ? net : loadGross(l);
};

// The TRAILER's slice of a load's net — its % of linehaul plus its % of the
// base-rate accessorials it rides on (server-computed). The truck/driver earn
// the full load net; the trailer earns only this. Absent (no schedule / fixture)
// → 0, so a trailer with no settlement split simply shows nothing attributed.
export const loadTrailerNet = (l: Load): number => {
  const t = Number(l.trailer_net);
  return Number.isFinite(t) ? t : 0;
};

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
  const revenue = inMonth.reduce((s, l) => s + loadRevenue(l), 0); // net
  const gross = inMonth.reduce((s, l) => s + loadGross(l), 0); // full customer rate
  return { total, loaded, revenue, gross };
};

export interface CostBasis {
  trueMonthlyCost: number | null; // avg monthly true cost over included months
  loadedMiles: number; // summed over included months
  totalMiles: number;
  breakEvenRpm: number | null; // true cost ÷ LOADED miles (net break-even/mile)
  windowRpm: number | null; // net revenue ÷ loaded miles over the window
  costPerTotalMile: number | null; // true cost ÷ TOTAL miles — cost per mile driven
  grossPerTotalMile: number | null; // full gross ÷ TOTAL miles — your booked rate/mile
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
  let grossRev = 0;
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
    grossRev += m.gross;
  }

  return {
    trueMonthlyCost: n > 0 ? cost / n : null,
    loadedMiles: loaded,
    totalMiles: total,
    breakEvenRpm: loaded > 0 ? cost / loaded : null,
    windowRpm: loaded > 0 ? revenue / loaded : null,
    costPerTotalMile: total > 0 ? cost / total : null,
    grossPerTotalMile: total > 0 ? grossRev / total : null,
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

// The full rate per loaded mile you must BOOK to net a given (net) rate, given
// your linehaul take = linehaul % + trailer % (e.g. 0.73). Fuel surcharge and
// accessorials come on top, so this is the conservative linehaul price to quote.
// take >= 1 (own authority / unconfigured) → returns the net rate unchanged.
export const bookedRate = (net: number | null, take: number): number | null =>
  net == null || take <= 0 ? null : take >= 1 ? net : net / take;

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

// Non-cancelled loads delivering in [start, end) — booked, in-transit, and
// delivered all count, so mid-week reflects committed + earned freight.
const loadsInWeek = (loads: Load[], start: Date, end: Date): Load[] =>
  loads.filter((l) => {
    if (l.load_status === "cancelled" || !l.delivery_date) return false;
    const dd = new Date(l.delivery_date);
    const day = new Date(
      Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()),
    );
    return day >= start && day < end;
  });

export const getWeekBookedGross = (
  loads: Load[],
  start: Date,
  end: Date,
): number => loadsInWeek(loads, start, end).reduce((s, l) => s + loadRevenue(l), 0);

// Delivered-only gross for the week — freight actually HAULED (earned). Booked
// and in-transit are committed pipeline, not yet earned, so this is the honest
// basis for "did I hit target this week" (committed minus this = still to haul).
export const getWeekEarnedGross = (
  loads: Load[],
  start: Date,
  end: Date,
): number =>
  loadsInWeek(loads, start, end)
    .filter((l) => l.load_status === "delivered")
    .reduce((s, l) => s + loadRevenue(l), 0);

// This week's GROSS dollars (full customer rate) — for the rate & pace card, which
// tracks in gross because that's the number loads are booked at. Committed = all
// non-cancelled in the week; earned = delivered only. (Distinct from the two above,
// which sum NET revenue for the grind streak.)
export const getWeekGrossCommitted = (
  loads: Load[],
  start: Date,
  end: Date,
): number => loadsInWeek(loads, start, end).reduce((s, l) => s + loadGross(l), 0);

export const getWeekGrossEarned = (
  loads: Load[],
  start: Date,
  end: Date,
): number =>
  loadsInWeek(loads, start, end)
    .filter((l) => l.load_status === "delivered")
    .reduce((s, l) => s + loadGross(l), 0);

// This week's blended rate per loaded mile — where you're landing right now.
export const getWeekRpm = (
  loads: Load[],
  start: Date,
  end: Date,
): number | null => {
  const wk = loadsInWeek(loads, start, end);
  const revenue = wk.reduce((s, l) => s + loadRevenue(l), 0);
  const loaded = wk.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  return loaded > 0 ? revenue / loaded : null;
};

// Rolling blended RPM over the last `monthsBack` complete months — loads only,
// so it stands on its own (doesn't need a P&L like the break-even does).
export const getWindowRpm = (
  loads: Load[],
  now: Date,
  monthsBack = 3,
): number | null => {
  let revenue = 0;
  let loaded = 0;
  for (const { year, month } of completeMonthsBefore(now, monthsBack)) {
    const m = monthMiles(loads, year, month);
    revenue += m.revenue;
    loaded += m.loaded;
  }
  return loaded > 0 ? revenue / loaded : null;
};
