import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import { gradeGrossPerDrivenMile, grossPerDrivenMile, loadDrivenMiles } from "./drivenRate";

const ladder: RateLadder = { walkAway: 4.0, minimum: 4.5, target: 5.0, strong: 6.0 };
const mk = (o: Record<string, unknown>): Load =>
  ({ load_status: "delivered", loaded_miles: 1000, deadhead_miles: 0, gross_revenue: "5000", odometer_start: null, odometer_end: null, ...o }) as unknown as Load;

describe("loadDrivenMiles", () => {
  it("the odometer window wins when both readings exist", () => {
    expect(loadDrivenMiles(mk({ odometer_start: 1000, odometer_end: 2300, deadhead_miles: 50 }))).toBe(1300);
  });
  it("else loaded + deadhead when the deadhead is known (zero is a real answer)", () => {
    expect(loadDrivenMiles(mk({ deadhead_miles: 200 }))).toBe(1200);
    expect(loadDrivenMiles(mk({ deadhead_miles: 0 }))).toBe(1000);
  });
  it("a null deadhead with no odometer is UNKNOWN, never zero-empty", () => {
    expect(loadDrivenMiles(mk({ deadhead_miles: null }))).toBeNull();
    expect(loadDrivenMiles(mk({ odometer_start: 5000, odometer_end: null, deadhead_miles: null }))).toBeNull();
  });
});

describe("grossPerDrivenMile", () => {
  it("Σ gross ÷ Σ driven, unknown loads left out and counted", () => {
    const r = grossPerDrivenMile([
      mk({ gross_revenue: "5000", deadhead_miles: 250 }), // 1250 driven
      mk({ gross_revenue: "5000", deadhead_miles: 0 }), // 1000 driven
      mk({ gross_revenue: "9999", deadhead_miles: null }), // unknown
    ]);
    expect(r.rpm).toBeCloseTo(10000 / 2250, 5);
    expect(r.counted).toBe(2);
    expect(r.unknown).toBe(1);
  });
  it("nothing known → null, not $0", () => {
    expect(grossPerDrivenMile([mk({ deadhead_miles: null })]).rpm).toBeNull();
    expect(grossPerDrivenMile([]).rpm).toBeNull();
  });
});

describe("gradeGrossPerDrivenMile", () => {
  it("grades on the booking ladder", () => {
    expect(gradeGrossPerDrivenMile([mk({ gross_revenue: "6500" })], ladder)).toBe("strong");
    expect(gradeGrossPerDrivenMile([mk({ gross_revenue: "5000" })], ladder)).toBe("target");
    expect(gradeGrossPerDrivenMile([mk({ gross_revenue: "4200" })], ladder)).toBe("minimum");
    expect(gradeGrossPerDrivenMile([mk({ gross_revenue: "3000" })], ladder)).toBe("below");
  });
  it("deadhead drags the grade: $5.00 loaded with 600 empty miles is $3.13 driven — below", () => {
    expect(gradeGrossPerDrivenMile([mk({ gross_revenue: "5000", deadhead_miles: 600 })], ladder)).toBe("below");
  });
  it("unknown driven miles or no ladder → no grade", () => {
    expect(gradeGrossPerDrivenMile([mk({ deadhead_miles: null })], ladder)).toBeNull();
    expect(gradeGrossPerDrivenMile([mk({})], null)).toBeNull();
  });
});
