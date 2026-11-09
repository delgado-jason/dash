import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import { milesHistory, peakDriven } from "./milesHistory";

const NOW = new Date("2026-11-09T12:00:00Z"); // November is the month in progress
const NOTES = 2000;
const KEEP = 0.75;

const load = (over: Partial<Load>): Load =>
  ({
    load_id: Math.random().toString(36).slice(2),
    load_status: "delivered",
    delivery_date: "2026-09-10",
    pickup_date: "2026-09-08",
    odometer_start: 1000,
    odometer_end: 2000,
    loaded_miles: 800,
    linehaul: "3000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as unknown as Load;

const trip = (over: Partial<Trip>): Trip =>
  ({
    trip_id: Math.random().toString(36).slice(2),
    trip_date: "2026-10-15",
    trip_purpose: "repositioning",
    odometer_start: 4000,
    odometer_end: 4500,
    ...over,
  }) as unknown as Trip;

const period = (ym: string, cogs: number | null, expense: number | null): ExpensePeriod =>
  ({
    period_month: `${ym}-01`,
    cogs_total: cogs,
    expense_total: expense,
  }) as unknown as ExpensePeriod;

// Sep · 1,000 driven / 800 loaded · FILED (5,000 + 5,000 + 2,000 notes = 12,000)
// Oct · 1,500 driven / 900 loaded · UNFILED
// Nov · 400 driven / 400 loaded · in progress, unfiled
const LOADS: Load[] = [
  load({ delivery_date: "2026-09-10", odometer_start: 1000, odometer_end: 2000, loaded_miles: 800 }),
  load({ delivery_date: "2026-10-10", odometer_start: 3000, odometer_end: 4000, loaded_miles: 900 }),
  load({ delivery_date: "2026-11-05", odometer_start: 5000, odometer_end: 5400, loaded_miles: 400 }),
];
const TRIPS: Trip[] = [trip({ trip_date: "2026-10-15", odometer_start: 4000, odometer_end: 4500 })];
const PERIODS: ExpensePeriod[] = [period("2026-09", 5000, 5000)];

const run = (months = 3) =>
  milesHistory(LOADS, TRIPS, PERIODS, NOTES, KEEP, NOW, months);

describe("milesHistory", () => {
  const rows = run();
  const at = (label: string) => rows.find((r) => r.label === label)!;

  it("runs the last N months and ENDS on the month in progress", () => {
    expect(rows.map((r) => r.longLabel)).toEqual(["Sep ’26", "Oct ’26", "Nov ’26"]);
    expect(at("Nov").inProgress).toBe(true);
    expect(at("Sep").inProgress).toBe(false);
  });

  it("takes driven miles off the odometer, over loads AND trips", () => {
    expect(at("Sep").driven).toBe(1000);
    expect(at("Oct").driven).toBe(1500); // the 1,000-mi load plus the 500-mi trip
    expect(at("Oct").loaded).toBe(900);
    expect(at("Oct").empty).toBe(600);
    expect(at("Oct").emptyShare).toBeCloseTo(600 / 1500, 10);
  });

  it("turns a filed month's cost into the rate those miles forced", () => {
    const sep = at("Sep");
    expect(sep.filed).toBe(true);
    expect(sep.cost).toBe(12000); // 5,000 + 5,000 + 2,000 of notes
    // 12,000 ÷ 1,000 driven = $12.00 a mile, ÷ 0.75 keep = $16.00 to book
    expect(sep.breakEven).toBeCloseTo(16, 10);
  });

  it("the adverse case: an unfiled month keeps its BARS and loses only its floor", () => {
    const oct = at("Oct");
    expect(oct.filed).toBe(false);
    expect(oct.cost).toBeNull();
    expect(oct.breakEven).toBeNull(); // the gap in the line is the signal
    expect(oct.driven).toBe(1500); // ...but the bars are still there
    expect(oct.loaded).toBe(900);
  });

  it("a month saved with only ONE total is unfiled — one null is the same lie", () => {
    const half = milesHistory(LOADS, TRIPS, [period("2026-09", 5000, null)], NOTES, KEEP, NOW, 3);
    const sep = half.find((r) => r.label === "Sep")!;
    expect(sep.filed).toBe(false);
    expect(sep.breakEven).toBeNull();
    expect(sep.driven).toBe(1000);
  });

  it("counts an overlapping load and trip ONCE", () => {
    // the load runs 1000→2000; the trip 1500→2500 overlaps it by 500
    const overlapped = milesHistory(
      [load({ delivery_date: "2026-09-10", odometer_start: 1000, odometer_end: 2000, loaded_miles: 800 })],
      [trip({ trip_date: "2026-09-12", odometer_start: 1500, odometer_end: 2500 })],
      PERIODS,
      NOTES,
      KEEP,
      NOW,
      3,
    );
    // 1,000 + the 500 that sticks out past the load, not 2,000
    expect(overlapped.find((r) => r.label === "Sep")!.driven).toBe(1500);
  });

  it("a month with nothing logged at all is a real zero", () => {
    const blank = milesHistory([], [], PERIODS, NOTES, KEEP, NOW, 3);
    const sep = blank.find((r) => r.label === "Sep")!;
    expect(sep.driven).toBe(0);
    expect(sep.loaded).toBe(0);
    expect(sep.empty).toBe(0);
    expect(sep.emptyShare).toBeNull(); // not 0% empty — unknown
    expect(sep.measured).toBe(false);
    expect(sep.hasActivity).toBe(false); // nothing ran: the chart may print 0
    expect(sep.filed).toBe(true); // the P&L is filed...
    expect(sep.breakEven).toBeNull(); // ...but no miles means no rate per mile
  });

  it("REAL FREIGHT with no odometer reading is an UNKNOWN, not a zero", () => {
    // Caught on the dev stack: a month carrying 6,332 loaded miles whose loads
    // had no usable odometer span rendered as "0 driven". monthMiles returns 0
    // for "nothing ran" AND for "nobody logged the odometer"; printing 0 for
    // the second claims the truck sat still.
    const unmeasured = milesHistory(
      [
        load({
          delivery_date: "2026-09-10",
          odometer_start: null as unknown as number,
          odometer_end: null as unknown as number,
          loaded_miles: 6332,
        }),
      ],
      [],
      PERIODS,
      NOTES,
      KEEP,
      NOW,
      3,
    );
    const sep = unmeasured.find((r) => r.label === "Sep")!;
    expect(sep.driven).toBe(0);
    expect(sep.loaded).toBe(6332); // the freight is real
    expect(sep.measured).toBe(false); // ...the distance is not known
    expect(sep.hasActivity).toBe(true); // so the chart prints "—", never "0"
    expect(sep.breakEven).toBeNull(); // and no floor can be computed
  });

  it("a logged TRIP alone counts as activity", () => {
    const tripOnly = milesHistory(
      [],
      [trip({ trip_date: "2026-09-12", odometer_start: null as unknown as number, odometer_end: null as unknown as number })],
      PERIODS,
      NOTES,
      KEEP,
      NOW,
      3,
    );
    const sep = tripOnly.find((r) => r.label === "Sep")!;
    expect(sep.measured).toBe(false);
    expect(sep.hasActivity).toBe(true);
  });

  it("marks a normal month as measured", () => {
    expect(at("Sep").measured).toBe(true);
    expect(at("Sep").hasActivity).toBe(true);
  });

  it("never draws a negative empty segment", () => {
    // loaded_miles logged ABOVE the odometer span — a real data oddity
    const odd = milesHistory(
      [load({ delivery_date: "2026-09-10", odometer_start: 1000, odometer_end: 2000, loaded_miles: 1200 })],
      [],
      PERIODS,
      NOTES,
      KEEP,
      NOW,
      3,
    );
    expect(odd.find((r) => r.label === "Sep")!.empty).toBe(0);
  });

  it("has no floor at all without a keep", () => {
    const noKeep = milesHistory(LOADS, TRIPS, PERIODS, NOTES, null, NOW, 3);
    expect(noKeep.every((r) => r.breakEven == null)).toBe(true);
    expect(noKeep.find((r) => r.label === "Sep")!.cost).toBe(12000); // the cost still reads
  });

  it("crosses the year boundary", () => {
    const rows14 = milesHistory(LOADS, TRIPS, PERIODS, NOTES, KEEP, NOW, 14);
    expect(rows14).toHaveLength(14);
    expect(rows14[0].longLabel).toBe("Oct ’25");
    expect(rows14[rows14.length - 1].longLabel).toBe("Nov ’26");
  });
});

describe("peakDriven", () => {
  it("is the tallest bar, and 0 on an empty book", () => {
    expect(peakDriven(run())).toBe(1500);
    expect(peakDriven([])).toBe(0);
  });
});
