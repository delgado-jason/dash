import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import {
  hasOdometerWindow,
  loadTotalMiles,
  loadEmptyMiles,
  loadDeadheadPct,
  deadheadPctOver,
  emptyMilesOver,
} from "./deadhead";

// Only the fields the deadhead math reads.
const L = (o: Partial<Load>): Load =>
  ({
    load_status: "delivered",
    loaded_miles: 1000,
    odometer_start: 570000,
    odometer_end: 571200,
    ...o,
  }) as unknown as Load;

const T = (o: Partial<Trip>): Trip =>
  ({ odometer_start: 100, odometer_end: 500, ...o }) as unknown as Trip;

describe("per-load deadhead", () => {
  it("derives total, empty, and share from the odometer window", () => {
    const l = L({ loaded_miles: 1000, odometer_start: 570000, odometer_end: 571200 });
    expect(loadTotalMiles(l)).toBe(1200);
    expect(loadEmptyMiles(l)).toBe(200);
    expect(loadDeadheadPct(l)).toBeCloseTo(200 / 1200, 6);
  });

  // The whole point of the consolidation: the hand-entered field is a planning
  // estimate and must never stand in for what the truck actually ran.
  it("ignores the deadhead_miles field entirely", () => {
    const l = L({
      loaded_miles: 1000,
      odometer_start: 570000,
      odometer_end: 571200,
      deadhead_miles: 999,
    });
    expect(loadEmptyMiles(l)).toBe(200); // not 999
  });

  it("returns null — never 0 — when the odometer window is missing", () => {
    const noStart = L({ odometer_start: null, deadhead_miles: 100 });
    const noEnd = L({ odometer_end: null, deadhead_miles: 100 });
    for (const l of [noStart, noEnd]) {
      expect(hasOdometerWindow(l)).toBe(false);
      expect(loadTotalMiles(l)).toBeNull();
      expect(loadEmptyMiles(l)).toBeNull();
      expect(loadDeadheadPct(l)).toBeNull();
    }
  });

  it("doesn't count a load that hasn't delivered yet", () => {
    expect(hasOdometerWindow(L({ load_status: "in_transit" }))).toBe(false);
    expect(loadDeadheadPct(L({ load_status: "booked" }))).toBeNull();
  });
});

describe("deadheadPctOver", () => {
  it("aggregates across loads: total run minus total loaded", () => {
    const loads = [
      L({ loaded_miles: 1000, odometer_start: 570000, odometer_end: 571200 }),
      L({ loaded_miles: 800, odometer_start: 572000, odometer_end: 573100 }),
    ];
    // 2,300 run, 1,800 loaded → 500 empty
    expect(deadheadPctOver(loads)).toBeCloseTo(500 / 2300, 6);
    expect(emptyMilesOver(loads)).toBe(500);
  });

  it("counts a non-revenue trip as fully empty", () => {
    const loads = [L({ loaded_miles: 1000, odometer_start: 570000, odometer_end: 571100 })];
    const trips = [T({ odometer_start: 571100, odometer_end: 571500 })]; // 400 mi home
    // 1,500 run, 1,000 loaded → 500 empty
    expect(deadheadPctOver(loads, trips)).toBeCloseTo(500 / 1500, 6);
    expect(emptyMilesOver(loads, trips)).toBe(500);
  });

  it("skips loads and trips with no usable window rather than treating them as zero", () => {
    const loads = [
      L({ loaded_miles: 1000, odometer_start: 570000, odometer_end: 571200 }),
      L({ loaded_miles: 5000, odometer_start: null, odometer_end: null }),
    ];
    const trips = [T({ odometer_start: null, odometer_end: null })];
    expect(deadheadPctOver(loads, trips)).toBeCloseTo(200 / 1200, 6);
  });

  it("returns null when nothing measurable is in the set", () => {
    expect(deadheadPctOver([], [])).toBeNull();
    expect(deadheadPctOver([L({ odometer_start: null })], [])).toBeNull();
    expect(emptyMilesOver([], [])).toBeNull();
  });

  it("can exceed nothing and stay sane on a trips-only window", () => {
    // A week with no freight at all — every mile ran empty.
    expect(deadheadPctOver([], [T({ odometer_start: 0, odometer_end: 300 })])).toBe(1);
  });
});
