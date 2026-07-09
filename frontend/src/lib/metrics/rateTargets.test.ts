import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import {
  completeMonthsBefore,
  getCostBasis,
  getRateLadder,
  getGrossTargets,
  payWeekRange,
  getWeekBookedGross,
  getWeekRpm,
  getWindowRpm,
} from "./rateTargets";

const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "1",
    load_status: "delivered",
    delivery_date: "2026-05-15",
    loaded_miles: 1000,
    odometer_start: 0,
    odometer_end: 1200,
    linehaul: "2000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as Load;

const period = (month: string, cogs: number, expense: number): ExpensePeriod => ({
  period_id: month,
  period_month: month,
  period_label: month,
  income_total: null,
  cogs_total: cogs,
  expense_total: expense,
});

describe("completeMonthsBefore", () => {
  it("excludes the current month and returns the 3 prior", () => {
    const months = completeMonthsBefore(new Date("2026-07-09T00:00:00Z"), 3);
    expect(months).toEqual([
      { year: 2026, month: 3 }, // Apr
      { year: 2026, month: 4 }, // May
      { year: 2026, month: 5 }, // Jun
    ]);
  });

  it("rolls over the year boundary", () => {
    const months = completeMonthsBefore(new Date("2026-02-10T00:00:00Z"), 3);
    expect(months).toEqual([
      { year: 2025, month: 10 }, // Nov
      { year: 2025, month: 11 }, // Dec
      { year: 2026, month: 0 }, // Jan
    ]);
  });
});

describe("getCostBasis", () => {
  const now = new Date("2026-07-09T00:00:00Z");

  it("blends true cost + miles over the 3 complete prior months", () => {
    const periods = [
      period("2026-04-01", 5000, 5000), // 10k operating
      period("2026-05-01", 5000, 5000),
      period("2026-06-01", 5000, 5000),
    ];
    const loads = [
      load({ delivery_date: "2026-04-15", loaded_miles: 2000, odometer_start: 0, odometer_end: 2500, linehaul: "8000" }),
      load({ delivery_date: "2026-05-15", loaded_miles: 2000, odometer_start: 0, odometer_end: 2500, linehaul: "8000" }),
      load({ delivery_date: "2026-06-15", loaded_miles: 2000, odometer_start: 0, odometer_end: 2500, linehaul: "8000" }),
      // current + future month loads must be ignored
      load({ delivery_date: "2026-07-15", loaded_miles: 9999, linehaul: "99999" }),
    ];
    // obligations 2000/mo → true monthly = 10k + 2k = 12k
    const b = getCostBasis(periods, 2000, loads, now);
    expect(b.months).toBe(3);
    expect(b.trueMonthlyCost).toBeCloseTo(12000, 5);
    expect(b.loadedMiles).toBe(6000); // 3 × 2000
    expect(b.totalMiles).toBe(7500); // 3 × 2500
    // walk-away = total true cost (36k) / loaded (6000) = 6.00
    expect(b.breakEvenRpm).toBeCloseTo(6.0, 5);
    // your rate = revenue (24k) / loaded (6000) = 4.00
    expect(b.windowRpm).toBeCloseTo(4.0, 5);
  });

  it("skips months with no P&L, keeping cost and miles aligned", () => {
    const periods = [period("2026-05-01", 5000, 5000)]; // only May
    const loads = [
      load({ delivery_date: "2026-04-15", loaded_miles: 5000 }), // Apr miles ignored (no P&L)
      load({ delivery_date: "2026-05-15", loaded_miles: 2000, linehaul: "8000" }),
    ];
    const b = getCostBasis(periods, 0, loads, now);
    expect(b.months).toBe(1);
    expect(b.loadedMiles).toBe(2000); // only May
    expect(b.breakEvenRpm).toBeCloseTo(10000 / 2000, 5); // 5.00
  });

  it("null break-even when there's no P&L history", () => {
    const b = getCostBasis([], 0, [], now);
    expect(b.months).toBe(0);
    expect(b.trueMonthlyCost).toBeNull();
    expect(b.breakEvenRpm).toBeNull();
  });
});

