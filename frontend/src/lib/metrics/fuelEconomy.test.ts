import { describe, it, expect } from "vitest";
import {
  isFull,
  entryCost,
  mpgWindows,
  fuelStats,
  avgWeeklyCost,
  monthlyFuelPrice,
  dieselChartData,
  maxFuelOdometer,
  latestTankRecap,
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

describe("monthlyFuelPrice", () => {
  it("is the gallon-weighted average price per month, ascending", () => {
    const entries = [
      e(0, 100, 4.0, "2026-05-10"), // May: 100 gal @ $4.00
      e(0, 300, 5.0, "2026-05-20"), // May: 300 gal @ $5.00 → weighted $4.75
      e(0, 100, 3.5, "2026-06-05"), // Jun: $3.50
    ];
    const m = monthlyFuelPrice(entries);
    expect(m.map((x) => x.month)).toEqual(["2026-05", "2026-06"]);
    expect(m[0].avgPrice).toBeCloseTo(4.75, 5); // (400 + 1500) / 400
    expect(m[1].avgPrice).toBeCloseTo(3.5, 5);
  });
});

describe("dieselChartData", () => {
  it("joins his monthly avg with national by month; national null when missing", () => {
    const entries = [
      e(0, 100, 4.0, "2026-05-10"),
      e(0, 100, 3.5, "2026-06-05"),
    ];
    const national = [{ month: "2026-05", value: 4.2 }]; // no June national
    const rows = dieselChartData(entries, national);
    expect(rows.map((r) => r.month)).toEqual(["2026-05", "2026-06"]);
    expect(rows[0].you).toBeCloseTo(4.0, 5);
    expect(rows[0].national).toBeCloseTo(4.2, 5);
    expect(rows[1].national).toBeNull();
  });
});

describe("maxFuelOdometer", () => {
  it("returns the highest reading regardless of order", () => {
    expect(maxFuelOdometer(first4)).toBe(572503);
  });
  it("returns null with no fill-ups", () => {
    expect(maxFuelOdometer([])).toBeNull();
  });
});

describe("latestTankRecap", () => {
  const now = new Date("2026-08-01T00:00:00Z");
  // Fulls only (120 gal each, ≥ the threshold) so each closes a window with
  // mpg = miles / 120. Pass the per-tank MPGs you want; the opener is implicit.
  const tanks = (mpgs: number[], price = 5) => {
    const gal = 120;
    let odo = 100000;
    const es = [e(odo, gal, price, "2026-06-01")]; // opening full
    mpgs.forEach((m, i) => {
      odo += m * gal;
      es.push(e(odo, gal, price, `2026-06-${String(2 + i).padStart(2, "0")}`));
    });
    return es;
  };

  it("returns null before any full tank has closed", () => {
    const stats = fuelStats([e(100000, 130, 5, "2026-06-01")], now); // opens, never closes
    expect(latestTankRecap(stats, [])).toBeNull();
  });

  it("scores the latest tank vs average and vs last tank", () => {
    const r = latestTankRecap(fuelStats(tanks([5, 7, 7, 7]), now), [])!; // avg 6.5
    expect(r.tank.mpg).toBeCloseTo(7, 5);
    expect(r.mpgVsAvg).toBeCloseTo(0.5, 5);
    expect(r.mpgVsLast).toBeCloseTo(0, 5);
    expect(r.streak).toBe(3); // 7,7,7 ≥ avg; the 5 breaks it
  });

  it("flags a record only when it strictly beats every prior tank", () => {
    const r = latestTankRecap(fuelStats(tanks([5.5, 5.5, 6.5]), now), [])!;
    expect(r.isRecord).toBe(true);
    expect(r.mpgVsLast).toBeCloseTo(1.0, 5);
  });

  it("does not flag a record on a tie, nor on the first completed tank", () => {
    expect(latestTankRecap(fuelStats(tanks([7, 7]), now), [])!.isRecord).toBe(false);
    const first = latestTankRecap(fuelStats(tanks([6]), now), [])!;
    expect(first.isRecord).toBe(false);
    expect(first.mpgVsLast).toBeNull();
  });

  it("compares tank $/gal to the national price for its month, null when absent", () => {
    const stats = fuelStats(tanks([6], 5.0), now); // tank ppg = 5.00, month 2026-06
    expect(
      latestTankRecap(stats, [{ month: "2026-06", value: 5.2 }])!.ppgVsNational,
    ).toBeCloseTo(-0.2, 5);
    expect(
      latestTankRecap(stats, [{ month: "2020-01", value: 3 }])!.ppgVsNational,
    ).toBeNull();
  });
});
