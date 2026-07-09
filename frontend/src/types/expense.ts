export type ExpenseType = "fixed" | "variable";
export type ExpenseSection = "cogs" | "expenses";

export interface ExpenseLine {
  line_id: string;
  category: string;
  amount: number; // coerced from the API's NUMERIC string at the service layer
  type: ExpenseType;
  section: ExpenseSection;
}

export interface ExpensePeriod {
  period_id: string;
  period_month: string;
  period_label: string | null;
  income_total: number | null;
  cogs_total: number | null;
  expense_total: number | null;
  lines?: ExpenseLine[];
}
