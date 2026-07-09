import type { ExpensePeriod } from "@/types/expense";

// Derived numbers for the Expenses page. Cost comes from the stored month's
// lines; miles + income come from loads (passed in) so this stays pure.
export interface ExpenseMetrics {
  monthlyCost: number;
  weeklyCost: number;
  fixedTotal: number;
  variableTotal: number;
  fixedPct: number | null; // fixed / cost
  cpm: number | null; // cost per mile driven (total miles)
  breakEvenRpm: number | null; // cost per LOADED mile — the rate you must beat
  netMargin: number | null; // (income − cost) / income
}

const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.333

export const getExpenseMetrics = (
  period: ExpensePeriod,
  totalMiles: number,
  loadedMiles: number,
): ExpenseMetrics => {
  const lines = period.lines ?? [];
  const fixedTotal = lines
    .filter((l) => l.type === "fixed")
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const variableTotal = lines
    .filter((l) => l.type === "variable")
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const monthlyCost = fixedTotal + variableTotal;
  const income = period.income_total ?? 0;

  return {
    monthlyCost,
    weeklyCost: monthlyCost / WEEKS_PER_MONTH,
    fixedTotal,
    variableTotal,
    fixedPct: monthlyCost > 0 ? fixedTotal / monthlyCost : null,
    // break-even is cost ÷ LOADED miles (you earn on loaded miles but pay for
    // all of them); cpm is cost ÷ every mile driven.
    cpm: totalMiles > 0 ? monthlyCost / totalMiles : null,
    breakEvenRpm: loadedMiles > 0 ? monthlyCost / loadedMiles : null,
    netMargin: income > 0 ? (income - monthlyCost) / income : null,
  };
};

// Each expense as a share of the month's income (P&L income basis).
export const pctOfRevenue = (
  amount: number,
  income: number | null,
): number | null => (income && income > 0 ? amount / income : null);

// Cash view: operating cost (from the P&L) PLUS recurring obligations the P&L
// doesn't show (loan principal, owner draws). This is what he must actually
// gross to cover, so break-even here uses true cash-out over loaded miles.
export interface CashMetrics {
  obligationsTotal: number;
  trueMonthlyCost: number; // operating cost + obligations
  trueCpm: number | null; // trueMonthlyCost / total miles
  trueBreakEvenRpm: number | null; // trueMonthlyCost / loaded miles
}

export const getCashMetrics = (
  operatingMonthlyCost: number,
  obligationsTotal: number,
  totalMiles: number,
  loadedMiles: number,
): CashMetrics => {
  const trueMonthlyCost = operatingMonthlyCost + obligationsTotal;
  return {
    obligationsTotal,
    trueMonthlyCost,
    trueCpm: totalMiles > 0 ? trueMonthlyCost / totalMiles : null,
    trueBreakEvenRpm: loadedMiles > 0 ? trueMonthlyCost / loadedMiles : null,
  };
};
