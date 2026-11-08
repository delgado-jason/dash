// The P&L's own arithmetic, in one place (Cockpit PR 1): the Money tab and the
// Pulse "Profit · year to date" card both read it, so the year's income, profit,
// true net and margins can never be derived two ways.
//
// Two margins per month: OPERATING (income − COGS − expenses; interest lives in
// those expense lines) and CASH / after-notes (operating minus the monthly note
// principal — the money that actually leaves the account). No interest double
// count: the notes carry principal only, interest is already in the P&L.
import type { ExpensePeriod } from "@/types/expense";

export interface ProfitRow {
  month: string; // the period's month, as stored ("2026-10-01")
  income: number;
  cost: number;
  profit: number;
  margin: number; // operating margin; 0 when the month has no income
  cashMargin: number; // after notes; 0 when the month has no income
  notes: number; // the monthly note principal charged against this month
}

export interface YtdSummary {
  months: number; // P&L months filed in the year
  income: number;
  profit: number; // operating
  margin: number | null; // operating margin; null with no income
  trueNet: number; // profit − notes × months
  cashMargin: number | null; // trueNet ÷ income; null with no income
}

export interface LastFiledMonth {
  month: string;
  profit: number;
  income: number;
}

// Only periods that carry an income total are filed months; sorted oldest first.
export const profitRows = (periods: ExpensePeriod[], obligationsMonthly: number): ProfitRow[] =>
  [...periods]
    .filter((p) => p.income_total != null)
    .sort((a, b) => (a.period_month < b.period_month ? -1 : 1))
    .map((p) => {
      const income = p.income_total ?? 0;
      const cost = (p.cogs_total ?? 0) + (p.expense_total ?? 0);
      const profit = income - cost;
      return {
        month: p.period_month,
        income,
        cost,
        profit,
        margin: income > 0 ? profit / income : 0,
        cashMargin: income > 0 ? (profit - obligationsMonthly) / income : 0,
        notes: obligationsMonthly,
      };
    });

// The rows that fall in a calendar year (month keys are compared as strings).
export const ytdRows = (rows: ProfitRow[], year: number): ProfitRow[] =>
  rows.filter((r) => r.month.startsWith(String(year)));

export const ytdSummary = (rows: ProfitRow[], year: number): YtdSummary => {
  const ytd = ytdRows(rows, year);
  const income = ytd.reduce((s, r) => s + r.income, 0);
  const profit = ytd.reduce((s, r) => s + r.profit, 0);
  // After notes: the monthly note once per P&L month in the window. Every row
  // carries the same note, so this is notes × months exactly (no float drift
  // from summing twelve copies).
  const trueNet = profit - (ytd.length > 0 ? ytd[0].notes * ytd.length : 0);
  return {
    months: ytd.length,
    income,
    profit,
    margin: income > 0 ? profit / income : null,
    trueNet,
    cashMargin: income > 0 ? trueNet / income : null,
  };
};

// The latest filed month, named — null when nothing is filed.
export const lastFiledMonth = (rows: ProfitRow[]): LastFiledMonth | null => {
  if (rows.length === 0) return null;
  const last = rows.reduce((a, b) => (b.month > a.month ? b : a));
  return { month: last.month, profit: last.profit, income: last.income };
};

// Whether the month holding `dayKey` has a filed period (income total saved).
export const monthIsFiled = (rows: ProfitRow[], dayKey: string): boolean =>
  rows.some((r) => r.month.slice(0, 7) === dayKey.slice(0, 7));
