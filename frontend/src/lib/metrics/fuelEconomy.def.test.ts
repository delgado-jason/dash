import { describe, it, expect } from "vitest";
import {
  mpgWindows,
  fuelStats,
  isFull,
  isDef,
  monthlyFuelPrice,
  latestTankRecap,
  priceVsNational,
  nationalVerdict,
  lastReading,
  lastApuReading,
} from "./fuelEconomy";

// DEF as a kind (migration 113; the Fuel page sheet, call 6, nodded
// 2026-11-15): gallons and a total, never a tank, never MPG, always cost per mile.
const d = (odometer_reading: number, gallons: number, price_per_gallon: number, fuel_date: string, filled_to_top = true) => ({
  odometer_reading,
  gallons,
  price_per_gallon,
  fuel_date,
  filled_to_top,
  kind: "diesel",
});
const def = (odometer_reading: number, gallons: number, price_per_gallon: number, fuel_date: string) => ({
  odometer_reading,
  gallons,
  price_per_gallon,
  fuel_date,
  filled_to_top: false,
  kind: "def",
});
const NOW = new Date("2026-11-15T00:00:00Z");

describe("DEF — a kind, never a tank", () => {
  // 600 miles on 100 gallons of diesel at $5 ($500) → 6.0 MPG; 10 gallons of
  // DEF at $3 ($30) bought inside the window.
  const book = [d(100000, 100, 5, "2026-11-01"), def(100300, 10, 3, "2026-11-03"), d(100600, 100, 5, "2026-11-05")];

  it("adds its dollars to the window and nothing to its gallons or its MPG", () => {
    const w = mpgWindows(book);
    expect(w).toHaveLength(1);
    expect(w[0].gallons).toBeCloseTo(100, 6);
    expect(w[0].mpg).toBeCloseTo(6, 6);
    expect(w[0].cost).toBeCloseTo(500, 6);
    expect(w[0].defCost).toBeCloseTo(30, 6);
  });

  it("cost per mile is what left the pocket; the price and MPG factors stay diesel", () => {
    const s = fuelStats(book, NOW);
    expect(s.costPerMile30).toBeCloseTo(530 / 600, 6);
    expect(s.defPerMile30).toBeCloseTo(30 / 600, 6);
    expect(s.mpg30).toBeCloseTo(6, 6);
    expect(s.avgCostPerGallon30).toBeCloseTo(5, 6);
    // the diesel factors divide back to the diesel rate — the one rate less its DEF share
    expect(s.avgCostPerGallon30! / s.mpg30!).toBeCloseTo(s.costPerMile30! - s.defPerMile30!, 10);
    expect(s.paidPerGallon30).toBeCloseTo(5, 6);
    expect(s.avgCostPerGallon).toBeCloseTo(5, 6);
    expect(s.totalGallons).toBeCloseTo(200, 6);
    expect(s.defGallons).toBeCloseTo(10, 6);
    expect(s.totalSpend).toBeCloseTo(1030, 6);
    expect(s.dieselSpend).toBeCloseTo(1000, 6);
    expect(s.defSpend).toBeCloseTo(30, 6);
    expect(s.entryCount).toBe(3);
    expect(s.defCount).toBe(1);
  });

  it("never opens or closes a window, whatever its tick says", () => {
    expect(isDef(def(1, 1, 1, "2026-01-01"))).toBe(true);
    expect(isFull({ ...def(1, 1, 1, "2026-01-01"), filled_to_top: true })).toBe(false);
    // a ticked DEF cannot open the log; the diesel full after it opens, and nothing closes
    expect(mpgWindows([{ ...def(100000, 10, 3, "2026-11-01"), filled_to_top: true }, d(100600, 100, 5, "2026-11-05")])).toHaveLength(0);
    // a ticked DEF between two fulls does not split the window
    const w = mpgWindows([d(100000, 100, 5, "2026-11-01"), { ...def(100300, 10, 3, "2026-11-03"), filled_to_top: true }, d(100600, 100, 5, "2026-11-05")]);
    expect(w).toHaveLength(1);
    expect(w[0].miles).toBe(600);
  });

  it("after the last full it waits for the next window, as a partial does — but it is spent", () => {
    const s = fuelStats([...book, def(100700, 10, 3, "2026-11-06")], NOW);
    expect(s.costPerMile30).toBeCloseTo(530 / 600, 6);
    expect(s.defSpend).toBeCloseTo(60, 6);
    expect(s.totalSpend).toBeCloseTo(1060, 6);
  });

  it("the monthly $/gal line and the last tank's price are diesel; the tank's $/mile carries the DEF", () => {
    const m = monthlyFuelPrice(book);
    expect(m).toHaveLength(1);
    expect(m[0].avgPrice).toBeCloseTo(5, 6);
    const r = latestTankRecap(fuelStats(book, NOW), [])!;
    expect(r.pricePerGallon).toBeCloseTo(5, 6);
    expect(r.costPerMile).toBeCloseTo(530 / 600, 6);
  });

  it("defPerMile30 is a true 0 with no DEF bought, null with no recent window", () => {
    expect(fuelStats([d(100000, 100, 5, "2026-11-01"), d(100600, 100, 5, "2026-11-05")], NOW).defPerMile30).toBe(0);
    expect(fuelStats([], NOW).defPerMile30).toBeNull();
    expect(fuelStats([def(100000, 10, 3, "2026-11-01")], NOW)).toMatchObject({ costPerMile30: null, defPerMile30: null, totalGallons: 0, defGallons: 10, totalSpend: 30 });
  });

  it("an old caller with no kind is diesel", () => {
    const old = [
      { odometer_reading: 100000, gallons: 100, price_per_gallon: 5, fuel_date: "2026-11-01", filled_to_top: true },
      { odometer_reading: 100600, gallons: 100, price_per_gallon: 5, fuel_date: "2026-11-05", filled_to_top: true },
    ];
    expect(fuelStats(old, NOW).costPerMile30).toBeCloseTo(500 / 600, 6);
  });
});

