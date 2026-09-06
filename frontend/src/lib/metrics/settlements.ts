// Settlement-feed math (design locked with Jason 2026-09-06):
//  * deduction buckets: two averages over the last <=12 settlements,
//    ADVANCES EXCLUDED (fuel is its own measured line; money routed back to
//    the bank isn't a cost). First-settlement-of-month runs heavy —
//    insurance is due that week — so a flat average lies twice a month.
//  * fuel: rolling 30 DAYS from the fuel log — the cash job wants
//    responsiveness; the 90-day window stays on cost-per-mile (the rate job).
//  * per-load rollup: a load's settlement truth is CUMULATIVE — original
//    payment plus every later adjustment, verified against dash's expected
//    net; a named late fee reads informational, an unexplained revenue
//    shortfall reads hot.
// Pure functions; null = no data, never 0.

import type {
  SettlementSummary,
  SettlementLine,
} from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// The insurance-heavy settlement: the first one Landstar cuts each month.
// Day-of-month <= 7 is that first weekly statement by construction.
export const isFirstOfMonth = (periodEnding: string): boolean =>
  Number(periodEnding.slice(8, 10)) <= 7;

export interface DeductionBuckets {
  firstOfMonth: number | null;
  standard: number | null;
  samples: number;
}

export const deductionBuckets = (
  settlements: SettlementSummary[],
  n = 12,
): DeductionBuckets => {
  const recent = [...settlements]
    .sort((a, b) => (a.period_ending < b.period_ending ? 1 : -1))
    .slice(0, n);
  const first: number[] = [];
  const standard: number[] = [];
  for (const s of recent) {
    const exAdvance = Math.max(0, num(s.deductions) - num(s.advances));
    (isFirstOfMonth(s.period_ending) ? first : standard).push(exAdvance);
  }
  const avg = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return { firstOfMonth: avg(first), standard: avg(standard), samples: recent.length };
};

// Rolling-30-day weekly fuel cost from the fuel log. Null with no entries
// in the window — the caller falls back to the hand-set assumption.
export const weeklyFuelCost30 = (
  entries: FuelEntry[],
  endKey: string, // the operator's LOCAL day key — dates are the #1 bug source
): number | null => {
  const end = endKey;
  const start = new Date(new Date(`${endKey}T00:00:00Z`).getTime() - 29 * 86400_000)
    .toISOString()
    .slice(0, 10);
  let total = 0;
  let seen = 0;
  for (const e of entries) {
    const d = (e.fuel_date ?? "").slice(0, 10);
    if (d >= start && d <= end) {
      total += num(e.gallons) * num(e.price_per_gallon);
      seen++;
    }
  }
  if (seen === 0) return null;
  return (total / 30) * 7;
};

// The settlement date inside a projected week (weeks run startKey..+6).
export const settlementDateInWeek = (
  startKey: string,
  settlementDay: number,
): string => {
  const d = new Date(`${startKey}T00:00:00Z`);
  const offset = (settlementDay - d.getUTCDay() + 7) % 7;
  const s = new Date(d.getTime() + offset * 86400_000);
  return s.toISOString().slice(0, 10);
};

// Both projected weeks' settlement dates for the two-week board.
export const settlementDatesForBoard = (
  asOfKey: string,
  settlementDay: number,
): [string, string] => {
  const week2Start = new Date(
    new Date(`${asOfKey}T00:00:00Z`).getTime() + 7 * 86400_000,
  )
    .toISOString()
    .slice(0, 10);
  return [
    settlementDateInWeek(asOfKey, settlementDay),
    settlementDateInWeek(week2Start, settlementDay),
  ];
};

// A deposit's statement period_ending: deposits lag period endings by a
// fixed weekday offset (learned from any real settlement). Buckets are
// keyed by PERIOD_ENDING — classifying by deposit date lands the heavy
// insurance week on the wrong projected week at month boundaries.
export const depositToPeriodEnding = (
  depositKey: string,
  samplePeriodEnding: string,
): string => {
  const peDow = new Date(`${samplePeriodEnding}T00:00:00Z`).getUTCDay();
  const dep = new Date(`${depositKey}T00:00:00Z`);
  const lag = (((dep.getUTCDay() - peDow) % 7) + 7) % 7 || 7;
  return new Date(dep.getTime() - lag * 86400_000).toISOString().slice(0, 10);
};

// ---- per-load cumulative rollup ----

export interface LoadSettlementRollup {
  status: "none" | "verified" | "adjusted" | "unexplained";
  grossSettled: number; // Σ revenue across ALL lines (reversals included)
  advancesAndFees: number; // deductions on non-adjustment trip lines
  netToDate: number;
  delta: number; // grossSettled - expectedNet
  settledPeriods: string[];
  adjustments: {
    period_ending: string;
    description: string;
    line_class: string;
    amount: number; // signed effect on the load
  }[];
}

// The printed Net column is the WHOLE LOAD's net on one row — summing it
// alongside its own component lines double-counts. Columns are the truth
// (they reconcile per line against the statement totals); the printed net
// is only a fallback for a line with no columns at all.
const lineValue = (l: SettlementLine): number => {
  const hasCols = l.revenue != null || l.refunds != null || l.deductions != null;
  return hasCols
    ? num(l.revenue) + num(l.refunds) - num(l.deductions)
    : num(l.net);
};

export const loadSettlementRollup = (
  lines: SettlementLine[],
  expectedNet: number | null,
): LoadSettlementRollup | null => {
  if (lines.length === 0) return null;
  let grossSettled = 0;
  let advancesAndFees = 0;
  let netToDate = 0;
  const settledPeriods = new Set<string>();
  const adjustments: LoadSettlementRollup["adjustments"] = [];
  for (const l of lines) {
    grossSettled += num(l.revenue);
    netToDate += lineValue(l);
    settledPeriods.add(l.period_ending);
    if (l.is_adjustment) {
      adjustments.push({
        period_ending: l.period_ending,
        description: l.description,
        line_class: l.line_class,
        amount: lineValue(l),
      });
    } else if (l.deductions != null) {
      advancesAndFees += num(l.deductions);
    }
  }
  const delta = expectedNet == null ? 0 : grossSettled - expectedNet;
  const status: LoadSettlementRollup["status"] =
    expectedNet == null
      ? "none" // no expectation -> no verification claim, ever
      : Math.abs(delta) > 0.01
        ? "unexplained"
        : adjustments.length > 0
          ? "adjusted"
          : "verified";
  return {
    status,
    grossSettled,
    advancesAndFees,
    netToDate,
    delta,
    settledPeriods: [...settledPeriods].sort(),
    adjustments,
  };
};
