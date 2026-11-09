// THE MILES YOU RAN, AND THE FLOOR THEY FORCED.
//
// Jason, 2026-11-09: "we need a graph to track monthly miles because if my
// miles are low, it drives my rate up." It does, and this is the arithmetic:
// the ladder books at `(true cost ÷ driven miles) ÷ keep`, so the miles are
// literally the denominator of the floor. A thin month does not cost less —
// the notes, the insurance and the permits do not care how far the truck went,
// so the same dollars land on fewer miles and every one of them has to carry
// more. In 2026 that swung his floor from $2.68 a mile (February, 6,564 mi) to
// $8.21 (January, 2,077 mi), and four of the ten filed months needed more than
// the blended rate he books to. The blend hides it; this shows it per month.
//
// Two rules make the series honest:
//   • the BARS come off the odometer (monthMiles unions the load and trip
//     spans, so an overlapping repositioning trip is never counted twice) and
//     exist for every month, filed or not;
//   • the FLOOR needs a filed P&L, and is null without one. The gap in the
//     line is the signal — that is a month you have not filed, not a month
//     that cost nothing.
// The month's cost rule is getCostBasis's, to the character, so the chart and
// the rate ladder can never disagree about what a month cost.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import { monthMiles } from "./rateTargets";
import { isDelivered } from "./status";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MileMonth {
  year: number;
  month: number; // 0–11, UTC
  label: string; // "Sep"
  longLabel: string; // "Sep ’26"
  driven: number; // odometer windows over loads AND trips, de-overlapped
  loaded: number; // loaded miles of the month's delivered loads
  empty: number; // driven − loaded, floored at 0
  emptyShare: number | null; // 0..1 of driven; null when the month drove nothing
  // `driven` is 0 in two very different cases, and the chart must not print
  // them the same way: a month nobody logged a load in (a real zero), and a
  // month of real freight whose loads carry no usable odometer readings (an
  // unknown). `measured` is false for both; `hasActivity` separates them, so
  // the second reads "—" instead of claiming the truck sat still.
  measured: boolean; // at least one odometer span was readable
  hasActivity: boolean; // a delivered load or a logged trip fell in the month
  filed: boolean; // the month has a P&L carrying BOTH totals
  cost: number | null; // its true cost (P&L operating + the notes), null unfiled
  breakEven: number | null; // (cost ÷ driven) ÷ keep — the rate those miles forced
  inProgress: boolean; // the current month: its miles are partial by definition
}

// The last `months` calendar months INCLUDING the one in progress — unlike the
// cost basis, which excludes it on purpose (its miles lag its cost and would
// flatter the blend). Here the running month is shown and MARKED, because
// "am I running enough this month" is half the question the chart answers.
const monthsEnding = (now: Date, months: number): { year: number; month: number }[] => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: { year: number; month: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }
  return out;
};

export const milesHistory = (
  loads: Load[],
  trips: Trip[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  keep: number | null,
  now: Date,
  months = 12,
): MileMonth[] => {
  const byKey = new Map<string, ExpensePeriod>();
  for (const p of periods) {
    const d = new Date(p.period_month);
    byKey.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, p);
  }
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();

  const inMonth = (raw: string | null | undefined, year: number, month: number): boolean => {
    if (!raw) return false;
    const d = new Date(raw);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  };

  return monthsEnding(now, months).map(({ year, month }) => {
    const m = monthMiles(loads, year, month, trips);
    const p = byKey.get(`${year}-${month}`);
    const hasActivity =
      loads.some((l) => isDelivered(l) && inMonth(l.delivery_date, year, month)) ||
      trips.some((t) => inMonth(t.trip_date, year, month));
    // The cost-basis rule, unchanged: a month with no P&L — or one saved
    // without BOTH totals, which a broken upload leaves behind — is unfiled.
    // Counting a missing section at $0 would draw a free month.
    const filed = !!p && p.cogs_total != null && p.expense_total != null;
    const cost = filed
      ? (p!.cogs_total ?? 0) + (p!.expense_total ?? 0) + obligationsMonthly
      : null;
    // Floored at 0: a load whose logged loaded_miles exceed its odometer span
    // would otherwise draw a negative empty segment.
    const empty = Math.max(0, m.total - m.loaded);

    return {
      year,
      month,
      label: MONTH_ABBR[month],
      longLabel: `${MONTH_ABBR[month]} ’${String(year).slice(2)}`,
      driven: m.total,
      loaded: m.loaded,
      empty,
      emptyShare: m.total > 0 ? empty / m.total : null,
      measured: m.total > 0,
      hasActivity,
      filed,
      cost,
      breakEven:
        cost != null && m.total > 0 && keep != null && keep > 0
          ? cost / m.total / keep
          : null,
      inProgress: year === thisYear && month === thisMonth,
    };
  });
};

// The tallest bar, for scaling. 0 when nothing was driven at all — the caller
// guards rather than dividing by it.
export const peakDriven = (rows: MileMonth[]): number =>
  rows.reduce((hi, r) => Math.max(hi, r.driven), 0);