describe("getRateLadder", () => {
  it("marks up the walk-away by each tier", () => {
    const l = getRateLadder(4, { minimum: 0.15, target: 0.35, strong: 0.6 });
    expect(l.walkAway).toBe(4);
    expect(l.minimum).toBeCloseTo(4.6, 5);
    expect(l.target).toBeCloseTo(5.4, 5);
    expect(l.strong).toBeCloseTo(6.4, 5);
  });

  it("all null when break-even is unknown", () => {
    const l = getRateLadder(null, { minimum: 0.15, target: 0.35, strong: 0.6 });
    expect(l.walkAway).toBeNull();
    expect(l.target).toBeNull();
  });
});

describe("getGrossTargets", () => {
  it("weekly + daily floors and target-markup", () => {
    const g = getGrossTargets(26000, 0.35, 22);
    expect(g.weeklyBreakEven).toBeCloseTo(26000 / (52 / 12), 5); // 6000
    expect(g.weeklyTarget).toBeCloseTo((26000 / (52 / 12)) * 1.35, 5);
    expect(g.dailyBreakEven).toBeCloseTo(26000 / 22, 5);
    expect(g.dailyTarget).toBeCloseTo((26000 / 22) * 1.35, 5);
  });

  it("null when there's no cost basis", () => {
    const g = getGrossTargets(null, 0.35, 22);
    expect(g.weeklyBreakEven).toBeNull();
    expect(g.dailyTarget).toBeNull();
  });
});

describe("payWeekRange", () => {
  it("runs Wednesday → the next Wednesday (Wed–Tue inclusive)", () => {
    // 2026-07-09 is a Thursday → pay week started Wed 2026-07-08
    const { start, end } = payWeekRange(new Date("2026-07-09T12:00:00Z"), 3);
    expect(start.getUTCDay()).toBe(3); // Wednesday
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(end.toISOString().slice(0, 10)).toBe("2026-07-15");
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });

  it("on the start day itself, the week starts today", () => {
    // 2026-07-08 is a Wednesday
    const { start } = payWeekRange(new Date("2026-07-08T00:00:00Z"), 3);
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-08");
  });
});

describe("getWeekBookedGross", () => {
  const start = new Date("2026-07-08T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("sums booked + in-transit + delivered in range, excludes cancelled and out-of-range", () => {
    const loads = [
      load({ delivery_date: "2026-07-08", load_status: "delivered", linehaul: "1000" }),
      load({ delivery_date: "2026-07-10", load_status: "booked", linehaul: "2000" }),
      load({ delivery_date: "2026-07-14", load_status: "in_transit", linehaul: "3000" }),
      load({ delivery_date: "2026-07-15", load_status: "booked", linehaul: "9999" }), // end is exclusive
      load({ delivery_date: "2026-07-10", load_status: "cancelled", linehaul: "9999" }),
      load({ delivery_date: "2026-07-01", load_status: "delivered", linehaul: "9999" }), // before range
    ];
    expect(getWeekBookedGross(loads, start, end)).toBeCloseTo(6000, 5);
  });
});

describe("getWeekRpm", () => {
  const start = new Date("2026-07-08T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("blends this week's revenue over this week's loaded miles", () => {
    const loads = [
      load({ delivery_date: "2026-07-09", load_status: "booked", linehaul: "4000", loaded_miles: 1000 }),
      load({ delivery_date: "2026-07-11", load_status: "delivered", linehaul: "6000", loaded_miles: 1000 }),
      load({ delivery_date: "2026-07-20", load_status: "delivered", linehaul: "9999", loaded_miles: 1000 }), // out of range
    ];
    expect(getWeekRpm(loads, start, end)).toBeCloseTo(5.0, 5); // 10000 / 2000
  });

  it("null when there are no loaded miles this week", () => {
    expect(getWeekRpm([], start, end)).toBeNull();
  });
});

describe("getWindowRpm", () => {
  const now = new Date("2026-07-09T00:00:00Z");

  it("blends revenue over loaded miles for the last 3 complete months, loads only", () => {
    const loads = [
      load({ delivery_date: "2026-04-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-05-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-06-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-07-15", linehaul: "9999", loaded_miles: 2000 }), // current month excluded
    ];
    expect(getWindowRpm(loads, now)).toBeCloseTo(4.0, 5); // 24000 / 6000
  });

  it("null when there are no loaded miles in the window", () => {
    expect(getWindowRpm([], now)).toBeNull();
  });
});
