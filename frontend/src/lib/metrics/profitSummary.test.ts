import { describe, it, expect } from "vitest";
import { profitRows, ytdRows, ytdSummary, lastFiledMonth, monthIsFiled, monthsAtGoal } from "./profitSummary";
import type { ExpensePeriod } from "@/types/expense";

const p = (month: string, income: number | null, cogs: number | null, exp: number | null): ExpensePeriod => ({
  period_id: month, period_month: month, period_label: null, income_total: income, cogs_total: cogs, expense_total: exp,
});

describe("profitRows", () => {
  it("keeps only filed months (an income total), oldest first, with both margins", () => {
    const rows = profitRows([p("2026-03-01", 1000, 300, 200), p("2026-01-01", 2000, 500, 500), p("2026-02-01", null, null, null)], 100);
    expect(rows.map((r) => r.month)).toEqual(["2026-01-01", "2026-03-01"]);
    expect(rows[0]).toMatchObject({ income: 2000, cost: 1000, profit: 1000, margin: 0.5, cashMargin: 0.45, notes: 100 });
  });

  it("a month with no income reads 0 margin, not NaN", () => {
    const rows = profitRows([p("2026-01-01", 0, 10, 10)], 100);
    expect(rows[0].margin).toBe(0);
    expect(rows[0].cashMargin).toBe(0);
    expect(rows[0].profit).toBe(-20);
  });
});

describe("ytdSummary", () => {
  const rows = profitRows([p("2025-12-01", 500, 100, 100), p("2026-01-01", 2000, 500, 500), p("2026-02-01", 1000, 300, 200)], 100);

  it("sums the year only, trueNet = profit − notes × months", () => {
    expect(ytdRows(rows, 2026)).toHaveLength(2);
    const y = ytdSummary(rows, 2026);
    expect(y.months).toBe(2);
    expect(y.income).toBe(3000);
    expect(y.profit).toBe(1500);
    expect(y.trueNet).toBe(1300);
    expect(y.margin).toBe(0.5);
    expect(y.cashMargin).toBeCloseTo(1300 / 3000, 10);
  });

  it("an empty year has null margins and a zero true net", () => {
    const y = ytdSummary(rows, 2024);
    expect(y).toEqual({ months: 0, income: 0, profit: 0, margin: null, trueNet: 0, cashMargin: null });
  });
});

describe("lastFiledMonth / monthIsFiled", () => {
  const rows = profitRows([p("2026-01-01", 2000, 500, 500), p("2026-02-01", 1000, 900, 400)], 0);
  it("names the latest month with its operating profit", () => {
    expect(lastFiledMonth(rows)).toEqual({ month: "2026-02-01", profit: -300, income: 1000 });
    expect(lastFiledMonth([])).toBeNull();
  });
  it("says whether the month holding a day is filed", () => {
    expect(monthIsFiled(rows, "2026-02-14")).toBe(true);
    expect(monthIsFiled(rows, "2026-03-02")).toBe(false);
  });
});

describe("monthsAtGoal — a count, not a streak (B1)", () => {
  // notes 100 → after-notes margins: Jan 45%, Feb 10%, Mar 40%, Apr 50%
  const rows = profitRows(
    [p("2026-01-01", 2000, 500, 500), p("2026-02-01", 1000, 400, 400), p("2026-03-01", 1000, 300, 200), p("2026-04-01", 2000, 400, 500)],
    100,
  );

  it("counts every month at or above the goal — a miss in the middle erases nothing", () => {
    expect(monthsAtGoal(rows, 0.2)).toEqual({ at: 3, of: 4 });
    expect(monthsAtGoal(rows, 0.45)).toEqual({ at: 2, of: 4 }); // Jan at exactly 45% counts
  });

  it("no goal or no filed month → null, never 0 of 0", () => {
    expect(monthsAtGoal(rows, null)).toBeNull();
    expect(monthsAtGoal([], 0.2)).toBeNull();
  });
});
