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
