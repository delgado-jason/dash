// Cash-flow planning math (Jason's spec, 2026-08-24). What's left here after
// the cash board took the weekly view (#502):
//  * the draft/pay-date calendar — nextDraftDate and expectedPayDate, which
//    the cash board and the loads math both read;
//  * the 6-MONTH FORECAST — QBO actuals (monthly_financials) rolled forward.
// Everything is pure, date-only, and UTC-anchored ("YYYY-MM-DD" keys). Money
// arrives as Postgres numeric strings — coerce here, once.
import { nextSettlementDate } from "./settlement";

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const DAY = 86_400_000;
export const keyOf = (d: Date): string => d.toISOString().slice(0, 10);
const dateOf = (k: string): Date => new Date(`${k}T00:00:00Z`);
const addDays = (k: string, n: number): string =>
  keyOf(new Date(dateOf(k).getTime() + n * DAY));

// The next calendar occurrence of a bill's day-of-month, ON or after `asOf`.
// A day the month doesn't have clamps to the month's last day (a day-31 bill
// drafts Sep 30) — the draft still happens, it can't skip a month.
export const nextDraftDate = (dayOfMonth: number, asOfKey: string): string => {
  const asOf = dateOf(asOfKey);
  for (let m = 0; m < 2; m++) {
    const y = asOf.getUTCFullYear();
    const mo = asOf.getUTCMonth() + m;
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, mo, Math.min(dayOfMonth, lastDay)));
    if (keyOf(d) >= asOfKey) return keyOf(d);
  }
  // Unreachable: the next month's occurrence is always >= asOf.
  return asOfKey;
};

// When a load's money lands: the first weekly settlement STRICTLY AFTER the
// delivery day. Jason's Landstar reality: delivered Tuesday pays Wednesday's
// settlement (99% of the time); delivered ON settlement day pays the next one
// (the paperwork can't clear same-day).
export const expectedPayDate = (
  deliveryKey: string,
  settlementDay: number,
): string => keyOf(nextSettlementDate(dateOf(addDays(deliveryKey, 1)), settlementDay));

// ---------------------------------------------------------------------------
// 6-month rolling forecast, from the QBO monthly archive.

export interface FinancialMonth {
  month: string; // "YYYY-MM-01"
  total_income: string | number;
  net_income: string | number;
  ending_cash: string | number;
  beginning_cash?: string | number | null; // for the archive's chain check
}

export interface CashAssumptions {
  weekly_revenue: string | number;
  weekly_payroll: string | number;
  weekly_fuel_advance?: string | number;
  weekly_settlement_deductions?: string | number;
  monthly_depreciation: string | number;
  fed_tax_rate: string | number;
  state_tax_rate: string | number;
  financing_floor: string | number;
  tax_catchup_owed: string | number;
}

export interface ForecastMonth {
  month: string; // "YYYY-MM-01"
  weeksOff: number;
  netIncome: number;
  opAdjustments: number; // depreciation add-back (non-cash)
  financing: number;
  incomeTax: number;
  cashFromOps: number;
  netChange: number;
  beginning: number;
  ending: number;
}

export interface Forecast {
  baseline: number; // a FULL running month's net income (weeklyNet × WEEKS_PER_MONTH)
  weeklyNet: number; // net income per RUNNING week over the baseline months
  runningWeeks: number; // the weeks those months actually ran (home weeks taken out)
  baselineMonths: string[]; // "YYYY-MM-01" of the months in the baseline
  months: ForecastMonth[];
}

export const WEEKS_PER_MONTH = 52 / 12;

// Where the QBO archive doesn't chain: a month whose beginning cash is not the
// previous month's ending cash. Each row passes its own ending = beginning +
// change check on paste; the chain between months was never checked, and the
// Nov 4 dump had two breaks (Sep opened $567.75 above Aug's ending).
export interface ArchiveBreak {
  month: string;
  prevMonth: string;
  beginning: number;
  prevEnding: number;
  diff: number;
}
export const archiveGaps = (actuals: FinancialMonth[]): ArchiveBreak[] => {
  const sorted = [...actuals].sort((a, b) => (a.month < b.month ? -1 : 1));
  const out: ArchiveBreak[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.beginning_cash == null || cur.beginning_cash === "") continue;
    if (nextMonthKey(prev.month.slice(0, 10)) !== cur.month.slice(0, 10)) continue; // a gap in months is a different problem
    const beginning = num(cur.beginning_cash);
    const prevEnding = num(prev.ending_cash);
    const diff = Math.round((beginning - prevEnding) * 100) / 100;
    if (Math.abs(diff) > 0.005) out.push({ month: cur.month.slice(0, 10), prevMonth: prev.month.slice(0, 10), beginning, prevEnding, diff });
  }
  return out;
};

const nextMonthKey = (monthKey: string): string => {
  const d = dateOf(monthKey);
  return keyOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
};

