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

// loadRevenue uses net_revenue when present (what the business keeps after the
// carrier's cut), else falls back to gross. Set net_revenue to exercise net.
const load = (o: Partial<Load>): Load =>
  ({
    load_status: "delivered",
    delivery_date: "2026-06-15",
    linehaul: "9000",
    fuel_surcharge: "1000",
    total_accessorials: "0",
    ...o,
  }) as unknown as Load;

describe("fuelVsRevenue — expectedCoverage (the FSC standard)", () => {
  it("par = (price − peg)/price × loaded share × MPG bonus — Jason's August shape", () => {
    // ~August 2026: $4.942/gal blended, 68.7% loaded share, MPG ≈ base.
    // Expected ≈ (4.942 − 1.25)/4.942 × 0.687 ≈ 51.3% — his actual 53.3%
    // coverage is ON PAR, not "short of 100%" like the old red stamp claimed.
    const entries = [fuel({ fuel_date: "2026-06-10", gallons: 1000, price_per_gallon: 4.942 })];
    const loads = [
      load({
        delivery_date: "2026-06-15",
        fuel_surcharge: "2634", // 53.3% of $4,942 fuel
        loaded_miles: 687,
        deadhead_miles: 313, // driven 1000 → loaded share .687
      }),
    ];
    const m = fuelVsRevenue(entries, loads, 6.0).months[0];
    expect(m.expectedCoverage).toBeCloseTo(((4.942 - 1.25) / 4.942) * 0.687, 3);
    expect(m.fscCoverage!).toBeGreaterThan(m.expectedCoverage!); // on par
  });

  it("your MPG above the schedule's 6.0 base raises the bar (the bonus is yours to collect)", () => {
    const entries = [fuel({ gallons: 1000, price_per_gallon: 4.0 })];
    const loads = [load({ loaded_miles: 800, deadhead_miles: 200, fuel_surcharge: "1500" })];
    const at6 = fuelVsRevenue(entries, loads, 6.0).months[0].expectedCoverage!;
    const at66 = fuelVsRevenue(entries, loads, 6.6).months[0].expectedCoverage!;
    expect(at66 / at6).toBeCloseTo(1.1, 5);
    // No MPG data → no bonus claimed, the term drops to 1.
    expect(fuelVsRevenue(entries, loads, null).months[0].expectedCoverage!).toBeCloseTo(at6, 5);
  });

  it("null when the bar can't be computed: price at/below the peg, or no driven miles", () => {
    const cheap = [fuel({ gallons: 100, price_per_gallon: 1.2 })]; // under the $1.25 peg
    const loads = [load({ loaded_miles: 500, deadhead_miles: 100 })];
    expect(fuelVsRevenue(cheap, loads, 6).months[0].expectedCoverage).toBeNull();
    const noMiles = [load({ loaded_miles: 0, deadhead_miles: 0 })];
    expect(
      fuelVsRevenue([fuel({ gallons: 100, price_per_gallon: 4 })], noMiles, 6).months[0]
        .expectedCoverage,
    ).toBeNull();
  });
});

describe("fuelVsRevenue", () => {
  it("computes fuel %-of-NET and surcharge coverage per month", () => {
    const entries = [
      fuel({ fuel_date: "2026-06-05", gallons: 100, price_per_gallon: 4 }), // $400
      fuel({ fuel_date: "2026-06-20", gallons: 100, price_per_gallon: 4 }), // $400 → June $800
    ];
    const loads = [
      // gross would be 10000, but net (what the business keeps) is 7300.
      load({
        delivery_date: "2026-06-15",
        linehaul: "9000",
        fuel_surcharge: "1000",
        net_revenue: "7300",
      }),
    ];
    const r = fuelVsRevenue(entries, loads);
    expect(r.months).toHaveLength(1);
    const jun = r.months[0];
    expect(jun.month).toBe("2026-06");
    expect(jun.fuelSpend).toBeCloseTo(800, 2);
    expect(jun.net).toBeCloseTo(7300, 2); // NET, not the 10000 gross
    expect(jun.fsc).toBeCloseTo(1000, 2);
    expect(jun.fuelPctNet).toBeCloseTo(800 / 7300, 4); // 11.0%, not 8% of gross
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

  it("leaves %-of-net null when a fuel month has no delivered revenue", () => {
    const r = fuelVsRevenue([fuel({ fuel_date: "2026-06-10" })], []);
    expect(r.months[0].fuelPctNet).toBeNull();
    expect(r.months[0].fscCoverage).toBeCloseTo(0, 4); // fsc 0 / spend
  });
});
