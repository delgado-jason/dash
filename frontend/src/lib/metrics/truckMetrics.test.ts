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
const run = (truck: Truck, loads: Load[], homeDays: string[]) =>
  computeTruckMetrics(truck, loads, [] as FuelEntry[], [] as MaintenanceService[], now, homeDays);

describe("computeTruckMetrics — days-based utilization", () => {
  it("is under-load days ÷ window days, split into under-load / home / idle", () => {
    const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
    const loads = [
      load("2026-01-05", "2026-01-07"), // 3 under-load days
      load("2026-01-10", "2026-01-10"), // 1 under-load day
    ];
    const m = run(truck, loads, ["2026-01-15"]); // 1 home day, not under load

    // window starts at the first pickup (later than in-service), runs to now.
    expect(m.windowDays).toBe(27); // 2026-01-05 → 2026-02-01
    expect(m.underLoadDays).toBe(4);
    expect(m.homeDays).toBe(1);
    expect(m.idleDays).toBe(22);
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

  it("does not count a home day that was also under a load", () => {
    const truck = { in_service_date: "2026-01-01", current_odometer: 0 } as Truck;
    const loads = [load("2026-01-05", "2026-01-07")];
    const m = run(truck, loads, ["2026-01-06"]); // home marked mid-haul
    expect(m.homeDays).toBe(0); // 01-06 is under load, not a home gap
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
