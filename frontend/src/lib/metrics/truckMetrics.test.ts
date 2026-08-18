import { describe, it, expect } from "vitest";
import { computeTruckMetrics } from "./truckMetrics";
import type { Truck } from "@/types/truck";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceService } from "@/types/maintenance";

const load = (pickup_date: string, delivery_date: string): Load =>
  ({
    load_status: "delivered",
    payment_status: "paid",
    pickup_date,
    delivery_date,
    loaded_miles: 500,
    deadhead_miles: 0,
    linehaul: "1000",
    fuel_surcharge: "0",
    total_accessorials: "0",
  }) as unknown as Load;

const now = new Date("2026-02-01T00:00:00Z");
const run = (
  truck: Truck,
  loads: Load[],
  homeDays: string[] = [],
  travelDays: string[] = [],
  assetNote = 0,
  fuel: FuelEntry[] = [],
) =>
  computeTruckMetrics(
    truck,
    loads,
    fuel,
    [] as MaintenanceService[],
    now,
    homeDays,
    travelDays,
    assetNote,
  );

// A full-to-full pair (both ≥ the 120-gal threshold) closing one tank window:
// `miles` on `cost` dollars, dated by the closing fill.
const tankWindow = (
  openOdo: number,
  miles: number,
  cost: number,
  closeDate: string,
): FuelEntry[] =>
  [
    { odometer_reading: openOdo, gallons: 120, price_per_gallon: 4, fuel_date: "2026-01-02" },
    { odometer_reading: openOdo + miles, gallons: 120, price_per_gallon: cost / 120, fuel_date: closeDate },
  ] as unknown as FuelEntry[];

describe("computeTruckMetrics — days-based utilization", () => {
  it("splits days: under-load / home (incl. unmarked) / idle (travel, unloaded)", () => {
    const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
    const loads = [
      load("2026-01-05", "2026-01-07"), // 3 under-load days
      load("2026-01-10", "2026-01-10"), // 1 under-load day
    ];
    // 1 explicit home mark + 2 travel (full/half) days you weren't loaded
    const m = run(truck, loads, ["2026-01-15"], ["2026-01-20", "2026-01-21"]);

    // window 2026-01-05 → 2026-02-01 = 27 days. under-load 4, idle 2 (travel-unloaded),
    // home 21 (1 explicit + 20 unmarked days — the per-diem default).
    expect(m.windowDays).toBe(27);
    expect(m.underLoadDays).toBe(4);
    expect(m.idleDays).toBe(2);
    expect(m.homeDays).toBe(21);
    expect(m.underLoadDays + m.homeDays + m.idleDays).toBe(m.windowDays);
    expect(m.utilization).toBeCloseTo(4 / 27);
  });

  it("starts the window at the later of in-service and first load", () => {
    // in-service is AFTER the first pickup → days before it are not counted.
    const truck = { in_service_date: "2026-01-06", current_odometer: 0 } as Truck;
    const loads = [load("2026-01-05", "2026-01-07")]; // 01-05 is pre-window
    const m = run(truck, loads, []);
    expect(m.underLoadDays).toBe(2); // only 01-06 and 01-07
  });

  it("windowStart === today → 0-day window, split stays consistent (no phantom day)", () => {
    // Brand-new rig, first (same-day) load: window is [today, today) = 0 days. The
    // floored-to-1 window used to leave the 3-way split summing to 0 ≠ 1.
    const truck = { in_service_date: "2026-02-01", current_odometer: 0 } as Truck; // == now's day
    const m = run(truck, [load("2026-02-01", "2026-02-01")]);
    expect(m.windowDays).toBe(0);
    expect(m.underLoadDays + m.homeDays + m.idleDays).toBe(0);
    expect(m.utilization).toBeNull();
  });

  it("a home mark WINS over a load span that covers it", () => {
    const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
    const loads = [load("2026-01-05", "2026-01-07")]; // span 05–07
    const m = run(truck, loads, ["2026-01-06"]); // you marked 01-06 home
    expect(m.underLoadDays).toBe(2); // 01-05 + 01-07 only — 01-06 removed from hauling
    expect(m.idleDays).toBe(0); // no travel marks → no idle
    expect(m.homeDays).toBe(m.windowDays - 2); // 01-06 + every unmarked day is home
  });
});

