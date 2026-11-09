import { describe, it, expect } from "vitest";
import { monthsTable } from "./monthsTable";
import { profitRows } from "./profitSummary";
import type { ExpensePeriod } from "@/types/expense";

const p = (month: string, income: number, cogs: number, exp: number): ExpensePeriod => ({
  period_id: month, period_month: month, period_label: null, income_total: income, cogs_total: cogs, expense_total: exp,
});
const NOTES = 1960;
const GOAL = 0.15;

// Jason's 2026 book as filed on Nov 8: ten months, January–October.
const BOOK = profitRows(
  [
    p("2026-01-01", 14013, 2028, 8455), p("2026-02-01", 16558, 4184, 6691), p("2026-03-01", 25012, 6596, 12582),
    p("2026-04-01", 22699, 6896, 12338), p("2026-05-01", 28833, 5776, 13259), p("2026-06-01", 27815, 4128, 18176),
    p("2026-07-01", 33741, 5471, 13787), p("2026-08-01", 22695, 4902, 19224), p("2026-09-01", 35089, 8607, 14494),
    p("2026-10-01", 16566, 3284, 15622),
    p("2025-12-01", 9000, 1000, 1000), // another year — never in this table
  ],
  NOTES,
);
const NOV8 = new Date("2026-11-08T12:00:00Z");

describe("monthsTable — the Money tab's months, quarters and year (the Money tab sheet, calls 1 and 2)", () => {
  it("lists the filed months in order with a subtotal after each CLOSED quarter and the year total last", () => {
    const t = monthsTable(BOOK, 2026, GOAL, NOV8);
    expect(t.map((r) => r.key)).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01", "Q1",
      "2026-04-01", "2026-05-01", "2026-06-01", "Q2",
      "2026-07-01", "2026-08-01", "2026-09-01", "Q3",
      "2026-10-01", // Q4 is in progress on Nov 8 — no subtotal
      "total",
    ]);
    expect(t.find((r) => r.key === "Q1")?.label).toBe("Q1 · Jan–Mar");
  });

  it("a quarter row is the sum of its filed months; after notes = operating − notes × months", () => {
    const t = monthsTable(BOOK, 2026, GOAL, NOV8);
    const q3 = t.find((r) => r.key === "Q3")!;
    const [jul, aug, sep] = ["2026-07-01", "2026-08-01", "2026-09-01"].map((k) => t.find((r) => r.key === k)!);
    // derived: income 33,741 + 22,695 + 35,089 = 91,525; operating is the three months' own
    // operating figures summed (14,483 − 1,431 + 11,988 = 25,040 on this fixture's rounded lines)
    expect(q3.income).toBe(91525);
    expect(q3.profit).toBe(jul.profit + aug.profit + sep.profit);
    expect(q3.profit).toBe(25040);
    expect(q3.trueNet).toBe(q3.profit - 3 * NOTES); // 19,160
    expect(q3.cashMargin).toBeCloseTo(19160 / 91525, 6); // 20.9%
    expect(q3.atGoal).toBe(true);
    expect(q3.months).toBe(3);
    expect(q3.monthsWanted).toBe(3);
  });

  it("the total row sums the year and counts the months at or above the goal", () => {
    const total = monthsTable(BOOK, 2026, GOAL, NOV8).at(-1)!;
    expect(total.kind).toBe("total");
    expect(total.income).toBe(243021);
    expect(total.profit).toBe(56521);
    expect(total.trueNet).toBe(56521 - 10 * NOTES); // 36,921
    expect(total.cashMargin).toBeCloseTo(36921 / 243021, 6); // 15.2% — at the goal
    expect(total.atGoal).toBe(true);
    expect(total.months).toBe(10);
    expect(total.monthsWanted).toBe(11); // November has begun
    expect(total.atGoalCount).toBe(5); // Feb, Mar, May, Jul, Sep
    expect(total.label).toBe("2026 · 10 filed months");
  });

  it("a month's margin is graded against the goal; a losing month reads negative, never 0", () => {
    const t = monthsTable(BOOK, 2026, GOAL, NOV8);
    const aug = t.find((r) => r.key === "2026-08-01")!;
    expect(aug.profit).toBe(-1431);
    expect(aug.trueNet).toBe(-1431 - NOTES);
    expect(aug.cashMargin).toBeLessThan(0);
    expect(aug.atGoal).toBe(false);
    const feb = t.find((r) => r.key === "2026-02-01")!;
    expect(feb.atGoal).toBe(true);
  });

  it("ADVERSE · a closed quarter with one filed month subtotals that month alone and says so", () => {
    const rows = profitRows([p("2026-02-01", 10000, 2000, 3000)], NOTES);
    const t = monthsTable(rows, 2026, GOAL, new Date("2026-05-10T12:00:00Z"));
    const q1 = t.find((r) => r.key === "Q1")!;
    expect(q1.income).toBe(10000);
    expect(q1.profit).toBe(5000);
    expect(q1.trueNet).toBe(5000 - NOTES);
    expect(q1.months).toBe(1);
    expect(q1.monthsWanted).toBe(3);
    // Q2 has begun but not closed → no subtotal; no filed month in it either
    expect(t.find((r) => r.key === "Q2")).toBeUndefined();
  });

  it("a closed quarter with nothing filed has no subtotal row", () => {
    const rows = profitRows([p("2026-04-01", 10000, 2000, 3000)], NOTES);
    const t = monthsTable(rows, 2026, GOAL, new Date("2026-08-10T12:00:00Z"));
    expect(t.map((r) => r.key)).toEqual(["2026-04-01", "Q2", "total"]);
  });

  it("no income → margin null and no grade; no goal → no grade either", () => {
    const rows = profitRows([p("2026-01-01", 0, 100, 100)], NOTES);
    const jan = monthsTable(rows, 2026, GOAL, NOV8)[0];
    expect(jan.cashMargin).toBeNull();
    expect(jan.atGoal).toBeNull();
    const noGoal = monthsTable(BOOK, 2026, null, NOV8).at(-1)!;
    expect(noGoal.atGoal).toBeNull();
    expect(noGoal.atGoalCount).toBeUndefined();
  });

  it("another year's months are never in this year's table; an empty year is an empty table", () => {
    const t = monthsTable(BOOK, 2026, GOAL, NOV8);
    expect(t.some((r) => r.key.startsWith("2025"))).toBe(false);
    expect(monthsTable(BOOK, 2024, GOAL, NOV8)).toEqual([]);
  });
});
