import { describe, it, expect } from "vitest";
import { estimateLoadFuel, ASSUMED_MPG, ASSUMED_FUEL_PRICE } from "./fuel";

describe("estimateLoadFuel", () => {
  it("estimates from loaded + deadhead miles when odometer is missing", () => {
    const f = estimateLoadFuel({ loaded_miles: 1000, deadhead_miles: 100 });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(1100);
    expect(f?.gallons).toBeCloseTo(1100 / ASSUMED_MPG);
    expect(f?.cost).toBeCloseTo((1100 / ASSUMED_MPG) * ASSUMED_FUEL_PRICE);
  });

  it("estimates from loaded miles alone when there's no deadhead", () => {
    const f = estimateLoadFuel({ loaded_miles: 800, deadhead_miles: null });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(800);
  });

  it("uses actual odometer miles once both readings are present", () => {
    const f = estimateLoadFuel({
      loaded_miles: 1000,
      deadhead_miles: 100,
      odometer_start: 568000,
      odometer_end: 569200,
    });
    expect(f?.basis).toBe("actual");
    expect(f?.miles).toBe(1200);
  });

  it("falls back to estimate when odometer_end is not greater than start", () => {
    const f = estimateLoadFuel({
      loaded_miles: 500,
      deadhead_miles: 0,
      odometer_start: 569000,
      odometer_end: 569000,
    });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(500);
  });

  it("returns null when there are no miles to work with", () => {
    expect(estimateLoadFuel({ loaded_miles: 0, deadhead_miles: 0 })).toBeNull();
    expect(estimateLoadFuel({ loaded_miles: null, deadhead_miles: null })).toBeNull();
  });
});
