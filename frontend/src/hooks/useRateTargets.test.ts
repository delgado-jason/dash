import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { computeRateTargets } from "./useRateTargets";
import { BASIS_MONTHS } from "@/lib/constants/targets";

// 2026-11-01: the Expenses page blended three months and divided by the 73%
// linehaul take while the Market page blended six and divided by the measured
// keep — two break-evens for one truck. Both now call this one function.
const now = new Date("2026-11-01T18:00:00Z");
const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "1",
    load_status: "delivered",
    delivery_date: "2026-10-15",
    loaded_miles: 1000,
    odometer_start: 100000, // a real reading — a zero start is a missing reading, not mile 0 (2026-11-04)
    odometer_end: 101200,
    linehaul: "2000",
    fuel_surcharge: "500",
    total_accessorials: "0",
    gross_revenue: "2500",
    net_revenue: "1960",
    ...over,
  }) as Load;
const period = (month: string, cogs: number, expense: number): ExpensePeriod =>
  ({
    period_id: `p-${month}`,
    period_month: month,
    period_label: month,
    income_total: 10000,
    cogs_total: cogs,
    expense_total: expense,
    lines: [],
  }) as unknown as ExpensePeriod;
const schedule = { linehaul_pct: "0.65", trailer_pct: "0.08" } as unknown as SettlementSchedule;

describe("computeRateTargets — one basis for every page", () => {
  it("divides cost per driven mile by the keep measured from the window's own loads", () => {
    const t = computeRateTargets([load({})], [period("2026-10-01", 2000, 6000)], 0, null, now);
    expect(t.basis.windowLabel).toBe("Oct ’26");
    expect(t.basis.months).toBe(1);
    expect(t.basis.monthsWanted).toBe(BASIS_MONTHS);
    expect(t.basis.costPerTotalMile).toBeCloseTo(8000 / 1200, 6);
    expect(t.keepSource).toBe("blended");
    expect(t.keep).toBeCloseTo(1960 / 2500, 6); // net ÷ gross
    expect(t.bookingLadder.walkAway).toBeCloseTo(8000 / 1200 / 0.784, 6);
    expect(t.grossRate).toBeCloseTo(2500 / 1200, 6);
    expect(t.ready).toBe(true);
  });

  it("folds the monthly notes into the cost before dividing", () => {
    const t = computeRateTargets([load({})], [period("2026-10-01", 2000, 6000)], 1200, null, now);
    expect(t.basis.costPerTotalMile).toBeCloseTo(9200 / 1200, 6);
    expect(t.obligationsMonthly).toBe(1200);
  });

  it("falls back to the split's linehaul take until the window has gross (the split is dated, NET-01)", () => {
    const split = { linehaul_pct: 0.65, trailer_pct: 0.08 }; // the row in force today
    const t = computeRateTargets([], [period("2026-10-01", 2000, 6000)], 0, schedule, now, [], split);
    expect(t.keepSource).toBe("linehaul");
    expect(t.keep).toBeCloseTo(0.73, 6);
    expect(t.basis.costPerTotalMile).toBeNull(); // no miles → no $/mi
    expect(t.bookingLadder.walkAway).toBeNull();
    expect(t.ready).toBe(false);
  });

  it("names a complete month with no P&L instead of counting it", () => {
    const t = computeRateTargets([load({})], [period("2026-10-01", 2000, 6000)], 0, null, now);
    expect(t.basis.missingLabel).toBe("May–Sep ’26"); // contiguous → a range
  });
});
