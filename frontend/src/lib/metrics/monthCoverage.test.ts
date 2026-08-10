import { describe, it, expect } from "vitest";
import { monthCoverage } from "./monthCoverage";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";

// Aug 10, 2026 UTC — the clock is injected everywhere.
const NOW = new Date("2026-08-10T12:00:00Z");
const NOTES = 4000;

const period = (month: string, income: number, cogs: number, expense: number): ExpensePeriod =>
  ({
    period_month: `${month}-01`,
    income_total: income,
    cogs_total: cogs,
    expense_total: expense,
  }) as ExpensePeriod;

const load = (delivery_date: string, linehaul: string, paid = true): Load =>
  ({
    load_status: "delivered",
    payment_status: paid ? "paid" : "unpaid",
    delivery_date,
    linehaul,
    fuel_surcharge: "0",
    total_accessorials: "0",
    loaded_miles: 500,
  }) as Load;

// Three complete P&L months (May–Jul): cost = cogs + expenses + notes.
// (8000+2000+4000 + 9000+3000+4000 + 10000+4000+4000) / 3 = 16,000 mean.
const HISTORY = [
  period("2026-05", 20000, 8000, 2000),
  period("2026-06", 22000, 9000, 3000),
  period("2026-07", 25000, 10000, 4000),
];

describe("monthCoverage", () => {
  it("builds the threshold from the mean of complete months, notes as the last slice", () => {
    const c = monthCoverage(HISTORY, NOTES, [], NOW);
    expect(c.threshold).toBe(16000);
    expect(c.opEx).toBe(12000);
    expect(c.notes).toBe(NOTES);
    expect(c.monthsInMean).toBe(3);
    expect(c.monthLabel).toBe("August");
  });

  it("rides the MTD estimate until the month's P&L posts, and reports the shortfall", () => {
    // getRevenueMTD counts delivered loads in the current month.
    const c = monthCoverage(HISTORY, NOTES, [load("2026-08-04", "8000")], NOW);
    expect(c.estimated).toBe(true);
    expect(c.income).toBeGreaterThan(0);
    expect(c.covered).toBe(false);
    expect(c.short).not.toBeNull();
    expect(c.coverDay).not.toBeNull(); // straight-line pace lands inside August
    expect(c.marginOver).toBeNull();
  });

  it("declares the month covered with margin over, from the posted P&L row", () => {
    const c = monthCoverage(
      [...HISTORY, period("2026-08", 19500, 1000, 1000)],
      NOTES,
      [],
      NOW,
    );
    expect(c.estimated).toBe(false);
    expect(c.income).toBe(19500);
    expect(c.covered).toBe(true);
    expect(c.marginOver).toBe(3500);
    expect(c.short).toBeNull();
    expect(c.coverDay).toBeNull();
  });

  it("goes quiet with no P&L history — no threshold, nothing to cover", () => {
    const c = monthCoverage([], NOTES, [load("2026-08-04", "8000")], NOW);
    expect(c.threshold).toBeNull();
    expect(c.opEx).toBeNull();
    expect(c.covered).toBe(false);
    expect(c.short).toBeNull();
    expect(c.coverDay).toBeNull();
  });

  it("handles zero notes — the threshold is pure operating cost", () => {
    const c = monthCoverage(HISTORY, 0, [], NOW);
    expect(c.threshold).toBe(12000);
    expect(c.opEx).toBe(12000);
    expect(c.notes).toBe(0);
  });
});
