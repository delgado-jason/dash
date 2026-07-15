import { describe, it, expect } from "vitest";
import { loadTypeMix } from "./loadMix";
import type { Load } from "@/types/load";

const load = (load_type: string, load_status: string): Load =>
  ({ load_type, load_status }) as Load;

describe("loadTypeMix", () => {
  it("returns null pct and no specialist when there are no loads", () => {
    const mix = loadTypeMix([], "oversize");
    expect(mix.count).toBe(0);
    expect(mix.pct).toBeNull();
    expect(mix.specialist).toBe(false);
  });

  it("returns null pct when the driver has no delivered loads", () => {
    // booked/in-transit haven't happened yet — they don't form a denominator.
    const loads = [load("oversize", "booked"), load("oversize", "in_transit")];
    const mix = loadTypeMix(loads, "oversize");
    expect(mix.count).toBe(0);
    expect(mix.pct).toBeNull();
    expect(mix.specialist).toBe(false);
  });

  it("counts only delivered loads of the given type", () => {
    const loads = [
      load("oversize", "delivered"),
      load("oversize", "delivered"),
      load("oversize", "cancelled"), // excluded — didn't happen
      load("standard flatbed", "delivered"),
    ];
    const mix = loadTypeMix(loads, "oversize");
    expect(mix.count).toBe(2);
    expect(mix.pct).toBeCloseTo(2 / 3); // 2 oversize of 3 delivered
  });

  it("keeps oversize and heavy haul distinct", () => {
    const loads = [
      load("oversize", "delivered"),
      load("heavy haul", "delivered"),
      load("heavy haul", "delivered"),
    ];
    expect(loadTypeMix(loads, "oversize").count).toBe(1);
    expect(loadTypeMix(loads, "heavy haul").count).toBe(2);
  });

  it("flags specialist at >=40% and >=5 loads", () => {
    // 5 of 12 delivered = 41.7% → specialist
    const loads = [
      ...Array.from({ length: 5 }, () => load("oversize", "delivered")),
      ...Array.from({ length: 7 }, () => load("standard flatbed", "delivered")),
    ];
    const mix = loadTypeMix(loads, "oversize");
    expect(mix.pct).toBeCloseTo(5 / 12);
    expect(mix.specialist).toBe(true);
  });

  it("does not flag specialist below the 40% share even with 5 loads", () => {
    // 5 of 13 delivered = 38.5% → not a specialist
    const loads = [
      ...Array.from({ length: 5 }, () => load("oversize", "delivered")),
      ...Array.from({ length: 8 }, () => load("standard flatbed", "delivered")),
    ];
    const mix = loadTypeMix(loads, "oversize");
    expect(mix.specialist).toBe(false);
  });

  it("does not flag specialist below 5 loads even at a high share", () => {
    // 4 of 8 delivered = 50% but only 4 loads → not yet a specialist
    const loads = [
      ...Array.from({ length: 4 }, () => load("oversize", "delivered")),
      ...Array.from({ length: 4 }, () => load("standard flatbed", "delivered")),
    ];
    const mix = loadTypeMix(loads, "oversize");
    expect(mix.count).toBe(4);
    expect(mix.pct).toBeCloseTo(0.5);
    expect(mix.specialist).toBe(false);
  });
});