describe("computeTruckMetrics — all-in cost to run (note)", () => {
  const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
  const loads = [load("2026-01-05", "2026-01-07")]; // 500 loaded miles, delivered+paid
  // 600 mi on $360 closing Jan 20 — inside 90 days of `now` → fuel $0.60/mi.
  const fuel = tankWindow(100000, 600, 360, "2026-01-20");

  it("no fuel logged → cost to run is NULL (fuel unknown), never a fuel-less total", () => {
    const m = run(truck, loads);
    expect(m.notePerMile).toBeNull();
    expect(m.fuelPerMile).toBeNull();
    expect(m.costToRunPerMile).toBeNull(); // not 0, not maint+note — unknown
  });

  it("no note passed → notePerMile is null, cost is operating only", () => {
    const m = run(truck, loads, [], [], 0, fuel);
    expect(m.notePerMile).toBeNull();
    // fuel $0.60 + maintenance $0 (none logged over 500 mi) — no note slice
    expect(m.costToRunPerMile).toBeCloseTo(0.6, 6);
  });

  it("folds the monthly note in as note ÷ miles-per-month", () => {
    const m = run(truck, loads, [], [], 1000, fuel); // $1,000/mo note
    expect(m.milesPerMonth).not.toBeNull();
    expect(m.notePerMile).toBeCloseTo(1000 / m.milesPerMonth!, 6);
    // fuel $0.60 + maint $0 + the note slice
    expect(m.costToRunPerMile).toBeCloseTo(0.6 + m.notePerMile!, 6);
  });
});

describe("computeTruckMetrics — fuel $/mi rides the 90-day tank windows", () => {
  const truck = { in_service_date: "2025-01-01", current_odometer: 0 } as Truck;
  // 600 mi on $360 closing Jan 20 2026 → $0.60/mi, well inside 90 days of `now`.
  const fuel = tankWindow(100000, 600, 360, "2026-01-20");

  it("load miles outside the fuel log do NOT dilute fuel $/mi (the 31¢-vs-68¢ bug)", () => {
    // A year of paid loads (12 × 500 = 6,000 mi) before fuel logging began.
    // The old math divided $360 by all 6,500 mi → ~$0.055/mi. The fuel rate
    // must stay the tank-window rate no matter how many miles predate the log.
    const yearOfLoads = Array.from({ length: 12 }, (_, i) =>
      load(`2025-${String(i + 1).padStart(2, "0")}-05`, `2025-${String(i + 1).padStart(2, "0")}-07`),
    );
    const m = run(truck, [...yearOfLoads, load("2026-01-05", "2026-01-07")], [], [], 0, fuel);
    expect(m.fuelPerMile).toBeCloseTo(0.6, 6);
    expect(m.costToRunPerMile).toBeCloseTo(0.6, 6); // no maint, no note
  });

  it("fuel windows older than 90 days → fuel and cost-to-run go null, MPG stays", () => {
    // Same window but closed 2025-10-01 — 123 days before `now` (2026-02-01).
    const stale = tankWindow(100000, 600, 360, "2025-10-01");
    const m = run(truck, [load("2026-01-05", "2026-01-07")], [], [], 1000, stale);
    expect(m.fuelPerMile).toBeNull();
    expect(m.costToRunPerMile).toBeNull(); // even with a note — fuel is unknown
    expect(m.avgMpg).not.toBeNull(); // lifetime MPG is mechanical, not priced
  });
});

describe("computeTruckMetrics — miles/month uses the operating window", () => {
  it("does NOT dilute the pace with dead pre-first-load calendar time", () => {
    // In service 8 months before `now`, but the first (and only) load is ~4 weeks
    // back. Pace must reflect the operating window (first load → now), not the raw
    // 8-month in-service span, or note-per-mile → cost-to-run inflates ~10x.
    const truck = { in_service_date: "2025-06-01", current_odometer: 0 } as Truck;
    const m = run(truck, [load("2026-01-05", "2026-01-07")], [], [], 1000);
    expect(m.windowDays).toBe(27); // 2026-01-05 → 2026-02-01
    // 500 mi ÷ (27 / 30.44) mo ≈ 564 mi/mo — NOT 500 ÷ 8mo ≈ 62 (the diluted bug).
    expect(m.milesPerMonth).toBeCloseTo(500 / (27 / 30.44), 1);
    expect(m.milesPerMonth!).toBeGreaterThan(400);
    // note/mi rides on the correct pace: 1000 ÷ ~564, not 1000 ÷ ~62.
    expect(m.notePerMile!).toBeLessThan(2);
  });
});

describe("computeTruckMetrics — loads hauled vs earned", () => {
  const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
  const unpaid = (pickup: string, delivery: string): Load =>
    ({ ...load(pickup, delivery), payment_status: "invoiced" }) as Load;

  it("counts loads HAULED as delivered — paid or not", () => {
    const loads = [
      load("2026-01-05", "2026-01-07"), // delivered + paid
      load("2026-01-10", "2026-01-12"), // delivered + paid
      unpaid("2026-01-15", "2026-01-17"), // delivered, NOT paid yet
    ];
    const m = run(truck, loads, []);
    expect(m.loads).toBe(3); // all three were hauled
    // Revenue still counts only the two paid loads.
    expect(m.netRevenue).toBeCloseTo(2000, 2); // 2 × $1000, not 3
  });

  it("excludes cancelled/booked/in-transit from loads hauled", () => {
    const loads = [
      load("2026-01-05", "2026-01-07"), // delivered
      { ...load("2026-01-10", "2026-01-12"), load_status: "cancelled" } as Load,
      { ...load("2026-01-15", "2026-01-17"), load_status: "booked" } as Load,
    ];
    expect(run(truck, loads, []).loads).toBe(1);
  });
});
