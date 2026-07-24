import api from "./api";
import { dedupe } from "@/lib/dedupe";
import type { ExpensePeriod, ExpenseLine, ExpenseType } from "@/types/expense";

// NUMERIC columns arrive as strings — coerce at the boundary.
const num = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v);

/* eslint-disable @typescript-eslint/no-explicit-any */
const coerceLine = (l: any): ExpenseLine => ({
  line_id: l.line_id,
  category: l.category,
  amount: Number(l.amount),
  type: l.type,
  section: l.section,
});

const coercePeriod = (p: any): ExpensePeriod => ({
  period_id: p.period_id,
  period_month: p.period_month,
  period_label: p.period_label,
  income_total: num(p.income_total),
  cogs_total: num(p.cogs_total),
  expense_total: num(p.expense_total),
  lines: p.lines ? p.lines.map(coerceLine) : undefined,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// Deduped: three dashboard hooks ask for this simultaneously on every load.
export const getExpensePeriods = (): Promise<ExpensePeriod[]> =>
  dedupe("expenses", async () => {
    try {
      const res = await api.get("/expenses");
      return res.data.periods.map(coercePeriod);
    } catch {
      throw new Error("Unable to fetch expense periods");
    }
  });

export const getExpensePeriod = async (id: string): Promise<ExpensePeriod> => {
  try {
    const res = await api.get(`/expenses/${id}`);
    return coercePeriod(res.data.period);
  } catch {
    throw new Error("Unable to fetch expense period");
  }
};

export const getCategoryDefaults = async (): Promise<
  Record<string, ExpenseType>
> => {
  try {
    const res = await api.get("/expenses/defaults");
    const map: Record<string, ExpenseType> = {};
    for (const d of res.data.defaults) map[d.category] = d.type;
    return map;
  } catch {
    throw new Error("Unable to fetch category defaults");
  }
};

export interface SaveExpenseLine {
  category: string;
  amount: number;
  type: ExpenseType;
  section: "cogs" | "expenses";
}
export interface SaveExpenseInput {
  period_month: string;
  period_label: string | null;
  income_total: number | null;
  cogs_total: number | null;
  expense_total: number | null;
  lines: SaveExpenseLine[];
}

export const saveExpensePeriod = async (
  data: SaveExpenseInput,
): Promise<string> => {
  try {
    const res = await api.post("/expenses", data);
    return res.data.period_id;
  } catch {
    throw new Error("Unable to save the P&L");
  }
};

export const addExpenseLine = async (
  periodId: string,
  data: SaveExpenseLine,
): Promise<ExpenseLine> => {
  try {
    const res = await api.post(`/expenses/${periodId}/lines`, data);
    return coerceLine(res.data.line);
  } catch {
    throw new Error("Unable to add the expense");
  }
};

export const patchExpenseLine = async (
  lineId: string,
  data: Partial<Pick<ExpenseLine, "amount" | "type">>,
): Promise<void> => {
  try {
    await api.patch(`/expenses/lines/${lineId}`, data);
  } catch {
    throw new Error("Unable to update the expense");
  }
};

export const deleteExpenseLine = async (lineId: string): Promise<void> => {
  try {
    await api.delete(`/expenses/lines/${lineId}`);
  } catch {
    throw new Error("Unable to delete the expense");
  }
};
