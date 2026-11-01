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
    // The ledger starts at the trip; the hole opens AFTER it, between the
    // trip's end and the next load — squarely in audited territory.
    const gaps = odometerGaps([load(1440, 1500, "2026-07-08", "2026-07-10")], [trip(100, 200, "2026-07-03")]);
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
    const gaps = odometerGaps([load("500", "700"), load(null, 900)], [trip(100, 200), trip(760, 800)]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ fromOdo: 200, toOdo: 500 });
    expect(gaps[1]).toMatchObject({ fromOdo: 700, toOdo: 760 });
  });

  it("only audits from the earliest trip's odometer — pre-ledger history is quiet", () => {
    // Loads with holes all over January–June, but the first trip starts at
    // 5000: everything before it is pre-ledger and stays silent.
    const gaps = odometerGaps(
      [load(100, 200), load(900, 1200), load(4000, 4600), load(5100, 5300)],
      [trip(5000, 5100), trip(5400, 5500)],
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ fromOdo: 5300, toOdo: 5400, miles: 100 });
  });

  it("reports nothing when no trips exist — no ledger, nothing to audit", () => {
    expect(odometerGaps([load(100, 200), load(900, 1200)], [])).toEqual([]);
  });

  it("names the half-logged record sitting inside a gap — the usual explanation (load 1572011, Oct 1)", () => {
    const half = { ...load(606217, null, "2026-10-01", "2026-10-01"), load_number: "1572011" } as Load;
    const gaps = odometerGaps(
      [load(605222, 606217, "2026-09-29", "2026-10-01"), half, load(606428, 607330, "2026-10-02", "2026-10-05")],
      [trip(605000, 605222, "2026-09-28")],
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ miles: 211, fromOdo: 606217, toOdo: 606428 });
    expect(gaps[0].hints).toEqual([{ kind: "load", ref: "1572011", at: 606217, missing: "end" }]);
    // A fully logged ledger carries no hints.
    expect(odometerGaps([load(1440, 1500)], [trip(100, 200)])[0].hints).toEqual([]);
  });

  it("handles empty inputs", () => {
    expect(odometerGaps([], [])).toEqual([]);
  });
});
