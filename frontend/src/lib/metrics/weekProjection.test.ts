import { describe, it, expect } from "vitest";
import { projectWeek } from "./weekProjection";
import type { Load } from "@/types/load";

// Minimal load shapes — only the fields the projection reads.
const mk = (over: Partial<Load>): Load =>
  ({
    load_status: "delivered",
    delivery_date: "2026-08-06",
    linehaul: "1000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as unknown as Load;

const WEEK_START = new Date("2026-08-05T00:00:00Z"); // Wednesday pay week

describe("projectWeek", () => {
  it("counts a delivered load exactly once (the double-count bug)", () => {
    const loads = [mk({ load_status: "delivered", delivery_date: "2026-08-06" })];
    const p = projectWeek(loads, WEEK_START);
    expect(p.earned).toBeGreaterThan(0);
    expect(p.incoming).toBe(0);
    expect(p.projected).toBe(p.earned);
  });

  it("adds an in-transit load delivering inside the window as incoming", () => {
    const loads = [
      mk({ load_status: "delivered", delivery_date: "2026-08-06" }),
      mk({ load_status: "in_transit", delivery_date: "2026-08-08" }),
    ];
    const p = projectWeek(loads, WEEK_START);
    expect(p.incomingCount).toBe(1);
    expect(p.projected).toBeCloseTo(p.earned + p.incoming);
  });

  it("excludes loads delivering after the pay week ends", () => {
    const loads = [
      mk({ load_status: "booked", delivery_date: "2026-08-12" }), // next week
    ];
    expect(projectWeek(loads, WEEK_START).projected).toBe(0);
  });

  it("excludes the day the next week starts (half-open window)", () => {
    const loads = [mk({ load_status: "booked", delivery_date: "2026-08-12" })];
    expect(projectWeek(loads, WEEK_START).incomingCount).toBe(0);
    const inWindow = [mk({ load_status: "booked", delivery_date: "2026-08-11" })];
    expect(projectWeek(inWindow, WEEK_START).incomingCount).toBe(1);
  });

  it("skips cancelled, tonu, and undated loads", () => {
    const loads = [
      mk({ load_status: "cancelled", delivery_date: "2026-08-06" }),
      mk({ load_status: "tonu", delivery_date: "2026-08-06" }),
      mk({ load_status: "booked", delivery_date: null }),
    ];
    expect(projectWeek(loads, WEEK_START).projected).toBe(0);
  });
});
