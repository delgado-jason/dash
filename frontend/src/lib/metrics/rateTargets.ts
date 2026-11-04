import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import {
  tiersFrom,
  specTiersFrom,
  marginGoalFrom,
  WORKING_DAYS_PER_MONTH,
  PAY_WEEK_START_DOW,
  BASIS_MONTHS,
} from "@/lib/constants/targets";
import { localToday } from "./today";

// Rate & pace targets, all derived live from the P&L + loads. Pure functions
// take `now` explicitly so they're testable without touching the clock.
// ONE basis (Nod Sheet 2026-11-04, call 12): every window here defaults to
// BASIS_MONTHS, and computeRateTargets at the bottom is the one function
// every surface that prices a mile or grades a week stands on.

// Monthly obligation cash that belongs in break-even / pace targets: active
// obligations only, EXCLUDING owner draws. A draw (is_draw) is a distribution of
// profit, not a cost of operating — folding it into break-even would treat paying
// yourself out as an expense and inflate the rate you "need". Mirrors how True Net
// already excludes draws. (The Expenses page keeps a separate cash-out view that
// intentionally includes draws.)
// on_pl rows (insurance, subscriptions) are already inside operating cost —
// they draft cash on the calendar but must NOT join the break-even sum.
export const monthlyObligationCost = (obligations: Obligation[]): number =>
  obligations
    .filter((o) => o.active && !o.is_draw && !o.on_pl)
    .reduce((s, o) => s + Number(o.amount), 0);

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
export const loadNetRevenue = (l: Load): number => {
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

// Delivered-load miles for one UTC month: total = the odometer windows as a
// UNION of spans, loaded = loaded_miles. Two loads sharing a span — a start
// copied from the previous load's start, as load 8126107 was in June ’26 —
// used to count the shared miles twice and put the walk-away rate 6¢ low
// (DB-04, 2026-11-04). A reversed, equal or zero reading is no span at all.
// The Expenses page reads this same function for its month tiles.
export const monthMiles = (loads: Load[], year: number, month: number) => {
  const inMonth = loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.delivery_date &&
      new Date(l.delivery_date).getUTCFullYear() === year &&
      new Date(l.delivery_date).getUTCMonth() === month,
  );
  const spans = inMonth
    .map((l) => ({ start: Number(l.odometer_start), end: Number(l.odometer_end) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start > 0 && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let high = -Infinity;
  for (const s of spans) {
    total += Math.max(0, s.end - Math.max(s.start, high));
    high = Math.max(high, s.end);
  }
  const loaded = inMonth.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  const revenue = inMonth.reduce((s, l) => s + loadNetRevenue(l), 0); // net
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
  payTake: number | null; // net ÷ gross — your blended keep after the carrier's cut
  months: number; // months with a P&L that were actually included
  // The included months, named — "Jun–Aug" (or "Mar, Apr, Jul" across a gap,
  // years on both ends when they differ) — so every surface can SAY which
  // window its break-even covers instead of leaving it a mystery.
  windowLabel: string | null;
  // The complete months inside the window with NO P&L filed, named the same
  // way ("Oct ’26") — said out loud, because a missing month silently shrinks
  // the basis (2026-11-01: October unfiled left break-even standing on two).
  missingLabel: string | null;
  monthsWanted: number; // the window the code asked for (BASIS_MONTHS)
  // Each included month on its own — its true cost, its driven miles and its
  // cost per driven mile — so a surface can show the spread the blend hides
  // ("months ran $2.68–$4.52") instead of one number pretending to be steady.
  monthsDetail: MonthDetail[];
}

export interface MonthDetail {
  year: number;
  month: number; // 0–11, UTC
  label: string; // "Aug ’26"
  cost: number; // the month's true cost (P&L operating cost + obligations)
  totalMiles: number; // the month's driven miles (odometer windows)
  costPerTotalMile: number | null; // null when the month drove no miles
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const windowLabelOf = (included: { year: number; month: number }[]): string | null => {
  if (included.length === 0) return null;
  const name = (m: { year: number; month: number }) => MONTH_ABBR[m.month];
  const withYr = (m: { year: number; month: number }) => `${name(m)} ’${String(m.year).slice(2)}`;
  const first = included[0];
  const last = included[included.length - 1];
  if (included.length === 1) return withYr(first);
  const idx = (m: { year: number; month: number }) => m.year * 12 + m.month;
  const contiguous = included.every((m, i) => i === 0 || idx(m) === idx(included[i - 1]) + 1);
  if (!contiguous)
    // Any listed month from a different year carries its own year tag.
    return [...included.slice(0, -1).map((m) => (m.year !== last.year ? withYr(m) : name(m))), withYr(last)].join(", ");
  if (first.year !== last.year) return `${withYr(first)}–${withYr(last)}`;
  return `${name(first)}–${withYr(last)}`;
};

// Blend true cost + miles over the last `monthsBack` COMPLETE months. Only
// months that have a P&L are counted, and their miles are summed over the SAME
// months, so numerator and denominator always cover the same window. The
// default is BASIS_MONTHS — it was 3, and four surfaces (month coverage, HEAT,
// the recap, the player card) silently stood on it while the Market, Expenses
// and Score a Load stood on six (call 12, 2026-11-04).
export const getCostBasis = (
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  loads: Load[],
  now: Date,
  monthsBack: number = BASIS_MONTHS,
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
  const included: { year: number; month: number }[] = [];
  const missing: { year: number; month: number }[] = [];
  const monthsDetail: MonthDetail[] = [];
  for (const { year, month } of completeMonthsBefore(now, monthsBack)) {
    const p = byKey.get(`${year}-${month}`);
    // A month with no P&L, or one saved without BOTH its totals (a broken
    // upload), is unfiled: skip its cost AND its miles. Counting a missing
    // section at $0 would read as a free month and drop every rung (October
    // ’26 did exactly that with both totals null; one null is the same lie).
    if (!p || p.cogs_total == null || p.expense_total == null) {
      missing.push({ year, month });
      continue;
    }
    n++;
    included.push({ year, month });
    const monthCost = (p.cogs_total ?? 0) + (p.expense_total ?? 0) + obligationsMonthly;
    cost += monthCost;
    const m = monthMiles(loads, year, month);
    loaded += m.loaded;
    total += m.total;
    revenue += m.revenue;
    grossRev += m.gross;
    monthsDetail.push({
      year,
      month,
      label: `${MONTH_ABBR[month]} ’${String(year).slice(2)}`,
      cost: monthCost,
      totalMiles: m.total,
      costPerTotalMile: m.total > 0 ? monthCost / m.total : null,
    });
  }

  return {
    trueMonthlyCost: n > 0 ? cost / n : null,
    loadedMiles: loaded,
    totalMiles: total,
    breakEvenRpm: loaded > 0 ? cost / loaded : null,
    windowRpm: loaded > 0 ? revenue / loaded : null,
    costPerTotalMile: total > 0 ? cost / total : null,
    grossPerTotalMile: total > 0 ? grossRev / total : null,
    payTake: grossRev > 0 ? revenue / grossRev : null,
    months: n,
    windowLabel: windowLabelOf(included),
    missingLabel: windowLabelOf(missing),
    monthsWanted: monthsBack,
    monthsDetail,
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
const CALENDAR_DAYS_PER_MONTH = 365 / 12;

export interface GrossTargets {
  weeklyBreakEven: number | null; // revenue needed to cover true cost
  weeklyTarget: number | null; // revenue that hits the margin goal
  // WORKING-day pair — the same cost spread over the days you plan to work
  // (WORKING_DAYS_PER_MONTH). "What must today earn?" — the dashboard's bar.
  dailyBreakEven: number | null;
  dailyTarget: number | null;
  // CALENDAR-day pair — the same cost spread over every day of the month,
  // worked or not. A LOAD owns calendar days: the truck sits under it over
  // the weekend too, so a $/day figure whose denominator counts weekends has
  // to be judged against a bar that counts them as well (lib/metrics/perDay).
  // Judging a Fri→Mon run against the working-day bar would call a fair load
  // a loser purely for spanning a weekend.
  dailyBreakEvenCalendar: number | null;
  dailyTargetCalendar: number | null;
}

// Weekly/daily REVENUE targets from your true cost and your target profit margin
// (profit ÷ revenue). Revenue at margin m = cost ÷ (1 − m). The margin goal is a
// business KPI set in Settings, deliberately separate from the per-mile rate
// tiers. Clamped elsewhere to < 1; guarded here so a bad value can't divide by 0.
export const getGrossTargets = (
  trueMonthlyCost: number | null,
  marginGoal: number,
  workingDaysPerMonth: number,
): GrossTargets => {
  const uplift = marginGoal < 1 ? 1 / (1 - Math.max(0, marginGoal)) : 1;
  if (trueMonthlyCost == null || trueMonthlyCost <= 0)
    return {
      weeklyBreakEven: null,
      weeklyTarget: null,
      dailyBreakEven: null,
      dailyTarget: null,
      dailyBreakEvenCalendar: null,
      dailyTargetCalendar: null,
    };
  const weekly = trueMonthlyCost / WEEKS_PER_MONTH;
  const daily = trueMonthlyCost / workingDaysPerMonth;
  const dailyCalendar = trueMonthlyCost / CALENDAR_DAYS_PER_MONTH;
  return {
    weeklyBreakEven: weekly,
    weeklyTarget: weekly * uplift,
    dailyBreakEven: daily,
    dailyTarget: daily * uplift,
    dailyBreakEvenCalendar: dailyCalendar,
    dailyTargetCalendar: dailyCalendar * uplift,
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

// Non-cancelled loads that fall in [start, end) — booked, in-transit, and
// delivered all count, so mid-week reflects committed + earned freight. Date a
// load by its delivery day when there is one (planned or actual), else by its
// pickup day — otherwise the in-transit load you're currently under (no delivery
// date yet) drops out of the committed pipeline entirely.
const loadsInWeek = (loads: Load[], start: Date, end: Date): Load[] =>
  loads.filter((l) => {
    if (l.load_status === "cancelled") return false;
    const ref = l.delivery_date ?? l.pickup_date;
    if (!ref) return false;
    const rd = new Date(ref);
    const day = new Date(
      Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), rd.getUTCDate()),
    );
    return day >= start && day < end;
  });

export const getWeekBookedGross = (
  loads: Load[],
  start: Date,
  end: Date,
): number => loadsInWeek(loads, start, end).reduce((s, l) => s + loadNetRevenue(l), 0);

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
    .reduce((s, l) => s + loadNetRevenue(l), 0);

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

// The week's still-open slice — in-window loads that haven't delivered yet.
// This is what stacks ON TOP of earned in a pace meter. getWeekGrossCommitted
// includes delivered loads (it's the week's whole book, rendered as an
// underlay on the owner card); summing THAT with earned double-counts every
// delivered load — the S9 Pulse bug, which resurfaced on the dispatch card
// (Jason, 2026-08-15: one $2,250 delivered load projecting as $4,500).
export const getWeekGrossPipeline = (
  loads: Load[],
  start: Date,
  end: Date,
): number =>
  loadsInWeek(loads, start, end)
    .filter((l) => l.load_status !== "delivered")
    .reduce((s, l) => s + loadGross(l), 0);

// Booked beyond the current pay week — the pipeline a dispatcher just built
// that the week meter can't show yet (committed counts only loads LANDING this
// week; a Saturday booking that delivers next Friday lives here until its week
// arrives). Live bookings only: booked or rolling, not yet delivered.
export const getBookedAheadGross = (loads: Load[], weekEnd: Date): number =>
  loads
    .filter(
      (l) =>
        (l.load_status === "booked" || l.load_status === "in_transit") &&
        l.delivery_date != null &&
        new Date(l.delivery_date).getTime() >= weekEnd.getTime(),
    )
    .reduce((s, l) => s + loadGross(l), 0);

// This week's blended rate per loaded mile — where you're landing right now.
export const getWeekRpm = (
  loads: Load[],
  start: Date,
  end: Date,
): number | null => {
  const wk = loadsInWeek(loads, start, end);
  const revenue = wk.reduce((s, l) => s + loadNetRevenue(l), 0);
  const loaded = wk.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  return loaded > 0 ? revenue / loaded : null;
};

// Rolling blended NET $/loaded mile over the last `monthsBack` complete months
// — loads only, so it stands on its own (doesn't need a P&L like the
// break-even does). Same window as the basis (call 12).
export const getWindowRpm = (
  loads: Load[],
  now: Date,
  monthsBack: number = BASIS_MONTHS,
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

// ---- THE one basis ----
// The rate ladder + weekly/daily pace targets from the P&L, obligations and
// loads — ONE function, so every surface that prices a mile or grades a week
// (Dashboard hero and HEAT, Market, Score a Load, Lanes, Expenses, the
// recap, the player card, month coverage) stands on the same basis:
// break-even blended over the last BASIS_MONTHS complete months
// (getCostBasis), divided by the blended keep. Lived in hooks/useRateTargets
// until 2026-11-04; moved here so the metric modules can call it without
// reaching into React.
export const computeRateTargets = (
  loads: Load[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  schedule: SettlementSchedule | null,
  now: Date = localToday(),
) => {
  const basis = getCostBasis(periods, obligationsMonthly, loads, now, BASIS_MONTHS);
  // Your linehaul take (linehaul % + trailer %). 1 = own authority / unconfigured.
  const linehaulTake = schedule
    ? Number(schedule.linehaul_pct) + Number(schedule.trailer_pct)
    : 1;
  // Your KEEP — the share of an all-in booked dollar that reaches you. The
  // blended keep measured from the window's own loads (net ÷ gross: 65 + 8%
  // of linehaul, 100% of fuel surcharge, each accessorial at its rate) once
  // the window has gross; the schedule's linehaul take only until it does.
  // Jason judges a load all-in (2026-11-01), so the rate to book divides by
  // what he actually keeps of an all-in dollar — the construction Score a
  // Load has always used. Dividing all gross by the linehaul take took
  // Landstar's cut out of money he keeps in full, ~23¢ a driven mile.
  const blended = basis.payTake != null && basis.payTake > 0 ? basis.payTake : null;
  const keep = blended ?? linehaulTake;
  const keepSource: "blended" | "linehaul" = blended != null ? "blended" : "linehaul";
  const { start, end } = payWeekRange(now, PAY_WEEK_START_DOW);

  // ---- The whole rate & pace card is in GROSS (booking) dollars — that's the
  // number loads are booked at. Everything below grosses cost up by your keep. ----

  // Ladder: gross rate to book per mile DRIVEN (deadhead folded into total miles)
  // = cost-per-total-mile ÷ keep, scaled by tiers; marker = your gross rate/mile.
  // TWO ladders — standard is the app-wide baseline; specialized is what the
  // Scorer holds oversize/hazmat/heavy freight to.
  const tiers = tiersFrom(schedule);
  const specTiers = specTiersFrom(schedule);
  const marginGoal = marginGoalFrom(schedule);
  const bookingBase =
    basis.costPerTotalMile != null && keep > 0 ? basis.costPerTotalMile / keep : null;
  const bookingLadder = getRateLadder(bookingBase, tiers);
  const specLadder = getRateLadder(bookingBase, specTiers);

  // Weekly/daily GROSS revenue targets = monthly cost grossed up by your keep,
  // spread over the pay-week / working day, lifted to your MARGIN goal. The
  // margin goal is a total-revenue KPI, independent of the per-mile rate tiers.
  const bookingCost =
    basis.trueMonthlyCost != null && keep > 0 ? basis.trueMonthlyCost / keep : null;
  const gross = getGrossTargets(bookingCost, marginGoal, WORKING_DAYS_PER_MONTH);

  // This week's gross booked (committed) + gross delivered (earned).
  const weekBooked = getWeekGrossCommitted(loads, start, end);
  const weekEarned = getWeekGrossEarned(loads, start, end);

  const rollingRpm = getWindowRpm(loads, now); // net $/loaded mile over the basis window
  return {
    basis,
    gross, // weekly/daily GROSS revenue targets (break-even + margin goal)
    marginGoal, // target profit margin driving those revenue targets
    obligationsMonthly, // active, non-draw monthly notes (principal) — for cash margin
    weekBooked, // this week's gross committed (booked + in-transit + delivered)
    weekEarned, // this week's gross earned (delivered only)
    rollingRpm,
    linehaulTake,
    keep, // the share of an all-in dollar you keep — the ladder's divisor
    keepSource, // "blended" (measured from the window's loads) | "linehaul" (the schedule, until loads land)
    bookingLadder, // STANDARD gross rate to book per mile driven (walk/target/strong)
    specLadder, // SPECIALIZED ladder — oversize/hazmat/heavy
    grossRate: basis.grossPerTotalMile, // your gross rate/mile — the ladder marker
    weekStart: start,
    weekEnd: end,
    tiers, // standard markup tiers (Scorer default + downstream)
    specTiers, // specialized markup tiers (Scorer, for specialized loads)
    ready: basis.breakEvenRpm != null,
  };
};

export type RateTargets = ReturnType<typeof computeRateTargets>;
