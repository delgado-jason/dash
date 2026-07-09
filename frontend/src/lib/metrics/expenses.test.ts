import { describe, it, expect } from "vitest";
import type { ExpensePeriod, ExpenseLine } from "@/types/expense";
import { getExpenseMetrics, pctOfRevenue } from "./expenses";

const line = (over: Partial<ExpenseLine>): ExpenseLine => ({
  line_id: "x",
  category: "c",
  amount: 0,
  type: "variable",
  section: "expenses",
  ...over,
});

const period = (over: Partial<ExpensePeriod>): ExpensePeriod => ({
  period_id: "p",
  period_month: "2026-06-01",
  period_label: "Jun 2026",
  income_total: 10000,
  cogs_total: null,
  expense_total: null,
  lines: [],
  ...over,
});

describe("getExpenseMetrics", () => {
  it("computes cost split, cpm, break-even, and margin", () => {
    const p = period({
      income_total: 10000,
      lines: [
        line({ type: "fixed", amount: 6000 }),
        line({ type: "variable", amount: 2000 }),
      ],
    });
    const m = getExpenseMetrics(p, 10000, 8000); // 10k total miles, 8k loaded

    expect(m.monthlyCost).toBe(8000);
    expect(m.fixedTotal).toBe(6000);
    expect(m.variableTotal).toBe(2000);
    expect(m.fixedPct).toBeCloseTo(0.75, 5);
    expect(m.weeklyCost).toBeCloseTo(8000 / (52 / 12), 5);
    expect(m.cpm).toBeCloseTo(0.8, 5); // 8000 / 10000
    expect(m.breakEvenRpm).toBeCloseTo(1.0, 5); // 8000 / 8000
    expect(m.netMargin).toBeCloseTo(0.2, 5); // (10000 - 8000)/10000
  });

  it("returns null for the ratios when their denominators are zero", () => {
    const p = period({ income_total: 0, lines: [line({ amount: 500 })] });
    const m = getExpenseMetrics(p, 0, 0);
    expect(m.cpm).toBeNull();
    expect(m.breakEvenRpm).toBeNull();
    expect(m.netMargin).toBeNull();
    expect(m.monthlyCost).toBe(500);
  });

  it("coerces string amounts (NUMERIC comes back as strings)", () => {
    const p = period({
      lines: [line({ type: "fixed", amount: "100" as unknown as number })],
    });
    expect(getExpenseMetrics(p, 1000, 1000).fixedTotal).toBe(100);
  });
});

describe("pctOfRevenue", () => {
  it("divides by income, null when income is missing", () => {
    expect(pctOfRevenue(2500, 10000)).toBeCloseTo(0.25, 5);
    expect(pctOfRevenue(2500, 0)).toBeNull();
    expect(pctOfRevenue(2500, null)).toBeNull();
  });
});