// A closed month's REAL pretax margin — depreciation is in the P&L now, so
// net_income ÷ total_income is the true number. Null when there's no income.
export const pretaxMargin = (m: FinancialMonth): number | null => {
  const inc = num(m.total_income);
  return inc > 0 ? num(m.net_income) / inc : null;
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The margin the driver card's lever grades (Jason, 2026-08-25): pretax
// margin over the last (up to) `monthsBack` CLOSED months of the QBO archive
// — accountant-grade books, not the app's load math. Pooled Σni ÷ Σincome
// (not an average of ratios) so big and small months weigh honestly. The
// label carries the actual months so the basis is never ambiguous — the
// archive lags the calendar by a month by nature.
export const qboPretaxMargin = (
  actuals: FinancialMonth[],
  now: Date,
  monthsBack = 3,
): { margin: number; label: string } | null => {
  // CLOSED months only — a mid-month paste of a partial month must not grade
  // the lever while the tile claims closed books.
  const curMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const closed = actuals.filter((m) => m.month.slice(0, 10) < curMonth);
  if (closed.length === 0) return null;
  const recent = [...closed]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .slice(-monthsBack);
  const income = recent.reduce((s, m) => s + num(m.total_income), 0);
  if (income <= 0) return null;
  const ni = recent.reduce((s, m) => s + num(m.net_income), 0);

  const name = (k: string) => `${MONTH_ABBR[Number(k.slice(5, 7)) - 1]}`;
  const withYr = (k: string) => `${name(k)} ’${k.slice(2, 4)}`;
  const first = recent[0].month;
  const last = recent[recent.length - 1].month;
  // The label must not claim months the pool doesn't hold: a CONTIGUOUS run
  // reads as a range ("May–Jul ’26", years on both ends when they differ);
  // a gapped archive lists the actual months ("Mar, Apr, Jul ’26").
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7));
  const contiguous = recent.every(
    (m, i) => i === 0 || idx(m.month) === idx(recent[i - 1].month) + 1,
  );
  let label: string;
  if (recent.length === 1) label = withYr(first);
  else if (!contiguous)
    label = `${recent.slice(0, -1).map((m) => name(m.month)).join(", ")}, ${withYr(last)}`;
  else if (first.slice(0, 4) !== last.slice(0, 4))
    label = `${withYr(first)}–${withYr(last)}`;
  else label = `${name(first)}–${withYr(last)}`;
  return { margin: ni / income, label };
};

// The forecast (reworked 2026-11-04, the audit's call 10): the baseline is
// net income per RUNNING week — Σ net income over the last six CLOSED months ÷
// the weeks they actually ran, with each month's planned home weeks taken out —
// so a month that already held home time doesn't drag the pace down and then
// get charged for home time again. A forecast month earns weeklyNet × its own
// running weeks. Depreciation adds back (non-cash, inside net income); the
// financing floor takes principal; taxes take (fed + state) × net income and
// never credit a refund on a loss month (the Plan's tax move is max(0, …) too).
// Ending chains from the last actual. The current calendar month is never an
// actual (a mid-month paste would anchor the chain on a partial month).
export const buildForecast = (
  actuals: FinancialMonth[],
  assumptions: CashAssumptions,
  weeksOffByMonth: Map<string, number>,
  count = 6,
  now?: Date,
): Forecast | null => {
  if (actuals.length === 0) return null;
  const sorted = [...actuals].sort((a, b) => (a.month < b.month ? -1 : 1));
  const curMonth = now ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01` : null;
  const closed = curMonth ? sorted.filter((m) => m.month.slice(0, 10) < curMonth) : sorted;
  if (closed.length === 0) return null;
  const last6 = closed.slice(-6);
  let netSum = 0;
  let runningWeeks = 0;
  for (const m of last6) {
    const off = weeksOffByMonth.get(m.month.slice(0, 10)) ?? 0;
    netSum += num(m.net_income);
    runningWeeks += Math.max(0.5, WEEKS_PER_MONTH - off); // a month fully home still ran a little
  }
  const weeklyNet = netSum / runningWeeks;
  const baseline = weeklyNet * WEEKS_PER_MONTH;

  const depreciation = num(assumptions.monthly_depreciation);
  const financing = num(assumptions.financing_floor);
  const taxRate = num(assumptions.fed_tax_rate) + num(assumptions.state_tax_rate);

  const months: ForecastMonth[] = [];
  let beginning = num(closed[closed.length - 1].ending_cash);
  let month = nextMonthKey(closed[closed.length - 1].month.slice(0, 10));
  for (let i = 0; i < count; i++) {
    const weeksOff = weeksOffByMonth.get(month) ?? 0;
    const netIncome = weeklyNet * Math.max(0, WEEKS_PER_MONTH - weeksOff);
    const incomeTax = -(Math.max(0, netIncome) * taxRate);
    const cashFromOps = netIncome + depreciation;
    const netChange = cashFromOps + financing + incomeTax;
    const ending = beginning + netChange;
    months.push({ month, weeksOff, netIncome, opAdjustments: depreciation, financing, incomeTax, cashFromOps, netChange, beginning, ending });
    beginning = ending;
    month = nextMonthKey(month);
  }
  return { baseline, weeklyNet, runningWeeks, baselineMonths: last6.map((m) => m.month.slice(0, 10)), months };
};
