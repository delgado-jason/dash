import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { computeTruckPatches, computeTruckMedals, truckRecords } from "./truckAwards";

const L = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    fuel_surcharge: "0",
    total_accessorials: "0",
    deadhead_miles: 0,
    ...o,
  }) as unknown as Load;

describe("computeTruckMedals", () => {
  it("tiers Mile Club on the odometer and adds Fuel Miser / Debt Crusher when present", () => {
    const m = computeTruckMedals({ odometer: 582_450, avgMpg: 7.1, deliveredCount: 47, loanPaidPct: 0.36, utilization: 0.82 });
    const byKey = Object.fromEntries(m.map((x) => [x.key, x]));
    expect(byKey["mile-club"].tier).toBe(3); // ≥500k
    expect(byKey["fuel-miser"].tier).toBe(2); // ≥7.0
    expect(byKey["workhorse"].tier).toBe(0); // 47 < 100
    expect(byKey["debt-crusher"].tier).toBe(1); // ≥25%
    expect(byKey["road-warrior"].tier).toBe(2); // ≥80%
  });

  it("omits Fuel Miser / Debt Crusher / Road Warrior when there's no data", () => {
    const keys = computeTruckMedals({ odometer: 0, avgMpg: null, deliveredCount: 0, loanPaidPct: null, utilization: null }).map((m) => m.key);
    expect(keys).not.toContain("fuel-miser");
    expect(keys).not.toContain("debt-crusher");
    expect(keys).not.toContain("road-warrior");
  });
});

describe("computeTruckPatches", () => {
  it("earns Marathon on a long haul against the floor", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", loaded_miles: 1500 }),
      L({ delivery_date: "2026-05-08", loaded_miles: 800 }),
    ];
    const p = computeTruckPatches(loads, []).find((x) => x.key === "marathon")!;
    expect(p.count).toBe(1); // only the 1,500-mi haul clears the 1,200 floor
    expect(p.hint).toContain("mi haul");
  });
});

describe("truckRecords", () => {
  it("reports the longest haul", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", loaded_miles: 1500 }),
      L({ delivery_date: "2026-05-08", loaded_miles: 1900 }),
    ];
    expect(truckRecords(loads, [] as FuelEntry[]).longestHaul).toBe(1900);
  });
});
