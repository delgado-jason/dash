import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { fuelVsRevenue, FSC_BASE_MPG } from "./fuelRevenue";

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
    filled_to_top: true,
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
    // Expected ≈ (4.942 − 1.29)/4.942 × 0.687 ≈ 50.8% — his actual 53.3%
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
    const m = fuelVsRevenue(entries, loads, FSC_BASE_MPG).months[0]; // MPG at the schedule's base: no bonus
    expect(m.expectedCoverage).toBeCloseTo(((4.942 - 1.29) / 4.942) * 0.687, 3);
    expect(m.fscCoverage!).toBeGreaterThan(m.expectedCoverage!); // on par
  });

  it("your MPG above the schedule's base (5.81, FSC-01) raises the bar (the bonus is yours to collect)", () => {
    const entries = [fuel({ gallons: 1000, price_per_gallon: 4.0 })];
    const loads = [load({ loaded_miles: 800, deadhead_miles: 200, fuel_surcharge: "1500" })];
    const atBase = fuelVsRevenue(entries, loads, FSC_BASE_MPG).months[0].expectedCoverage!;
    const atPlusTen = fuelVsRevenue(entries, loads, FSC_BASE_MPG * 1.1).months[0].expectedCoverage!;
    expect(atPlusTen / atBase).toBeCloseTo(1.1, 5);
    // No MPG data → no bonus claimed, the term drops to 1.
    expect(fuelVsRevenue(entries, loads, null).months[0].expectedCoverage!).toBeCloseTo(atBase, 5);
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

describe("fuelVsRevenue — headline is the last COMPLETE month", () => {
  const nov7 = new Date(2026, 10, 7);
  const entries = [
    fuel({ fuel_date: "2026-09-10" }),
    fuel({ fuel_date: "2026-10-10" }),
    fuel({ fuel_date: "2026-11-03" }),
  ];

  it("on Nov 7 the headline is October and November is the so-far line", () => {
    const r = fuelVsRevenue(entries, [], null, nov7);
    expect(r.headline?.month).toBe("2026-10");
    expect(r.soFar?.month).toBe("2026-11");
  });

  it("no fuel yet in the running month: headline October, no so-far line", () => {
    const r = fuelVsRevenue(entries.slice(0, 2), [], null, nov7);
    expect(r.headline?.month).toBe("2026-10");
    expect(r.soFar).toBeNull();
  });

  it("only the running month has fuel: it headlines, with no so-far line", () => {
    const r = fuelVsRevenue(entries.slice(2), [], null, nov7);
    expect(r.headline?.month).toBe("2026-11");
    expect(r.soFar).toBeNull();
  });

  it("no months at all", () => {
    const r = fuelVsRevenue([], [], null, nov7);
    expect(r.headline).toBeNull();
    expect(r.soFar).toBeNull();
  });
});

describe("par on Landstar's pasted table (GL-155)", () => {
  const BANDS = [
    { low: 4.0, high: 4.499, cpm: 0.6 },
    { low: 4.5, high: 4.999, cpm: 0.7 },
    { low: 5.0, high: null, cpm: 0.78 },
  ];
  const table = (effective_from: string) => ({ schedule_id: effective_from, effective_from, bands: BANDS, note: null, created_at: "" });
  const now = new Date(2026, 10, 7); // Nov 7, 2026 — June is a past month
  const entries = [fuel({ fuel_date: "2026-06-10", gallons: 1000, price_per_gallon: 4.5 })]; // $4,500 of fuel
  const loads = [load({ delivery_date: "2026-06-15", loaded_miles: 5000, deadhead_miles: 1000, fuel_surcharge: "3000" })];

  it("a table in force and the month's national price → loaded miles × the band, over the spend", () => {
    const r = fuelVsRevenue(entries, loads, FSC_BASE_MPG, now, {
      schedules: [table("2026-04-01")],
      dieselByMonth: new Map([["2026-06", 4.7]]),
      latestDiesel: { price: 5.153, period: "2026-11-02" },
    });
    const m = r.months[0];
    expect(m.par).toMatchObject({ kind: "table", effective_from: "2026-04-01", price: 4.7, priceIsThisWeek: false, cpm: 0.7 });
    expect(m.par.kind === "table" && m.par.expectedFsc).toBeCloseTo(3500, 6); // 5,000 loaded × 70¢
    expect(m.expectedCoverage).toBeCloseTo(3500 / 4500, 6);
  });

  it("the running month reads this week's price; a past month never does", () => {
    const r = fuelVsRevenue(
      [fuel({ fuel_date: "2026-11-03", gallons: 100, price_per_gallon: 5 })],
      [load({ delivery_date: "2026-11-04", loaded_miles: 1000, deadhead_miles: 0, fuel_surcharge: "700" })],
      6,
      now,
      { schedules: [table("2026-10-01")], dieselByMonth: new Map([["2026-11", 4.2]]), latestDiesel: { price: 5.153, period: "2026-11-02" } },
    );
    expect(r.months[0].par).toMatchObject({ kind: "table", price: 5.153, priceIsThisWeek: true, cpm: 0.78 });
  });

  it("a table but no national price for the month → unknown, named; never the estimate behind the table's name", () => {
    const r = fuelVsRevenue(entries, loads, FSC_BASE_MPG, now, { schedules: [table("2026-04-01")], dieselByMonth: new Map(), latestDiesel: null });
    expect(r.months[0].par).toEqual({ kind: "unknown", reason: "no national diesel price for Jun 2026" });
    expect(r.months[0].expectedCoverage).toBeNull();
  });

  it("a price below the table's first band → unknown, named", () => {
    const r = fuelVsRevenue(entries, loads, FSC_BASE_MPG, now, { schedules: [table("2026-04-01")], dieselByMonth: new Map([["2026-06", 3.5]]), latestDiesel: null });
    expect(r.months[0].par).toEqual({ kind: "unknown", reason: "$3.500 is below the table's first band" });
  });

  it("no table in force for the month → the peg estimate, labelled", () => {
    const r = fuelVsRevenue(entries, loads, FSC_BASE_MPG, now, { schedules: [table("2026-07-01")], dieselByMonth: new Map([["2026-06", 4.7]]), latestDiesel: null });
    expect(r.months[0].par).toEqual({ kind: "estimate" });
    expect(r.months[0].expectedCoverage).toBeCloseTo(((4.5 - 1.29) / 4.5) * (5000 / 6000), 6);
    expect(fuelVsRevenue(entries, loads, FSC_BASE_MPG, now).months[0].par).toEqual({ kind: "estimate" }); // no inputs at all
  });
});
