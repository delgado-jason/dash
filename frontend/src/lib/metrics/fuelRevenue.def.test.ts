import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { fuelVsRevenue, coverGrade, coverageWord, type FuelMonth } from "./fuelRevenue";

const NOW = new Date("2026-07-15T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const fuel = (o: Partial<FuelEntry>): FuelEntry =>
  ({ fuel_date: "2026-06-10", gallons: 100, price_per_gallon: 4, filled_to_top: true, kind: "diesel", ...o }) as FuelEntry;
const load = (o: Partial<Load>): Load =>
  ({ load_status: "delivered", delivery_date: "2026-06-15", linehaul: "9000", fuel_surcharge: "1000", total_accessorials: "0", ...o }) as unknown as Load;

describe("fuelVsRevenue — DEF (the Fuel page sheet, call 6)", () => {
  it("DEF is in the month's fuel spend and out of its gallons, fills and $/gal", () => {
    const entries = [
      fuel({ gallons: 100, price_per_gallon: 4.0 }), // $400 diesel
      fuel({ gallons: 10, price_per_gallon: 3.0, kind: "def", filled_to_top: false }), // $30 DEF
    ];
    const m = fuelVsRevenue(entries, [load({ loaded_miles: 800, deadhead_miles: 200 })], 6).months[0];
    expect(m.fuelSpend).toBeCloseTo(430, 6);
    expect(m.gallons).toBeCloseTo(100, 6);
    expect(m.fills).toBe(1);
    expect(m.ppg).toBeCloseTo(4.0, 6);
    // the estimate par reads the DIESEL price, the coverage reads the whole spend
    expect(m.expectedCoverage).toBeCloseTo(((4.0 - 1.29) / 4.0) * 0.8 * (6 / 5.81), 6);
    expect(m.fscCoverage).toBeCloseTo(1000 / 430, 6);
  });

  it("a month of DEF alone has a spend, no gallons and no price — and no estimate par", () => {
    const m = fuelVsRevenue([fuel({ gallons: 10, price_per_gallon: 3.0, kind: "def", filled_to_top: false })], [load({})], 6).months[0];
    expect(m.fuelSpend).toBeCloseTo(30, 6);
    expect(m.gallons).toBe(0);
    expect(m.fills).toBe(0);
    expect(m.ppg).toBeNull();
    expect(m.expectedCoverage).toBeNull();
  });
});

describe("coverGrade · coverageWord", () => {
  const month = (o: Partial<FuelMonth>): FuelMonth =>
    ({ month: "2026-10", fuelSpend: 3164, gallons: 563, fills: 5, ppg: 5.62, net: 20000, fsc: 2967, fuelPctNet: 0.158, fscCoverage: 2967 / 3164, expectedCoverage: 0.73, par: { kind: "estimate" }, ...o }) as FuelMonth;

  it("grades against par, never against 100%", () => {
    expect(coverGrade(0.94, 0.73)).toBe("par");
    expect(coverGrade(0.55, 0.58)).toBe("close");
    expect(coverGrade(0.65, 0.79)).toBe("short");
    expect(coverGrade(null, 0.79)).toBe("unknown");
    expect(coverGrade(0.65, null)).toBe("unknown");
  });

  it("says the read in the sheet's words, the shortfall in dollars under par", () => {
    expect(coverageWord(month({}))).toEqual({ grade: "par", word: "on par" });
    expect(coverageWord(month({ fuelSpend: 5212, fsc: 2777, fscCoverage: 2777 / 5212, expectedCoverage: 0.58 }))).toEqual({ grade: "close", word: "near par" });
    // September: 65% against 79% — par owed 0.79 × $8,943 = $7,065; $5,855 came in
    expect(coverageWord(month({ fuelSpend: 8943, fsc: 5855, fscCoverage: 5855 / 8943, expectedCoverage: 0.79 }))).toEqual({ grade: "short", word: "short · $1,210 under par" });
    expect(coverageWord(month({ expectedCoverage: null, par: { kind: "unknown", reason: "no national diesel price for Oct 2026" } }))).toEqual({ grade: "unknown", word: "par unknown" });
    expect(coverageWord(month({}), true)).toEqual({ grade: "unknown", word: "par unavailable" });
    expect(coverageWord(month({ fuelSpend: 0, fscCoverage: null }))).toEqual({ grade: "unknown", word: "no fuel logged" });
  });
});