describe("priceVsNational · nationalVerdict", () => {
  const entries = [
    d(1, 100, 4.0, "2026-05-10"),
    d(2, 100, 4.5, "2026-06-05"),
    d(3, 100, 5.0, "2026-07-05"),
    def(4, 10, 3.0, "2026-07-06"), // not diesel — never in the month's price
  ];

  it("rows run newest first with the dollar under the EIA, null where the EIA has none", () => {
    const rows = priceVsNational(entries, [
      { month: "2026-05", value: 5.11 },
      { month: "2026-06", value: 4.4 },
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-07", "2026-06", "2026-05"]);
    expect(rows[0].you).toBeCloseTo(5.0, 6);
    expect(rows[0].under).toBeNull();
    expect(rows[1].under).toBeCloseTo(-0.1, 6); // over by a dime
    expect(rows[2].under).toBeCloseTo(1.11, 6);
  });

  it("says how the priced months went", () => {
    const nat = (...vals: [string, number][]) => vals.map(([month, value]) => ({ month, value }));
    expect(nationalVerdict(priceVsNational(entries, []))).toBeNull();
    expect(nationalVerdict(priceVsNational(entries, nat(["2026-05", 5.11])))).toBe("under the national in the one month the EIA has priced");
    expect(nationalVerdict(priceVsNational(entries, nat(["2026-05", 3.0])))).toBe("over the national in the one month the EIA has priced");
    expect(nationalVerdict(priceVsNational(entries, nat(["2026-05", 5.11], ["2026-06", 5.0], ["2026-07", 6.0])))).toBe(
      "under the national every month since the log began",
    );
    expect(nationalVerdict(priceVsNational(entries, nat(["2026-05", 5.11], ["2026-06", 4.4])))).toBe("over the national in 1 of 2 months");
    expect(nationalVerdict(priceVsNational(entries, nat(["2026-05", 3.0], ["2026-06", 4.4])))).toBe("over the national every month since the log began");
  });
});

describe("lastReading · lastApuReading", () => {
  it("the newest fill by day, the higher reading on a two-stop day; null on an empty log", () => {
    expect(lastReading([])).toBeNull();
    expect(
      lastReading([
        { odometer_reading: 614438, fuel_date: "2026-11-14" },
        { odometer_reading: 614239, fuel_date: "2026-11-13" },
        { odometer_reading: 614500, fuel_date: "2026-11-14" }, // a second stop the same day
      ]),
    ).toEqual({ odometer: 614500, date: "2026-11-14" });
  });

  it("the newest APU reading, skipping fills where none was taken", () => {
    expect(lastApuReading([{ fuel_date: "2026-11-14", apu_hours: null }])).toBeNull();
    expect(
      lastApuReading([
        { fuel_date: "2026-10-07", apu_hours: 13755 },
        { fuel_date: "2026-11-14", apu_hours: null },
        { fuel_date: "2026-09-19", apu_hours: 13572 },
      ]),
    ).toEqual({ hours: 13755, date: "2026-10-07" });
  });
});
