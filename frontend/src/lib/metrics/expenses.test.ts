import { describe, it, expect } from "vitest";
import type {
  ExpensePeriod,
  ExpenseLine,
  CategorySpend,
} from "@/types/expense";
import {
  getExpenseMetrics,
  pctOfRevenue,
  topCategoriesWithOther,
  getCashMetrics,
  getTrueMonthly,
} from "./expenses";

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

describe("getCashMetrics", () => {
  it("adds obligations to operating cost for the true cash break-even", () => {
    // operating cost 8000, obligations 2000 → true cash cost 10000
    const m = getCashMetrics(8000, 2000, 10000, 8000);
    expect(m.obligationsTotal).toBe(2000);
    expect(m.trueMonthlyCost).toBe(10000);
    expect(m.trueCpm).toBeCloseTo(1.0, 5); // 10000 / 10000 total miles
    expect(m.trueBreakEvenRpm).toBeCloseTo(1.25, 5); // 10000 / 8000 loaded
  });

  it("null ratios when miles are zero; no obligations = operating cost", () => {
    const m = getCashMetrics(8000, 0, 0, 0);
    expect(m.trueMonthlyCost).toBe(8000);
    expect(m.trueCpm).toBeNull();
    expect(m.trueBreakEvenRpm).toBeNull();
  });
});

describe("getTrueMonthly", () => {
  it("folds obligations into the month's cost, weekly, and margin", () => {
    // operating 8000 + obligations 2000 = 10000 true; income 15000
    const t = getTrueMonthly(8000, 2000, 15000);
    expect(t.trueMonthlyCost).toBe(10000);
    expect(t.trueWeeklyCost).toBeCloseTo(10000 / (52 / 12), 5);
    expect(t.trueNetMargin).toBeCloseTo((15000 - 10000) / 15000, 5); // ≈0.333
  });

  it("no obligations = operating cost; null margin when income is missing", () => {
    const t = getTrueMonthly(8000, 0, 0);
    expect(t.trueMonthlyCost).toBe(8000);
    expect(t.trueNetMargin).toBeNull();
  });
});

describe("topCategoriesWithOther", () => {
  const cat = (category: string, amount: number): CategorySpend => ({
    category,
    amount,
    section: "expenses",
  });
  const cats = [
    cat("Payroll", 7644),
    cat("Repairs", 4990),
    cat("Fuel", 4128),
    cat("Loan fee", 1040),
    cat("Insurance", 795),
    cat("Utilities", 748),
    cat("Tolls", 300),
    cat("Supplies", 120),
  ];

  it("keeps the top n and folds the rest into one Other slice", () => {
    const c = topCategoriesWithOther(cats, 6);
    expect(c.map((x) => x.category)).toEqual([
      "Payroll", "Repairs", "Fuel", "Loan fee", "Insurance", "Utilities", "Other",
    ]);
    // Other = Tolls + Supplies = 420
    expect(c[6]).toMatchObject({ category: "Other", amount: 420 });
  });

  it("adds no Other slice when categories already fit", () => {
    const c = topCategoriesWithOther(cats.slice(0, 4), 6);
    expect(c).toHaveLength(4);
    expect(c.some((x) => x.category === "Other")).toBe(false);
  });

  it("sorts defensively before slicing", () => {
    const c = topCategoriesWithOther([cat("a", 10), cat("b", 90), cat("c", 50)], 1);
    expect(c[0]).toMatchObject({ category: "b", amount: 90 });
    expect(c[1]).toMatchObject({ category: "Other", amount: 60 });
  });

  it("empty in, empty out", () => {
    expect(topCategoriesWithOther([], 6)).toEqual([]);
  });
});
