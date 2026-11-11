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
  filed_at?: string | null; // when the month was first filed (the row's created_at) — the Money tab's filing line
  /**
   * The month's cost split by the CATEGORY's current fixed/variable (EXPTYPE-01),
   * summed server-side so the rate basis can divide fixed cost by the committed
   * mileage without any caller fetching lines.
   *
   * `null` means the month has no lines at all — NOT that it had no fixed cost.
   * A zero there would read as a free month and drag the blend down.
   */
  fixed_total?: number | null;
  variable_total?: number | null;
  lines?: ExpenseLine[];
}

// One category's total spend over some window (a month, or a year's rollup).
export interface CategorySpend {
  category: string;
  amount: number;
  section: ExpenseSection;
}
