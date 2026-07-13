import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  rangeFor,
  resolvePeriod,
  computeRecap,
  latestRecapWithData,
} from "./recap";

const NOW = new Date("2026-07-11T12:00:00Z");

const L = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    fuel_surcharge: "0",
    total_accessorials: "0",
    agent: "Redwood",
    ...o,
  }) as unknown as Load;

const P = (month: string, income: number, cogs: number, expense: number): ExpensePeriod =>
  ({ period_month: month, income_total: income, cogs_total: cogs, expense_total: expense }) as ExpensePeriod;

describe("rangeFor / resolvePeriod", () => {
  it("labels each scope", () => {
    expect(rangeFor("year", 2026, 0).label).toBe("2026");
    expect(rangeFor("quarter", 2026, 1).label).toBe("Q2 2026");
    expect(rangeFor("month", 2026, 5).label).toBe("Jun 2026");
  });
  it("resolves the most recent complete period — never the in-progress one", () => {
    expect(resolvePeriod("month", 0, NOW).label).toBe("Jun 2026");
    expect(resolvePeriod("quarter", 0, NOW).label).toBe("Q2 2026");
    expect(resolvePeriod("year", 0, NOW).label).toBe("2025"); // NOT 2026 — it isn't done
    expect(resolvePeriod("month", 1, NOW).label).toBe("May 2026");
    expect(resolvePeriod("year", 1, NOW).label).toBe("2024");
  });
});

describe("latestRecapWithData", () => {
  it("prefers the grandest finished period that has data", () => {
    // A June-2026 delivery: the last complete year (2025) is empty, so it falls
    // back to the quarter (Q2 2026), which has the load.
    const loads = [
      { load_status: "delivered", delivery_date: "2026-06-15" },
    ] as unknown as Load[];
    expect(latestRecapWithData(loads, NOW)).toEqual({ scope: "quarter", label: "Q2 2026" });
  });
  it("returns null when nothing is finished yet", () => {
    const loads = [
      { load_status: "delivered", delivery_date: "2026-07-05" }, // current month only
    ] as unknown as Load[];
    expect(latestRecapWithData(loads, NOW)).toBeNull();
  });
});

describe("computeRecap", () => {
  const loads = [
    L({ load_id: "a", delivery_date: "2026-05-12", linehaul: "3200", loaded_miles: 1000, origin_state: "TX", destination_state: "GA", origin_market: "Dallas", delivery_market: "Atlanta" }),
    L({ load_id: "b", delivery_date: "2026-06-15", linehaul: "2600", loaded_miles: 800, origin_state: "TX", destination_state: "TN", origin_market: "Houston", delivery_market: "Memphis" }),
    L({ load_id: "c", delivery_date: "2025-12-30", linehaul: "9999", loaded_miles: 500, origin_state: "CA", destination_state: "NV", origin_market: "LA", delivery_market: "Vegas" }), // prior year — excluded
  ];
  const periods = [
    P("2026-05-01", 28833, 5776, 13258),
    P("2026-06-01", 27814, 4127, 18175),
  ];

  it("aggregates the year's highlights", () => {
    const r = computeRecap(loads, [] as FuelEntry[], periods, 0, rangeFor("year", 2026, 0), "year", NOW);
    expect(r.gross).toBe(5800);
    expect(r.loadedMiles).toBe(1800);
    expect(r.totalMiles).toBe(1800); // no odometers → falls back to loaded miles
    expect(r.states).toBe(3); // TX, GA, TN — prior-year CA/NV excluded
    expect(r.loads).toBe(2);
    expect(r.biggestLoad).toBe(3200);
    expect(r.longestHaul).toBe(1000);
    expect(r.avgRpm).toBeCloseTo(5800 / 1800, 3);
    expect(r.topLane).toBe("Dallas → Atlanta");
    expect(r.topAgent).toBe("Redwood");
    // 12 months for a year, with only May + Jun carrying gross
    expect(r.monthlyGross).toHaveLength(12);
    expect(r.monthlyGross[4]).toEqual({ label: "May", gross: 3200 });
    expect(r.monthlyGross[5]).toEqual({ label: "Jun", gross: 2600 });
  });

  it("counts total (odometer) miles incl. deadhead, loaded only for RPM", () => {
    const withOdo = [
      // 700 driven (200 deadhead) on 500 loaded
      L({ load_id: "x", delivery_date: "2026-06-05", linehaul: "1000", loaded_miles: 500, odometer_start: 1000, odometer_end: 1700 }),
      // no odometer readings → total falls back to its 400 loaded miles
      L({ load_id: "y", delivery_date: "2026-06-20", linehaul: "1200", loaded_miles: 400 }),
    ];
    const r = computeRecap(withOdo, [] as FuelEntry[], [], 0, rangeFor("year", 2026, 0), "year", NOW);
    expect(r.totalMiles).toBe(1100); // 700 + 400
    expect(r.loadedMiles).toBe(900); // 500 + 400
    expect(r.avgRpm).toBeCloseTo(2200 / 900, 3); // RPM stays on loaded miles
  });

  it("rolls up P&L with best / hardest month", () => {
    const r = computeRecap(loads, [] as FuelEntry[], periods, 0, rangeFor("year", 2026, 0), "year", NOW);
    expect(r.netProfit).toBe(9799 + 5512);
    expect(r.bestMonth).toMatchObject({ label: "May 2026", profit: 9799 });
    expect(r.hardestMonth).toMatchObject({ label: "Jun 2026", profit: 5512 });
  });
});
