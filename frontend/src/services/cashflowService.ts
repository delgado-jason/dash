import api from "./api";

// Postgres numeric → strings; the metrics lib coerces. Keep the wire shapes
// string-typed so nobody does math on them by accident before coercion.
export interface CashAssumptionsRow {
  weekly_revenue: string;
  weekly_payroll: string;
  monthly_depreciation: string;
  fed_tax_rate: string;
  state_tax_rate: string;
  financing_floor: string;
  tax_catchup_owed: string;
  weekly_fuel_advance: string;
  weekly_settlement_deductions: string;
}

export interface MonthlyFinancialRow {
  month: string; // "YYYY-MM-01"
  total_income: string;
  total_cogs: string;
  total_opex: string;
  interest_expense: string;
  net_income: string;
  beginning_cash: string;
  operating_adjustments: string;
  investing: string;
  financing: string;
  ending_cash: string;
  accounts_receivable: string;
  total_liabilities: string;
  total_equity: string;
  depreciation: string;
  updated_at?: string; // ISO — when this row was imported/last re-pasted
}

export interface ForecastAdjustmentRow {
  month: string;
  weeks_off: string;
}

export const getCashAssumptions = async (): Promise<CashAssumptionsRow | null> => {
  const res = await api.get("/cashflow/assumptions");
  return res.data.assumptions ?? null;
};

export const patchCashAssumptions = async (
  data: Partial<Record<keyof CashAssumptionsRow, number>>,
): Promise<CashAssumptionsRow> => {
  const res = await api.patch("/cashflow/assumptions", data);
  return res.data.assumptions;
};

// Defensive: month must be a bare "YYYY-MM-01" — a raw pg Date would arrive
// as an ISO timestamp and crash the month math downstream.
const cleanMonth = <T extends { month: string }>(r: T): T => ({
  ...r,
  month: String(r.month).slice(0, 10),
});

export const getMonthlyFinancials = async (): Promise<MonthlyFinancialRow[]> => {
  const res = await api.get("/cashflow/financials");
  return (res.data.financials ?? []).map(cleanMonth);
};

// The paste importer's commit — all rows in one transactional upsert.
export const upsertMonthlyFinancials = async (
  rows: Omit<MonthlyFinancialRow, never>[],
): Promise<MonthlyFinancialRow[]> => {
  const res = await api.post("/cashflow/financials", { rows });
  return res.data.financials;
};

export const getForecastAdjustments = async (): Promise<ForecastAdjustmentRow[]> => {
  const res = await api.get("/cashflow/adjustments");
  return (res.data.adjustments ?? []).map(cleanMonth);
};

export const setForecastAdjustment = async (
  month: string,
  weeks_off: number,
): Promise<ForecastAdjustmentRow> => {
  const res = await api.put("/cashflow/adjustments", { month, weeks_off });
  return res.data.adjustment;
};

// ---- the deposit you typed, before the statement landed (migration 105) ----
// These lived in one browser's localStorage until v1.268.0. They are the
// account's now, so the phone, the laptop and Brandie all see one figure.
export interface DepositOverrideRow {
  statement_date: string; // YYYY-MM-DD, the Wednesday the period settles
  amount: number;
}

const cleanOverride = (r: { statement_date: string; amount: string | number }): DepositOverrideRow => ({
  statement_date: String(r.statement_date).slice(0, 10),
  amount: Number(r.amount), // numeric comes back a string
});

export const getDepositOverrides = async (): Promise<DepositOverrideRow[]> => {
  const res = await api.get("/cashflow/deposit-overrides");
  return (res.data.overrides ?? []).map(cleanOverride);
};

export const setDepositOverride = async (
  statement_date: string,
  amount: number,
): Promise<DepositOverrideRow> => {
  const res = await api.put("/cashflow/deposit-overrides", { statement_date, amount });
  return cleanOverride(res.data.override);
};

export const deleteDepositOverride = async (statement_date: string): Promise<void> => {
  await api.delete(`/cashflow/deposit-overrides/${statement_date}`);
};
