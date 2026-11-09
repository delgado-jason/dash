// The Money tab's months table (the Redesign, phase C, the Money tab sheet,
// calls 1 and 2): every filed month of the year with income, operating profit,
// the after-notes figure and the after-notes margin graded against the goal; a
// subtotal row per COMPLETED calendar quarter; the year's total row.
//
// Rules: a quarter gets a subtotal only once it has closed (its last month is
// behind the current month) and only over the months actually filed — a closed
// quarter with one filed month subtotals that month alone and says "1 of 3
// months", never a guess for the missing two. The quarter in progress has no
// subtotal. A margin is null, never 0, when a row has no income. Nothing here is
// new arithmetic: every figure is a sum of profitRows.
import type { ProfitRow } from "./profitSummary";

export type MonthsRowKind = "month" | "quarter" | "total";

export interface MonthsRow {
  kind: MonthsRowKind;
  key: string; // the month key, "Qn", or "total"
  label: string; // "January" · "Q1 · Jan–Mar" · "2026 · 10 filed months"
  income: number;
  profit: number; // operating
  trueNet: number; // after notes
  cashMargin: number | null; // trueNet ÷ income; null with no income
  atGoal: boolean | null; // null without a goal or a margin
  months: number; // filed months inside the row (1 for a month)
  monthsWanted: number; // 1 · 3 · the months of the year that have begun
  atGoalCount?: number; // total row only: filed months at or above the goal
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthIndex = (key: string): number => Number(key.slice(5, 7)) - 1;
const yearOf = (key: string): number => Number(key.slice(0, 4));

const marginOf = (income: number, trueNet: number): number | null =>
  income > 0 ? trueNet / income : null;

const graded = (m: number | null, goal: number | null): boolean | null =>
  m == null || goal == null ? null : m >= goal;

const sumRow = (
  kind: MonthsRowKind,
  key: string,
  label: string,
  rows: ProfitRow[],
  monthsWanted: number,
  goal: number | null,
): MonthsRow => {
  const income = rows.reduce((s, r) => s + r.income, 0);
  const profit = rows.reduce((s, r) => s + r.profit, 0);
  const trueNet = rows.reduce((s, r) => s + (r.profit - r.notes), 0);
  const cashMargin = marginOf(income, trueNet);
  return { kind, key, label, income, profit, trueNet, cashMargin, atGoal: graded(cashMargin, goal), months: rows.length, monthsWanted };
};

export const monthsTable = (
  rows: ProfitRow[],
  year: number,
  goal: number | null,
  now: Date,
): MonthsRow[] => {
  const filed = rows
    .filter((r) => yearOf(r.month) === year)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  if (filed.length === 0) return [];

  // The first day of the current month, UTC — a quarter is closed when its last
  // month ends before this.
  const nowMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const out: MonthsRow[] = [];

  for (let q = 0; q < 4; q++) {
    const inQuarter = filed.filter((r) => Math.floor(monthIndex(r.month) / 3) === q);
    for (const r of inQuarter) {
      const m = monthIndex(r.month);
      const trueNet = r.profit - r.notes;
      const cashMargin = marginOf(r.income, trueNet);
      out.push({
        kind: "month",
        key: r.month,
        label: MONTHS_LONG[m],
        income: r.income,
        profit: r.profit,
        trueNet,
        cashMargin,
        atGoal: graded(cashMargin, goal),
        months: 1,
        monthsWanted: 1,
      });
    }
    const closed = Date.UTC(year, q * 3 + 3, 1) <= nowMonthStart;
    if (closed && inQuarter.length > 0) {
      out.push(
        sumRow("quarter", `Q${q + 1}`, `Q${q + 1} · ${MONTHS_SHORT[q * 3]}–${MONTHS_SHORT[q * 3 + 2]}`, inQuarter, 3, goal),
      );
    }
  }

  // The months of the year that have begun — how many the total COULD hold.
  const begun =
    now.getUTCFullYear() > year ? 12 : now.getUTCFullYear() < year ? 0 : now.getUTCMonth() + 1;
  const total = sumRow(
    "total",
    "total",
    `${year} · ${filed.length} filed month${filed.length === 1 ? "" : "s"}`,
    filed,
    begun,
    goal,
  );
  total.atGoalCount =
    goal == null ? undefined : filed.filter((r) => marginOf(r.income, r.profit - r.notes) != null && (marginOf(r.income, r.profit - r.notes) as number) >= goal).length;
  out.push(total);
  return out;
};
