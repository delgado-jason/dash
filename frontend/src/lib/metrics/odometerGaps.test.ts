import { describe, it, expect } from "vitest";
import { odometerGaps } from "./odometerGaps";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// Minimal shapes — the helper only touches odometers and dates.
const load = (s: number | string | null, e: number | string | null, pu = "2026-07-01", del = "2026-07-03") =>
  ({ odometer_start: s, odometer_end: e, pickup_date: pu, delivery_date: del }) as unknown as Load;
const trip = (s: number | null, e: number | null, d = "2026-07-05") =>
  ({ odometer_start: s, odometer_end: e, trip_date: d }) as unknown as Trip;

describe("odometerGaps", () => {
  it("finds no gaps when windows tile", () => {
    expect(odometerGaps([load(100, 200)], [trip(200, 260)])).toEqual([]);
  });

  it("surfaces a real hole with its edges and dates", () => {
    const gaps = odometerGaps([load(100, 200, "2026-07-01", "2026-07-03")], [trip(1440, 1500, "2026-07-08")]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      miles: 1240,
      fromOdo: 200,
      toOdo: 1440,
      fromDate: "2026-07-03",
      toDate: "2026-07-08",
    });
  });

  it("ignores sub-threshold noise", () => {
    expect(odometerGaps([load(100, 200)], [trip(210, 300)])).toEqual([]);
  });

  it("coalesces overlapping windows before measuring", () => {
    // Trip inside the load's window must not create a phantom gap after it.
    const gaps = odometerGaps([load(100, 500)], [trip(150, 220), trip(560, 600)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].fromOdo).toBe(500);
    expect(gaps[0].miles).toBe(60);
  });

  it("coerces numeric strings and drops half-windows", () => {
    const gaps = odometerGaps([load("100", "200"), load(null, 900)], [trip(700, 800)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ fromOdo: 200, toOdo: 700 });
  });

  it("handles empty inputs", () => {
    expect(odometerGaps([], [])).toEqual([]);
  });
});
