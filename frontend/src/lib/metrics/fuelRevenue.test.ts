import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { fuelVsRevenue } from "./fuelRevenue";

const NOW = new Date("2026-07-15T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const fuel = (o: Partial<FuelEntry>): FuelEntry =>
  ({
    fuel_date: "2026-06-10",
    gallons: 100,
    price_per_gallon: 4,
    ...o,
  }) as FuelEntry;

// loadGross falls back to linehaul + fuel_surcharge + total_accessorials.
const load = (o: Partial<Load>): Load =>
  ({
    load_status: "delivered",
    delivery_date: "2026-06-15",
    linehaul: "9000",
    fuel_surcharge: "1000",
    total_accessorials: "0",
    ...o,
  }) as unknown as Load;

describe("fuelVsRevenue", () => {
  it("computes fuel %-of-gross and surcharge coverage per month", () => {
    const entries = [
      fuel({ fuel_date: "2026-06-05", gallons: 100, price_per_gallon: 4 }), // $400
      fuel({ fuel_date: "2026-06-20", gallons: 100, price_per_gallon: 4 }), // $400 → June $800
    ];
    const loads = [
      load({
        delivery_date: "2026-06-15",
        linehaul: "9000",
        fuel_surcharge: "1000",
      }), // gross 10000, fsc 1000
    ];
    const r = fuelVsRevenue(entries, loads);
    expect(r.months).toHaveLength(1);
    const jun = r.months[0];
    expect(jun.month).toBe("2026-06");
    expect(jun.fuelSpend).toBeCloseTo(800, 2);
    expect(jun.gross).toBeCloseTo(10000, 2);
    expect(jun.fsc).toBeCloseTo(1000, 2);
    expect(jun.fuelPctGross).toBeCloseTo(0.08, 4); // 800 / 10000
    expect(jun.fscCoverage).toBeCloseTo(1.25, 4); // 1000 / 800 → surcharge covered fuel
    expect(r.latest?.month).toBe("2026-06");
  });

  it("flags a month where the surcharge no longer covers the fuel", () => {
    const entries = [
      fuel({ fuel_date: "2026-07-05", gallons: 100, price_per_gallon: 4.5 }),
    ]; // $450
    const loads = [
      load({
        delivery_date: "2026-07-10",
        linehaul: "9700",
        fuel_surcharge: "300",
      }),
    ];
    const r = fuelVsRevenue(entries, loads);
    expect(r.months[0].fscCoverage).toBeCloseTo(300 / 450, 4); // 0.67 — under-covered
  });

  it("EXCLUDES months with delivered loads but no logged fuel (no false 0%)", () => {
    const entries = [fuel({ fuel_date: "2026-06-10" })]; // only June has fuel
    const loads = [
      load({ delivery_date: "2026-04-15" }), // April: revenue but no fuel logged
      load({ delivery_date: "2026-06-15" }),
    ];
    const r = fuelVsRevenue(entries, loads);
    expect(r.months.map((m) => m.month)).toEqual(["2026-06"]); // April absent
  });

  it("orders months chronologically and picks the latest", () => {
    const entries = [
      fuel({ fuel_date: "2026-07-02" }),
      fuel({ fuel_date: "2026-05-02" }),
      fuel({ fuel_date: "2026-06-02" }),
    ];
    const r = fuelVsRevenue(entries, []);
    expect(r.months.map((m) => m.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(r.latest?.month).toBe("2026-07");
  });

  it("returns nothing when no fuel is logged", () => {
    const r = fuelVsRevenue([], [load({})]);
    expect(r.months).toEqual([]);
    expect(r.latest).toBeNull();
  });

  it("leaves %-of-gross null when a fuel month has no delivered revenue", () => {
    const r = fuelVsRevenue([fuel({ fuel_date: "2026-06-10" })], []);
    expect(r.months[0].fuelPctGross).toBeNull();
    expect(r.months[0].fscCoverage).toBeCloseTo(0, 4); // fsc 0 / spend
  });
});
