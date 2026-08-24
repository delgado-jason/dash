// Cash-flow planning math (Jason's spec, 2026-08-24). Two layers:
//  * the 2-WEEK LIQUIDITY view — real drafts on real days vs real settlements;
//  * the 6-MONTH FORECAST — QBO actuals (monthly_financials) rolled forward.
// Everything is pure, date-only, and UTC-anchored ("YYYY-MM-DD" keys). Money
// arrives as Postgres numeric strings — coerce here, once.
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import { loadRevenue } from "./rateTargets";
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

export interface LiquidityBill {
  label: string;
  category: "loan_lease" | "insurance" | "other";
  amount: number; // the FULL bank draft
  draftKey: string; // "YYYY-MM-DD"
}

export interface LiquidityWeek {
  startKey: string;
  endKey: string; // inclusive
  beginning: number;
  settlements: number;
  settlementSource: "loads" | "fallback" | "override";
  settlementLoads: number; // how many loads back the number (0 on fallback/override)
  payroll: number;
  loanLease: number;
  insurance: number;
  other: number;
  bills: LiquidityBill[]; // this week's drafts, for the day strip
  ending: number;
}

export interface TwoWeekLiquidity {
  weeks: [LiquidityWeek, LiquidityWeek];
  lowestEnding: number;
}

export interface LiquidityInput {
  asOfKey: string; // week 1 starts here
  beginning: number; // week 1 opening cash (latest snapshot ops, or override)
  obligations: Obligation[]; // full list — filtered to active + day_of_month here
  weeklyPayroll: number;
  loads: Load[]; // for real settlement projection
  settlementDay: number | null; // 0–6, null → fallback-only
  weeklyRevenueFallback: number;
  overrides?: [number | null, number | null]; // manual per-week settlements
}

// Week's projected settlements: every not-yet-paid, not-cancelled load whose
// expected pay date lands inside the week, at its NET revenue. Zero such loads
// → the planning fallback (weekly_revenue). A manual override beats both.
const weekSettlements = (
  loads: Load[],
  startKey: string,
  endKey: string,
  settlementDay: number | null,
): { total: number; count: number } => {
  if (settlementDay == null) return { total: 0, count: 0 };
  let total = 0;
  let count = 0;
  for (const l of loads) {
    if (l.load_status === "cancelled" || l.payment_status === "paid") continue;
    const delivery = (l.delivery_date ?? l.pickup_date)?.slice(0, 10);
    if (!delivery) continue;
    const pay = expectedPayDate(delivery, settlementDay);
    if (pay >= startKey && pay <= endKey) {
      total += loadRevenue(l);
      count++;
    }
  }
  return { total, count };
};

export const twoWeekLiquidity = (input: LiquidityInput): TwoWeekLiquidity => {
  const {
    asOfKey, beginning, obligations, weeklyPayroll, loads,
    settlementDay, weeklyRevenueFallback, overrides = [null, null],
  } = input;

  const calendarBills = obligations.filter(
    (o) => o.active && o.day_of_month != null,
  );

  let carry = beginning;
  const weeks = [0, 1].map((w) => {
    const startKey = addDays(asOfKey, w * 7);
    const endKey = addDays(startKey, 6);

    const bills: LiquidityBill[] = calendarBills
      .map((o) => ({
        label: o.label,
        category: o.category,
        amount: num(o.draft_amount ?? o.amount),
        draftKey: nextDraftDate(o.day_of_month!, asOfKey),
      }))
      .filter((b) => b.draftKey >= startKey && b.draftKey <= endKey)
      .sort((a, b) => (a.draftKey < b.draftKey ? -1 : 1));

    const byCat = (c: LiquidityBill["category"]) =>
      bills.filter((b) => b.category === c).reduce((s, b) => s + b.amount, 0);

    const projected = weekSettlements(loads, startKey, endKey, settlementDay);
    const override = overrides[w];
    const settlements =
      override != null ? override : projected.count > 0 ? projected.total : weeklyRevenueFallback;
    const settlementSource: LiquidityWeek["settlementSource"] =
      override != null ? "override" : projected.count > 0 ? "loads" : "fallback";

    const loanLease = byCat("loan_lease");
    const insurance = byCat("insurance");
    const other = byCat("other");
    const ending =
      carry + settlements - weeklyPayroll - loanLease - insurance - other;
    const week: LiquidityWeek = {
      startKey, endKey,
      beginning: carry,
      settlements, settlementSource,
      settlementLoads: settlementSource === "loads" ? projected.count : 0,
      payroll: weeklyPayroll,
      loanLease, insurance, other, bills, ending,
    };
    carry = ending;
    return week;
  }) as [LiquidityWeek, LiquidityWeek];

  return { weeks, lowestEnding: Math.min(weeks[0].ending, weeks[1].ending) };
};

// ---------------------------------------------------------------------------
// 6-month rolling forecast, from the QBO monthly archive.

export interface FinancialMonth {
  month: string; // "YYYY-MM-01"
  total_income: string | number;
  net_income: string | number;
  ending_cash: string | number;
}

export interface CashAssumptions {
  weekly_revenue: string | number;
  weekly_payroll: string | number;
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
  baseline: number; // avg net income of the last (up to) 6 actuals
  months: ForecastMonth[];
}

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

// Forecast per the spec: baseline = AVG(net income, last 6 actuals);
// weeks off (planned home time) shave weekly revenue off a month's net;
// depreciation adds back (non-cash — it's inside net income, so the pair nets
// to zero cash, never double-counted); the financing floor takes principal;
// taxes take (fed + state) × net income. Ending chains from the last actual.
export const buildForecast = (
  actuals: FinancialMonth[],
  assumptions: CashAssumptions,
  weeksOffByMonth: Map<string, number>,
  count = 6,
): Forecast | null => {
  if (actuals.length === 0) return null;
  const sorted = [...actuals].sort((a, b) => (a.month < b.month ? -1 : 1));
  const last6 = sorted.slice(-6);
  const baseline =
    last6.reduce((s, m) => s + num(m.net_income), 0) / last6.length;

  const weeklyRevenue = num(assumptions.weekly_revenue);
  const depreciation = num(assumptions.monthly_depreciation);
  const financing = num(assumptions.financing_floor);
  const taxRate = num(assumptions.fed_tax_rate) + num(assumptions.state_tax_rate);

  const months: ForecastMonth[] = [];
  let beginning = num(sorted[sorted.length - 1].ending_cash);
  let month = nextMonthKey(sorted[sorted.length - 1].month);
  for (let i = 0; i < count; i++) {
    const weeksOff = weeksOffByMonth.get(month) ?? 0;
    const netIncome = baseline - weeksOff * weeklyRevenue;
    const incomeTax = -(netIncome * taxRate);
    const cashFromOps = netIncome + depreciation;
    const netChange = cashFromOps + financing + incomeTax;
    const ending = beginning + netChange;
    months.push({
      month, weeksOff, netIncome,
      opAdjustments: depreciation,
      financing, incomeTax, cashFromOps, netChange, beginning, ending,
    });
    beginning = ending;
    month = nextMonthKey(month);
  }
  return { baseline, months };
};
