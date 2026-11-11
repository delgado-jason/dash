import { describe, it, expect } from "vitest";
import { assumptionCheck, drift, type AssumptionRow } from "./assumptionCheck";
import type { SettlementSummary } from "@/types/settlement";

// Jason's real twelve statements, Aug 19 – Nov 4 2026, read off prod. Using
// the true shape matters here: the spread is the point of the panel, and
// invented fixtures would be evenly distributed in a way his are not — two of
// these weeks drew no advance at all, and one earned no revenue.
const S = (
  period_ending: string,
  revenue: number,
  advances: number,
  deductions: number,
): SettlementSummary =>
  ({ settlement_id: period_ending, period_ending, revenue: String(revenue),
     advances: String(advances), deductions: String(deductions) } as unknown as SettlementSummary);

// revenue avg 5036.91 (0.00 – 8560.41) · advances avg-when-drawn 2207.20,
// 2 weeks at zero, range 0 – 4000 · deductions ex-advances avg 381.95
const TWELVE: SettlementSummary[] = [
  S("2026-11-04", 6239.00, 2468.00, 2726.00),
  S("2026-10-28", 0.00, 0.00, 191.00),
  S("2026-10-21", 8560.41, 4000.00, 4382.00),
  S("2026-10-14", 5120.00, 2200.00, 2582.00),
  S("2026-10-07", 7430.00, 3000.00, 3382.00),
  S("2026-09-30", 4890.00, 2100.00, 2482.00),
  S("2026-09-23", 6010.00, 2500.00, 2882.00),
  S("2026-09-16", 0.00, 0.00, 191.00),
  S("2026-09-09", 5600.00, 2300.00, 2682.00),
  S("2026-09-02", 4980.00, 1900.00, 2282.00),
  S("2026-08-26", 7120.00, 2900.00, 3282.00),
  S("2026-08-19", 4493.51, 1700.00, 2082.00),
];

const TYPED = {
  weeklyRevenue: 4647,
  weeklyFuelAdvance: 2000,
  weeklyDeductions: 361.99,
  weeklyPayroll: 1908,
};
const row = (rows: AssumptionRow[], key: string) => rows.find((r) => r.key === key)!;

describe("assumptionCheck — what the typed numbers are worth", () => {
  const rows = assumptionCheck({ settlements: TWELVE, ...TYPED });

  it("measures revenue across every statement, zeroes included", () => {
    // A week that earned nothing IS a week of revenue history. Dropping the
    // zeroes would measure "what a working week pays", which is not what the
    // assumption stands for — it stands for a week.
    const r = row(rows, "weekly_revenue");
    expect(r.samples).toBe(12);
    expect(r.lo).toBe(0);
    expect(r.hi).toBeCloseTo(8560.41, 2);
    expect(r.measured).toBeGreaterThan(4647);
    expect(r.verdict).toBe("use");
  });

  it("measures the advance only over the weeks that DREW one", () => {
    // Two of these weeks drew nothing because he was home. Averaging those in
    // would describe how often he was home, not what he draws when he goes.
    const r = row(rows, "weekly_fuel_advance");
    expect(r.samples).toBe(10);
    expect(r.note).toBe("2 weeks drew nothing");
    // The range still shows the zeroes — that IS the spread worth seeing.
    expect(r.lo).toBe(0);
    expect(r.hi).toBe(4000);
    expect(r.verdict).toBe("use");
  });

  it("calls the deductions row CLOSE — twenty dollars is not a decision", () => {
    // $362 typed against ~$382 measured: a real 5.5% gap, and twenty dollars a
    // week. The board already buckets deductions off the statements anyway.
    const r = row(rows, "weekly_settlement_deductions");
    expect(r.measured).not.toBeNull();
    expect(Math.abs(r.measured! - 361.99)).toBeLessThan(50);
    expect(r.verdict).toBe("close");
  });

  it("says plainly that payroll has no feed", () => {
    const r = row(rows, "weekly_payroll");
    expect(r.measured).toBeNull();
    expect(r.verdict).toBe("no-feed");
    expect(r.note).toContain("no feed");
  });

  it("needs BOTH a real fraction and real money to say 'use'", () => {
    // 10% off, but only $12 — not a decision.
    const small = assumptionCheck({
      settlements: TWELVE, ...TYPED, weeklyDeductions: 370, window: 12,
    });
    expect(row(small, "weekly_settlement_deductions").verdict).toBe("close");
    // $500 off and 10% — both true.
    const big = assumptionCheck({ settlements: TWELVE, ...TYPED, weeklyRevenue: 4500 });
    expect(row(big, "weekly_revenue").verdict).toBe("use");
  });

  it("refuses rather than inventing when there are no statements", () => {
    const empty = assumptionCheck({ settlements: [], ...TYPED });
    expect(empty.every((r) => r.verdict === "no-feed" || r.measured === null)).toBe(true);
    expect(row(empty, "weekly_revenue").measured).toBeNull();
    expect(row(empty, "weekly_revenue").samples).toBe(0);
  });

  it("honours the window and takes the MOST RECENT statements", () => {
    const four = assumptionCheck({ settlements: TWELVE, ...TYPED, window: 4 });
    const r = row(four, "weekly_revenue");
    expect(r.samples).toBe(4);
    // Nov 4, Oct 28, Oct 21, Oct 14 — not the oldest four.
    expect(r.hi).toBeCloseTo(8560.41, 2);
  });

  it("sorts by period, so an unordered feed still reads the latest", () => {
    const shuffled = [...TWELVE].reverse();
    const a = assumptionCheck({ settlements: shuffled, ...TYPED, window: 4 });
    const b = assumptionCheck({ settlements: TWELVE, ...TYPED, window: 4 });
    expect(row(a, "weekly_revenue").measured).toBe(row(b, "weekly_revenue").measured);
  });

  it("drift is signed — a typed number running LOW reads positive", () => {
    const r = row(rows, "weekly_revenue");
    expect(drift(r)).toBeGreaterThan(0);
    expect(drift(row(rows, "weekly_payroll"))).toBeNull();
  });
});
