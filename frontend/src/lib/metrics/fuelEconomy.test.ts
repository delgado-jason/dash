import { describe, it, expect } from "vitest";
import {
  isFull,
  entryCost,
  mpgWindows,
  fuelStats,
  avgWeeklyCost,
  weeklyCostSeries,
} from "./fuelEconomy";

const e = (
  odometer_reading: number,
  gallons: number,
  price_per_gallon: number,
  fuel_date: string,
) => ({ odometer_reading, gallons, price_per_gallon, fuel_date });

// First four real fill-ups from the Fuelly export → one complete MPG window.
const first4 = [
  e(570368, 131.91, 4.639, "2026-05-24"), // full (opens the window)
  e(570967, 79.78, 4.589, "2026-05-26"), // partial
  e(571651, 114.425, 4.462, "2026-05-28"), // <120 → partial (Fuelly says "Full")
  e(572503, 135.1, 4.322, "2026-05-30"), // full (closes the window)
];

describe("isFull", () => {
  it("uses the 120-gallon threshold, not Fuelly's column", () => {
    expect(isFull(e(0, 131.91, 4, "2026-01-01"))).toBe(true);
    expect(isFull(e(0, 120, 4, "2026-01-01"))).toBe(true);
    expect(isFull(e(0, 114.425, 4, "2026-01-01"))).toBe(false);
    expect(isFull(e(0, 84.63, 4, "2026-01-01"))).toBe(false);
  });
});

describe("entryCost", () => {
  it("is gallons × price", () => {
    expect(entryCost(e(0, 100, 4.5, "2026-01-01"))).toBeCloseTo(450);
  });
});

describe("mpgWindows", () => {
  it("closes a window on each full, counting partials since the last full", () => {
    const w = mpgWindows(first4);
    expect(w).toHaveLength(1);
    expect(w[0].miles).toBe(2135); // 572503 - 570368
    expect(w[0].gallons).toBeCloseTo(329.305); // 79.78 + 114.425 + 135.1
    expect(w[0].mpg).toBeCloseTo(6.483, 2);
  });

  it("ignores fills before the first full (no baseline)", () => {
    const w = mpgWindows([e(1000, 80, 4, "2026-01-01"), ...first4]);
    expect(w).toHaveLength(1); // the leading partial is dropped
  });
});

describe("fuelStats", () => {
  it("aggregates miles, gallons, MPG, and per-gallon cost", () => {
    const s = fuelStats(first4, new Date("2026-06-01T00:00:00.000Z"));
    expect(s.totalMiles).toBe(2135);
    expect(s.avgMpg).toBeCloseTo(6.483, 2);
    expect(s.totalGallons).toBeCloseTo(461.215); // all four fills
    expect(s.avgCostPerGallon).toBeCloseTo(s.totalSpend / s.totalGallons);
  });
});

describe("avgWeeklyCost", () => {
  it("divides last-90-day spend by the weeks of data present", () => {
    // Two fills a week apart, $700 each → ~$700/week over a 1-week span.
    const now = new Date("2026-06-15T00:00:00.000Z");
    const entries = [
      e(1000, 100, 7, "2026-06-01"),
      e(1500, 100, 7, "2026-06-08"),
    ];
    const w = avgWeeklyCost(entries, now);
    expect(w).not.toBeNull();
    expect(w!).toBeGreaterThan(600);
  });
  it("returns null with nothing in the window", () => {
    expect(avgWeeklyCost([], new Date("2026-06-15T00:00:00Z"))).toBeNull();
  });
});

describe("weeklyCostSeries", () => {
  it("buckets spend by ISO week, oldest first", () => {
    const s = weeklyCostSeries(first4);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].weekStart <= s[s.length - 1].weekStart).toBe(true);
  });
});
